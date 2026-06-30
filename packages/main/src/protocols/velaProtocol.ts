import { app, net, protocol, type Session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCspHeader } from '../security/csp';
import { syncEvents } from '../sync/syncEvents';
import { certEvents } from '../security/certEvents';

const ALLOWED_PAGES = ['settings', 'newtab', 'history', 'extensions', 'about', 'reader', 'filepicker', 'glance', 'media-popup', 'cookiepanel', 'favorites', 'anchors', 'adblocker-panel', 'vault-save-modal', 'vault-autofill-modal', 'passwords', 'scripts', 'security-popup', 'notification-permission', 'devmode-popup', 'devtools-eyedropper', 'suggestions-popup', 'workspace-dropdown', 'profile-dropdown', 'vela-menu', 'sidebar-floating', 'add-node-menu', 'downloads', 'download-popup', 'tab-preview', 'folder-view', 'analytics-debugger', 'tools-cluster', 'status-cluster', 'find-bar', 'cert-error', 'translate-result', 'translate-confirm', 'media-permission-popup'] as const;
type InternalPage = (typeof ALLOWED_PAGES)[number];

const VITE_DEV_URL = process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173';

async function handleVelaRequest(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const page = reqUrl.hostname;

  // Deep-link de callback del servidor de sync (vela://sync-callback?token=X).
  // El servidor de sync redirige aquí tras verificar el magic link. Emitimos
  // el token en syncEvents para que registerSyncHandlers lo reenvíe al renderer.
  if (page === 'sync-callback') {
    const token = reqUrl.searchParams.get('token') ?? '';
    if (token) {
      syncEvents.emit('callback:sync', { token });
    }
    return new Response(
      '<html><body style="font-family:sans-serif;text-align:center;padding:2rem">' +
      '<h2>Vuelve a Vela para continuar</h2>' +
      '<p>Autenticación completada. Puedes cerrar esta ventana.</p>' +
      '</body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  // Acción de continuar pese al error de certificado: el usuario lo acepta desde
  // vela://cert-error navegando a esta URL (no necesita preload/IPC).
  if (page === 'cert-proceed') {
    const fingerprint = reqUrl.searchParams.get('fingerprint') ?? '';
    const url = reqUrl.searchParams.get('url') ?? '';
    const wcId = parseInt(reqUrl.searchParams.get('wcId') ?? '0', 10);
    if (fingerprint && url && wcId) {
      certEvents.emit('proceed', { fingerprint, url, wcId });
    }
    return new Response(
      '<html><body style="background:#0e0f12"></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  // Acción de volver desde la página de error de certificado.
  if (page === 'cert-back') {
    const wcId = parseInt(reqUrl.searchParams.get('wcId') ?? '0', 10);
    if (wcId) certEvents.emit('back', { wcId });
    return new Response(
      '<html><body style="background:#0e0f12"></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  if (!(ALLOWED_PAGES as readonly string[]).includes(page)) {
    return new Response('Not Found', { status: 404 });
  }

  const isDev = !app.isPackaged;

  let upstream: Response;

  if (isDev) {
    // En dev: proxy al servidor Vite. El path raíz carga el index.html de la
    // página; cualquier otro path (scripts, assets, HMR) se reenvía directamente
    // a Vite. Esto permite que los módulos JS y el HMR funcionen correctamente
    // cuando la página se sirve bajo el esquema vela://.
    const isRoot = reqUrl.pathname === '/' || reqUrl.pathname === '';
    const vitePath = isRoot
      ? `/src/pages/${page}/index.html`
      : reqUrl.pathname + reqUrl.search;
    upstream = await net.fetch(`${VITE_DEV_URL}${vitePath}`);
  } else {
    // En prod: servir los assets desde el ASAR.
    // Las páginas usan base './' → los assets se referencian como rutas relativas
    // (p.ej. '../../assets/index-abc.js'). El navegador las resuelve contra la
    // URL de la página (vela://page/) y pide vela://page/assets/index-abc.js.
    // Por tanto, para la raíz servimos el index.html de la página; para
    // cualquier otro path servimos el fichero real desde dist/.
    const distRoot = path.join(__dirname, '../../renderer/dist');
    const isRoot = reqUrl.pathname === '/' || reqUrl.pathname === '';
    const filePath = isRoot
      ? path.join(distRoot, 'src/pages', page, 'index.html')
      : path.join(distRoot, reqUrl.pathname);
    upstream = await net.fetch(pathToFileURL(filePath).toString());
  }

  const cspHeader = buildCspHeader(isDev);
  const headers = new Headers(upstream.headers);
  headers.set('Content-Security-Policy', cspHeader);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');

  if (!isDev) {
    headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=(), usb=(), bluetooth=()');
    // COEP/COOP mejoran el aislamiento del proceso en prod. Si rompen la carga
    // de recursos externos (favicons, artwork multimedia) cambiar COEP a
    // 'unsafe-none' y documentar el ajuste aquí.
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

// Sesiones donde el protocolo ya está registrado (evita registro duplicado).
const registeredSessions = new WeakSet<Session>();

export function registerVelaProtocol(): void {
  protocol.handle('vela', handleVelaRequest);
}

/**
 * Registra el protocolo vela: en una sesión particionada específica.
 * Llamar desde spawnView justo después de crear la WebContentsView para que
 * las pestañas del perfil puedan cargar páginas vela://.
 */
export function ensureVelaProtocolOnSession(ses: Session): void {
  if (registeredSessions.has(ses)) return;
  registeredSessions.add(ses);
  ses.protocol.handle('vela', handleVelaRequest);
}
