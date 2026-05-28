import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ipcMain, BrowserWindow } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcResponse,
  type AnalyticsHit,
  type AnalyticsProvider,
} from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext, resolveWindowId } from './helpers';
import { guardTrustedFrame } from './validate';
import { mapError } from './errors';

// ─── URL patterns para session.webRequest ────────────────────────────────────
// Electron usa glob-style patterns de Chromium: *://host/path
const ANALYTICS_URL_PATTERNS = [
  // GA4 — collect
  '*://google-analytics.com/g/collect*',
  '*://*.google-analytics.com/g/collect*',
  '*://analytics.google.com/g/collect*',
  '*://*.analytics.google.com/g/collect*',
  '*://google-analytics.com/mp/collect*',
  '*://*.google-analytics.com/mp/collect*',
  // GTM — carga de scripts
  '*://googletagmanager.com/gtm.js*',
  '*://*.googletagmanager.com/gtm.js*',
  '*://googletagmanager.com/gtag/js*',
  '*://*.googletagmanager.com/gtag/js*',
  // Facebook / Meta Pixel
  '*://facebook.com/tr*',
  '*://*.facebook.com/tr*',
  // TikTok
  '*://analytics.tiktok.com/api/*',
  '*://*.analytics.tiktok.com/api/*',
  // LinkedIn Insight
  '*://px.ads.linkedin.com/*',
  // Pinterest
  '*://ct.pinterest.com/*',
  '*://*.ct.pinterest.com/*',
  // Mixpanel
  '*://api.mixpanel.com/track*',
  '*://api2.mixpanel.com/track*',
  // Segment
  '*://api.segment.io/v1/*',
  // Amplitude
  '*://api.amplitude.com/2/*',
  '*://api2.amplitude.com/2/*',
  // Hotjar
  '*://hscollect.hotjar.com/*',
  '*://*.hscollect.hotjar.com/*',
  // Google Ads / DoubleClick
  '*://googleads.g.doubleclick.net/*',
  '*://www.googleadservices.com/pagead/*',
];

// ─── Reglas de detección ──────────────────────────────────────────────────────

interface AnalyticsRule {
  pattern: RegExp;
  provider: AnalyticsProvider;
  parseLabel: (url: URL) => string;
  parseParams: (url: URL) => Record<string, string>;
}

function urlParams(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { out[k] = v; });
  return out;
}

const RULES: AnalyticsRule[] = [
  {
    pattern: /google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/,
    provider: 'ga4',
    parseLabel: (u) => u.searchParams.get('en') ?? 'hit',
    parseParams: urlParams,
  },
  {
    pattern: /google-analytics\.com\/mp\/collect|analytics\.google\.com\/mp\/collect/,
    provider: 'ga4',
    parseLabel: () => 'mp:hit',
    parseParams: urlParams,
  },
  {
    pattern: /googletagmanager\.com\/gtm\.js/,
    provider: 'gtm',
    parseLabel: () => 'gtm.js',
    parseParams: urlParams,
  },
  {
    pattern: /googletagmanager\.com\/gtag\/js/,
    provider: 'gtm',
    parseLabel: () => 'gtag.js',
    parseParams: urlParams,
  },
  {
    pattern: /facebook\.com\/tr\b/,
    provider: 'fb-pixel',
    parseLabel: (u) => u.searchParams.get('ev') ?? 'event',
    parseParams: urlParams,
  },
  {
    pattern: /analytics\.tiktok\.com/,
    provider: 'tiktok',
    parseLabel: () => 'event',
    parseParams: urlParams,
  },
  {
    pattern: /px\.ads\.linkedin\.com/,
    provider: 'linkedin',
    parseLabel: () => 'event',
    parseParams: urlParams,
  },
  {
    pattern: /ct\.pinterest\.com/,
    provider: 'pinterest',
    parseLabel: () => 'event',
    parseParams: urlParams,
  },
  {
    pattern: /api\.mixpanel\.com\/track|api2\.mixpanel\.com\/track/,
    provider: 'mixpanel',
    parseLabel: (u) => {
      try {
        const data = u.searchParams.get('data');
        if (data) {
          const decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as { event?: string };
          return decoded.event ?? 'track';
        }
      } catch { /* noop */ }
      return 'track';
    },
    parseParams: urlParams,
  },
  {
    pattern: /api\.segment\.io\/v1/,
    provider: 'segment',
    parseLabel: () => 'event',
    parseParams: urlParams,
  },
  {
    pattern: /api\.amplitude\.com\/2|api2\.amplitude\.com\/2/,
    provider: 'amplitude',
    parseLabel: () => 'event',
    parseParams: urlParams,
  },
  {
    pattern: /hscollect\.hotjar\.com/,
    provider: 'hotjar',
    parseLabel: () => 'event',
    parseParams: urlParams,
  },
  {
    pattern: /googleads\.g\.doubleclick\.net|googleadservices\.com\/pagead/,
    provider: 'google-ads',
    parseLabel: () => 'conversion',
    parseParams: urlParams,
  },
];

function dlPushLabel(raw: unknown): string {
  if (Array.isArray(raw)) return typeof raw[0] === 'string' && raw[0] ? raw[0] : '(array)';
  if (raw !== null && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    if (typeof data.event === 'string' && data.event) return data.event;
    if ('ecommerce' in data) return '(ecommerce)';
    const keys = Object.keys(data).filter((k) => !k.startsWith('gtm.'));
    if (keys.length > 0) return `(${keys.slice(0, 3).join(', ')})`;
  }
  return '(push)';
}

function detectHit(rawUrl: string, method: string, statusCode: number): AnalyticsHit | null {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }

  for (const rule of RULES) {
    if (!rule.pattern.test(rawUrl)) continue;
    let label = 'event';
    let params: Record<string, string> = {};
    try { label = rule.parseLabel(url); } catch { /* noop */ }
    try { params = rule.parseParams(url); } catch { /* noop */ }
    return {
      id: randomUUID(),
      timestamp: Date.now(),
      provider: rule.provider,
      label,
      url: rawUrl,
      method,
      statusCode,
      params,
    };
  }
  return null;
}

// ─── Estado del módulo ────────────────────────────────────────────────────────

const PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');
const PANEL_WIDTH = 960;
const PANEL_HEIGHT = 600;

// parentWindowId → open debugger BrowserWindow
const debuggerWindows = new Map<number, BrowserWindow>();

// profileId → set of parentWindowIds con debugger abierto
const profileDebuggers = new Map<string, Set<number>>();

// profileId → listener registrado
const activeListeners = new Set<string>();

// parentWindowId → buffer de hits capturados (máx. 500 por ventana)
const hitBuffers = new Map<number, AnalyticsHit[]>();
const MAX_BUFFER = 500;

// profileId → cuerpos POST de GA4 capturados antes de que llegue onCompleted
// Se correlan por pathname de URL + ventana de 5s
interface PendingBody { urlPath: string; params: Record<string, string>; ts: number }
const pendingNetBodies = new Map<string, PendingBody[]>();

function popPendingBody(profileId: string, urlPath: string): Record<string, string> | null {
  const list = pendingNetBodies.get(profileId);
  if (!list) return null;
  const now = Date.now();
  const idx = list.findIndex((p) => p.urlPath === urlPath && now - p.ts < 5000);
  if (idx === -1) return null;
  const [entry] = list.splice(idx, 1);
  return entry?.params ?? null;
}

function getPreload(): string | undefined {
  return fs.existsSync(PRELOAD_PATH) ? PRELOAD_PATH : undefined;
}

function pushHit(hit: AnalyticsHit, profileId: string): void {
  const windows = profileDebuggers.get(profileId);
  if (!windows || windows.size === 0) return;
  for (const parentWindowId of windows) {
    const buf = hitBuffers.get(parentWindowId) ?? [];
    buf.push(hit);
    if (buf.length > MAX_BUFFER) buf.shift();
    hitBuffers.set(parentWindowId, buf);

    const dwin = debuggerWindows.get(parentWindowId);
    if (dwin && !dwin.isDestroyed()) {
      dwin.webContents.send(IPC_EVENTS.ANALYTICS_DEBUGGER_HIT, { hit });
    }
  }
}

function attachListener(profileId: string, ctx: IpcContext): void {
  if (activeListeners.has(profileId)) return;
  activeListeners.add(profileId);
  let sess: ReturnType<typeof ctx.profileManager.getSession>;
  try { sess = ctx.profileManager.getSession(profileId); } catch { return; }
  sess.webRequest.onCompleted(
    { urls: ANALYTICS_URL_PATTERNS },
    (details) => {
      const hit = detectHit(details.url, details.method, details.statusCode);
      if (!hit) return;
      // Para POST requests: enriquecer con los params del cuerpo capturados por el preload
      if (details.method === 'POST') {
        try {
          const urlPath = new URL(details.url).pathname;
          const bodyParams = popPendingBody(profileId, urlPath);
          if (bodyParams && Object.keys(bodyParams).length) {
            hit.params = { ...hit.params, ...bodyParams };
            if (bodyParams.en) hit.label = bodyParams.en;
          }
        } catch { /* noop */ }
      }
      pushHit(hit, profileId);
    },
  );
}

function detachListener(profileId: string, ctx: IpcContext): void {
  if (!activeListeners.has(profileId)) return;
  activeListeners.delete(profileId);
  try {
    const sess = ctx.profileManager.getSession(profileId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sess.webRequest.onCompleted(null as any);
  } catch { /* noop */ }
}

// ─── Handlers IPC ─────────────────────────────────────────────────────────────

export function registerAnalyticsDebuggerHandlers(ctx: IpcContext): void {

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_DEBUGGER_OPEN,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ANALYTICS_DEBUGGER_OPEN);
        const { profileId, repos } = getFrameContext(event, ctx);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };

        // Respetar el aparejo: si está arriado, no abrir
        const raw = repos.settings.get('aparejo:analytics-debugger:enabled');
        const isEnabled = raw === null ? true : JSON.parse(raw) as boolean;
        if (!isEnabled) return { ok: true, data: undefined };

        // Toggle: cierra si ya estaba abierto
        const existing = debuggerWindows.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const preload = getPreload();
        const win = new BrowserWindow({
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
          minWidth: 620,
          minHeight: 400,
          frame: false,
          resizable: true,
          alwaysOnTop: false,
          skipTaskbar: false,
          show: false,
          backgroundColor: '#1c1f26',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            ...(preload ? { preload } : {}),
          },
        });

        debuggerWindows.set(parentWindowId, win);
        if (!profileDebuggers.has(profileId)) profileDebuggers.set(profileId, new Set());
        profileDebuggers.get(profileId)!.add(parentWindowId);
        hitBuffers.set(parentWindowId, []);
        ctx.profileWindowManager.registerAuxiliaryWindow(win.id, profileId);

        attachListener(profileId, ctx);

        win.on('closed', () => {
          ctx.profileWindowManager.unregisterAuxiliaryWindow(win.id);
          debuggerWindows.delete(parentWindowId);
          hitBuffers.delete(parentWindowId);
          const set = profileDebuggers.get(profileId);
          if (set) {
            set.delete(parentWindowId);
            if (set.size === 0) {
              profileDebuggers.delete(profileId);
              detachListener(profileId, ctx);
            }
          }
        });

        const pageUrl = new URL('vela://analytics-debugger');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        await win.loadURL(pageUrl.toString());
        win.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ANALYTICS_DEBUGGER_OPEN);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_DEBUGGER_CLOSE,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ANALYTICS_DEBUGGER_CLOSE);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId !== null) {
          const win = debuggerWindows.get(parentWindowId);
          if (win && !win.isDestroyed()) win.close();
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ANALYTICS_DEBUGGER_CLOSE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_DEBUGGER_CLEAR,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ANALYTICS_DEBUGGER_CLEAR);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId !== null) hitBuffers.set(parentWindowId, []);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ANALYTICS_DEBUGGER_CLEAR);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_DEBUGGER_GET_EVENTS,
    async (event): Promise<IpcResponse<AnalyticsHit[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ANALYTICS_DEBUGGER_GET_EVENTS);
        const parentWindowId = resolveWindowId(event);
        const hits = parentWindowId !== null ? (hitBuffers.get(parentWindowId) ?? []) : [];
        return { ok: true, data: hits };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ANALYTICS_DEBUGGER_GET_EVENTS);
      }
    },
  );

  // Recibe pushes de window.dataLayer desde el preload de cualquier web tab.
  ipcMain.on(IPC_CHANNELS.ANALYTICS_DEBUGGER_DATALAYER_PUSH, (event, rawData: unknown) => {
    if (profileDebuggers.size === 0) return;
    const senderSession = event.sender.session;
    for (const [profileId] of profileDebuggers) {
      let sess: ReturnType<typeof ctx.profileManager.getSession> | undefined;
      try { sess = ctx.profileManager.getSession(profileId); } catch { continue; }
      if (senderSession !== sess) continue;
      const hit: AnalyticsHit = {
        id: randomUUID(),
        timestamp: Date.now(),
        provider: 'datalayer',
        label: dlPushLabel(rawData),
        url: event.sender.getURL(),
        method: 'JS',
        statusCode: null,
        params: {},
        rawData,
      };
      pushHit(hit, profileId);
      return;
    }
  });

  // Recibe el cuerpo POST de llamadas GA4 interceptadas por fetch/sendBeacon.
  // Se almacena en pendingNetBodies hasta que onCompleted correlacione el hit.
  ipcMain.on(IPC_CHANNELS.ANALYTICS_DEBUGGER_NET_BODY, (event, payload: unknown) => {
    if (profileDebuggers.size === 0) return;
    const senderSession = event.sender.session;
    for (const [profileId] of profileDebuggers) {
      let sess: ReturnType<typeof ctx.profileManager.getSession> | undefined;
      try { sess = ctx.profileManager.getSession(profileId); } catch { continue; }
      if (senderSession !== sess) continue;
      if (!payload || typeof payload !== 'object') return;
      const { url, params } = payload as { url?: string; params?: Record<string, string> };
      if (!url || !params) return;
      try {
        const urlPath = new URL(url).pathname;
        const list = pendingNetBodies.get(profileId) ?? [];
        list.push({ urlPath, params, ts: Date.now() });
        // Limitar a 50 entradas por si onCompleted no llega
        if (list.length > 50) list.shift();
        pendingNetBodies.set(profileId, list);
      } catch { /* noop */ }
      return;
    }
  });
}
