import { app, BrowserWindow, type Certificate, type Session, type WebContents } from 'electron';
import { IPC_EVENTS, type ClientCertificateInfo, type ClientCertRememberedChoice } from '@vela/shared';
import type { Logger } from '../logger';
import type { MainEventBus } from '../ipc/events';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { ProfileWindowManager } from '../profiles/ProfileWindowManager';
import type { TabManager } from '../tabs/TabManager';
import { createPopupWindow, centerOverWindow, applyGlassUrlParams, type GlassParams } from '../ipc/popupUtils';
import { ClientCertRequestQueue } from './clientCertQueue';

const CHOICES_KEY = 'client-cert:choices';
const POPUP_WIDTH = 380;
const POPUP_HEIGHT_BASE = 160;
const POPUP_ROW_HEIGHT = 64;
const POPUP_HEIGHT_MAX = 480;

interface StoredChoice {
  origin: string;
  fingerprint: string;
  subject: string;
  chosenAt: number;
}

/** Dónde mostrar el selector y a qué perfil pertenece la petición. */
interface RequestContext {
  /** Ventana sobre la que se abre el selector: la pestaña o la emergente que pidió el certificado. */
  parentWindowId: number;
  profileId: string;
}

export interface ClientCertificateManagerCtx {
  tabManager: TabManager;
  profileManager: ProfileManager;
  profileWindowManager: ProfileWindowManager;
  events: MainEventBus;
  logger: Logger;
}

function originOf(url: string): string | null {
  try {
    const o = new URL(url).origin;
    return o && o !== 'null' ? o : null;
  } catch {
    return null;
  }
}

function hostnameOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

function toInfo(cert: Certificate): ClientCertificateInfo {
  return {
    fingerprint: cert.fingerprint,
    subject: cert.subjectName,
    issuer: cert.issuerName,
    ...(cert.validStart ? { validStart: cert.validStart } : {}),
    ...(cert.validExpiry ? { validExpiry: cert.validExpiry } : {}),
  };
}

/** Electron no tolera que el callback se llame dos veces; esto lo garantiza. */
function once(callback: (certificate?: Certificate) => void): (certificate?: Certificate) => void {
  let called = false;
  return (certificate) => {
    if (called) return;
    called = true;
    callback(certificate);
  };
}

type SettingsRepo = { get(key: string): string | null | undefined; set(key: string, value: string): void };

function readGlass(repos: { settings: SettingsRepo }): GlassParams | null {
  if (repos.settings.get('ui:glassmorphism') !== 'true') return null;
  const intensity = Number(repos.settings.get('ui:glassmorphism-intensity') ?? 60);
  const opacity = Number(repos.settings.get('ui:glassmorphism-opacity') ?? 60);
  return {
    blurPx: Math.round(16 + (intensity / 100) * 8),
    bgOpacity: parseFloat((0.20 + (opacity / 100) * 0.65).toFixed(2)),
  };
}

/**
 * Autenticación mTLS: cuando un sitio pide un certificado cliente
 * (`app.on('select-client-certificate')`), Electron ya rellena
 * `certificateList` desde el almacén de certificados del SO (incluye DNIe/
 * tarjetas criptográficas si su middleware está instalado y registra el
 * certificado en el almacén personal de Windows). Este manager decide si
 * responde automáticamente con una elección recordada, o abre un popup
 * modal para que el usuario elija.
 *
 * Electron solo emite el evento si hay al menos un candidato: sin
 * certificados válidos para el sitio, Chromium sigue sin certificado y aquí
 * no llega nada.
 *
 * Toda respuesta sin certificado deja a Chromium recordando «sin certificado»
 * para ese host durante la sesión, así que nunca se cancela una petición salvo
 * que el usuario lo decida o no haya a quién preguntar.
 */
export class ClientCertificateManager {
  private readonly queue = new ClientCertRequestQueue<Certificate>();
  // wcId → contexto de la petición (ventana del selector y perfil).
  private readonly contextByWc = new Map<number, RequestContext>();
  // wcId → selector actualmente mostrado para ese WebContents.
  private readonly popupsByWc = new Map<number, BrowserWindow>();
  // WebContents a los que ya se ha enganchado el aviso de 'destroyed'.
  private readonly watchedWc = new Set<number>();

  constructor(private readonly ctx: ClientCertificateManagerCtx) {
    app.on('select-client-certificate', (event, webContents, url, certificateList, callback) => {
      event.preventDefault();
      const respond = once(callback);
      try {
        this.handleRequest(webContents, url, certificateList, respond);
      } catch (err) {
        // Nada de lo que ocurra aquí puede escapar: una excepción en un
        // listener de `app` no la captura nadie y tumbaría el proceso main
        // (Vela se cerraría entera sin dejar traza).
        this.ctx.logger.error(`[client-cert] fallo gestionando la petición de ${url}:`, err);
        try { respond(); } catch { /* wc puede estar destruido */ }
      }
    });
  }

  /**
   * Pestaña, ventana emergente abierta desde una pestaña (window.open: accesos
   * con certificado de las sedes electrónicas, OAuth…) o, en último recurso,
   * cualquier ventana cuya sesión sea la de un perfil abierto.
   */
  private resolveContext(wc: WebContents): RequestContext | null {
    const ownWin = BrowserWindow.fromWebContents(wc);
    // `fromWebContents` devuelve también la ventana dueña de un WCV de pestaña:
    // solo es la ventana propia del WebContents si es su webContents principal.
    const isOwnWindow = ownWin !== null && !ownWin.isDestroyed() && ownWin.webContents.id === wc.id;

    const tabId = this.ctx.tabManager.getTabIdForWebContents(wc.id)
      ?? this.ctx.tabManager.getOwnerTabForPopup(wc.id);
    if (tabId) {
      const windowId = this.ctx.tabManager.getWindowIdForTab(tabId);
      const profileId = windowId !== null ? this.ctx.profileWindowManager.getProfileForWindow(windowId) : null;
      if (windowId !== null && profileId) {
        // El selector va sobre la ventana que el usuario está mirando.
        return { parentWindowId: isOwnWindow ? ownWin.id : windowId, profileId };
      }
    }

    if (isOwnWindow) {
      const profileId = this.profileForSession(wc.session);
      if (profileId) return { parentWindowId: ownWin.id, profileId };
    }
    return null;
  }

  private profileForSession(ses: Session): string | null {
    for (const profileId of this.ctx.profileManager.getOpenProfileIds()) {
      try {
        if (this.ctx.profileManager.getSession(profileId) === ses) return profileId;
      } catch { /* perfil cerrándose */ }
    }
    return null;
  }

  private handleRequest(
    wc: WebContents,
    url: string,
    certificateList: Certificate[],
    respond: (certificate?: Certificate) => void,
  ): void {
    const wcId = wc.id;
    const origin = originOf(url);
    const context = origin ? this.resolveContext(wc) : null;
    if (!origin || !context) {
      this.ctx.logger.warn(
        `[client-cert] petición sin pestaña/perfil resoluble (wc=${wcId}, url=${url}); cancelada`,
      );
      respond();
      return;
    }
    const { parentWindowId, profileId } = context;
    const isPopup = this.ctx.tabManager.getTabIdForWebContents(wcId) === null;
    this.ctx.logger.info(
      `[client-cert] ${origin} pide certificado: ${certificateList.length} candidato(s) ` +
      `(wc=${wcId}, ventana=${parentWindowId}, perfil=${profileId}${isPopup ? ', ventana emergente' : ''})`,
    );

    // Un fallo leyendo o limpiando la elección recordada no debe impedir que
    // se pregunte al usuario: se registra y se sigue al selector.
    try {
      const remembered = this.loadChoices(profileId).find((c) => c.origin === origin);
      if (remembered) {
        const match = certificateList.find((c) => c.fingerprint === remembered.fingerprint);
        if (match) {
          this.ctx.logger.info(`[client-cert] usando elección recordada para ${origin}: ${match.subjectName}`);
          respond(match);
          return;
        }
        // El cert recordado ya no está entre los candidatos (renovado/revocado): olvidar y preguntar.
        this.forgetChoice(origin, profileId);
      }
    } catch (err) {
      this.ctx.logger.warn(`[client-cert] no se pudo leer la elección recordada de ${origin}:`, err);
    }

    this.watchDestroyed(wc);
    const result = this.queue.enqueue(wcId, origin, { certificates: certificateList, callback: respond });
    if (result === 'show') {
      this.contextByWc.set(wcId, context);
      this.openPopup(wcId);
    } else {
      this.ctx.logger.info(
        `[client-cert] ${origin}: ${result === 'joined' ? 'se une a la petición en curso' : 'en cola tras la petición en curso'}`,
      );
    }
  }

  private watchDestroyed(wc: WebContents): void {
    const wcId = wc.id;
    if (this.watchedWc.has(wcId)) return;
    this.watchedWc.add(wcId);
    wc.once('destroyed', () => {
      this.watchedWc.delete(wcId);
      this.detachPopup(wcId)?.close();
      this.queue.cancelAll(wcId);
      this.contextByWc.delete(wcId);
    });
  }

  private openPopup(wcId: number): void {
    const request = this.queue.current(wcId);
    const context = this.contextByWc.get(wcId);
    const parentWin = context ? BrowserWindow.fromId(context.parentWindowId) : null;
    if (!request || !context || !parentWin || parentWin.isDestroyed()) {
      this.finish(wcId, undefined);
      return;
    }
    const certCount = request.callers[0]?.certificates.length ?? 0;

    let glass: GlassParams | null = null;
    try {
      glass = readGlass(this.ctx.profileManager.getRepositories(context.profileId));
    } catch (err) {
      this.ctx.logger.warn('[client-cert] no se pudo leer la configuración de glassmorphism:', err);
    }
    const height = Math.min(
      POPUP_HEIGHT_BASE + Math.max(certCount, 1) * POPUP_ROW_HEIGHT,
      POPUP_HEIGHT_MAX,
    );
    const { x, y } = centerOverWindow(parentWin, POPUP_WIDTH, height);

    const popup = createPopupWindow({
      width: POPUP_WIDTH,
      height,
      x,
      y,
      parent: parentWin,
      modal: true,
      ...(glass ? { glassmorphism: glass } : {}),
    });

    this.popupsByWc.set(wcId, popup);
    this.ctx.profileWindowManager.registerAuxiliaryWindow(popup.id, context.profileId);

    popup.on('closed', () => {
      this.ctx.profileWindowManager.unregisterAuxiliaryWindow(popup.id);
      // Solo si este selector sigue siendo el vigente: al elegir o cancelar se
      // desengancha antes de cerrarlo, para que su cierre no resuelva la
      // siguiente petición de la cola.
      if (this.popupsByWc.get(wcId) === popup) {
        this.popupsByWc.delete(wcId);
        // Cerrado sin responder (Alt+F4, cierre de la ventana padre, etc.):
        // cancelar para no dejar el callback de Electron sin resolver.
        this.finish(wcId, undefined);
      }
    });

    const pageUrl = new URL('vela://client-cert-select');
    pageUrl.searchParams.set('wcId', String(wcId));
    pageUrl.searchParams.set('windowId', String(context.parentWindowId));
    if (glass) applyGlassUrlParams(pageUrl, glass);

    // Sin `.catch` un fallo de carga (ERR_FAILED, ERR_ABORTED al cerrarse el
    // popup a media carga…) queda como promesa rechazada sin manejar y tumba
    // el proceso main. Aquí se registra, se cierra el popup y la petición de
    // red se cancela por la vía normal ('closed' → finish).
    void popup
      .loadURL(pageUrl.toString())
      .then(() => {
        if (popup.isDestroyed()) return;
        popup.show();
        popup.focus();
      })
      .catch((err: unknown) => {
        this.ctx.logger.error('[client-cert] no se pudo cargar vela://client-cert-select:', err);
        if (!popup.isDestroyed()) popup.close();
      });
  }

  /** Datos iniciales para `vela://client-cert-select`, pedidos por la propia
   *  página tras montar (evita pasar la lista de certificados por query string). */
  getInitialData(wcId: number): { hostname: string; certificates: ClientCertificateInfo[] } | null {
    const request = this.queue.current(wcId);
    const certificates = request?.callers[0]?.certificates;
    if (!request || !certificates) return null;
    return {
      hostname: hostnameOf(request.origin),
      certificates: certificates.map(toInfo),
    };
  }

  select(wcId: number, fingerprint: string, remember: boolean): void {
    const request = this.queue.current(wcId);
    const cert = request?.callers[0]?.certificates.find((c) => c.fingerprint === fingerprint);
    if (!request || !cert) return;

    const context = this.contextByWc.get(wcId);
    if (remember && context) {
      this.saveChoice(context.profileId, {
        origin: request.origin,
        fingerprint: cert.fingerprint,
        subject: cert.subjectName,
        chosenAt: Date.now(),
      });
      this.ctx.events.emit(IPC_EVENTS.CLIENT_CERT_CHANGED, { origin: request.origin });
    }

    this.ctx.logger.info(
      `[client-cert] ${request.origin}: certificado elegido para ${request.callers.length} petición(es)`,
    );
    this.detachPopup(wcId)?.close();
    this.finish(wcId, fingerprint);
  }

  cancel(wcId: number): void {
    const request = this.queue.current(wcId);
    if (request) this.ctx.logger.info(`[client-cert] ${request.origin}: el usuario cancela`);
    this.detachPopup(wcId)?.close();
    this.finish(wcId, undefined);
  }

  /** Quita el selector vigente del registro (sin cerrarlo) y lo devuelve. */
  private detachPopup(wcId: number): BrowserWindow | null {
    const popup = this.popupsByWc.get(wcId);
    this.popupsByWc.delete(wcId);
    return popup && !popup.isDestroyed() ? popup : null;
  }

  /** Responde la petición en curso y, si hay otra en cola, abre su selector. */
  private finish(wcId: number, fingerprint: string | undefined): void {
    const next = this.queue.resolveCurrent(wcId, (certificates) =>
      fingerprint ? certificates.find((c) => c.fingerprint === fingerprint) : undefined,
    );
    if (next) this.openPopup(wcId);
    else this.contextByWc.delete(wcId);
  }

  // ---------- elección recordada (por origen + perfil) ----------

  getRemembered(profileId: string): ClientCertRememberedChoice[] {
    return this.loadChoices(profileId).map(({ origin, subject, chosenAt }) => ({ origin, subject, chosenAt }));
  }

  forget(origin: string, profileId: string): void {
    this.forgetChoice(origin, profileId);
    this.ctx.events.emit(IPC_EVENTS.CLIENT_CERT_CHANGED, { origin });
  }

  private forgetChoice(origin: string, profileId: string): void {
    const remaining = this.loadChoices(profileId).filter((c) => c.origin !== origin);
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.settings.set(CHOICES_KEY, JSON.stringify(remaining));
  }

  private loadChoices(profileId: string): StoredChoice[] {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const raw = repos.settings.get(CHOICES_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as StoredChoice[];
    } catch {
      return [];
    }
  }

  private saveChoice(profileId: string, choice: StoredChoice): void {
    const choices = this.loadChoices(profileId).filter((c) => c.origin !== choice.origin);
    choices.push(choice);
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.settings.set(CHOICES_KEY, JSON.stringify(choices));
  }
}
