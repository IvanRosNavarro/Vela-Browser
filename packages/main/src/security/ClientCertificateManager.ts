import { app, BrowserWindow, type Certificate } from 'electron';
import { IPC_EVENTS, type ClientCertificateInfo, type ClientCertRememberedChoice } from '@vela/shared';
import type { Logger } from '../logger';
import type { MainEventBus } from '../ipc/events';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { ProfileWindowManager } from '../profiles/ProfileWindowManager';
import type { TabManager } from '../tabs/TabManager';
import { createPopupWindow, centerOverWindow, applyGlassUrlParams, type GlassParams } from '../ipc/popupUtils';

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

interface PendingRequest {
  origin: string;
  certificateList: Certificate[];
  callback: (certificate?: Certificate) => void;
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
 */
export class ClientCertificateManager {
  // wcId → petición de red esperando resolución (contiene el callback real
  // de Electron; nunca se deja sin resolver).
  private readonly pendingByWc = new Map<number, PendingRequest>();
  // wcId → popup actualmente mostrado para esa tab.
  private readonly popupsByWc = new Map<number, BrowserWindow>();

  constructor(private readonly ctx: ClientCertificateManagerCtx) {
    app.on('select-client-certificate', (event, webContents, url, certificateList, callback) => {
      event.preventDefault();
      const wcId = webContents.id;
      try {
        this.handleRequest(wcId, url, certificateList, callback);
      } catch (err) {
        // Nada de lo que ocurra aquí puede escapar: una excepción en un
        // listener de `app` no la captura nadie y tumbaría el proceso main
        // (Vela se cerraría entera sin dejar traza).
        this.ctx.logger.error(`[client-cert] fallo gestionando la petición de ${url}:`, err);
        if (this.pendingByWc.has(wcId)) this.resolvePending(wcId, undefined);
        else { try { callback(); } catch { /* wc puede estar destruido */ } }
      }
    });
  }

  private resolveWindowAndProfile(wcId: number): { windowId: number; profileId: string } | null {
    const tabId = this.ctx.tabManager.getTabIdForWebContents(wcId);
    if (!tabId) return null;
    const windowId = this.ctx.tabManager.getWindowIdForTab(tabId);
    if (windowId === null) return null;
    const profileId = this.ctx.profileWindowManager.getProfileForWindow(windowId);
    if (!profileId) return null;
    return { windowId, profileId };
  }

  private handleRequest(
    wcId: number,
    url: string,
    certificateList: Certificate[],
    callback: (certificate?: Certificate) => void,
  ): void {
    const origin = originOf(url);
    const resolved = origin ? this.resolveWindowAndProfile(wcId) : null;
    if (!origin || !resolved) {
      this.ctx.logger.warn(
        `[client-cert] petición sin pestaña/perfil resoluble (wc=${wcId}, url=${url}); cancelada`,
      );
      callback();
      return;
    }
    const { windowId, profileId } = resolved;
    this.ctx.logger.info(
      `[client-cert] ${origin} pide certificado: ${certificateList.length} candidato(s) ` +
      `(wc=${wcId}, window=${windowId}, profile=${profileId})`,
    );

    // Un fallo leyendo o limpiando la elección recordada no debe impedir que
    // se pregunte al usuario: se registra y se sigue al popup.
    try {
      const remembered = this.loadChoices(profileId).find((c) => c.origin === origin);
      if (remembered) {
        const match = certificateList.find((c) => c.fingerprint === remembered.fingerprint);
        if (match) {
          this.ctx.logger.info(`[client-cert] usando elección recordada para ${origin}: ${match.subjectName}`);
          callback(match);
          return;
        }
        // El cert recordado ya no está entre los candidatos (renovado/revocado): olvidar y preguntar.
        this.forgetChoice(origin, profileId);
      }
    } catch (err) {
      this.ctx.logger.warn(`[client-cert] no se pudo leer la elección recordada de ${origin}:`, err);
    }

    // Sustituye cualquier petición/popup previo pendiente para esta misma tab
    // ANTES de registrar el nuevo, para que su evento 'closed' asíncrono no
    // cancele por error la petición nueva (ver comentario en 'closed' abajo).
    const existingPending = this.pendingByWc.get(wcId);
    if (existingPending) {
      this.pendingByWc.delete(wcId);
      try { existingPending.callback(); } catch { /* wc puede estar destruido */ }
    }
    const existingPopup = this.popupsByWc.get(wcId);
    if (existingPopup && !existingPopup.isDestroyed()) {
      this.popupsByWc.delete(wcId);
      existingPopup.close();
    }

    this.pendingByWc.set(wcId, { origin, certificateList, callback });
    this.openPopup(wcId, windowId, profileId, certificateList.length);
  }

  private openPopup(wcId: number, windowId: number, profileId: string, certCount: number): void {
    const parentWin = BrowserWindow.fromId(windowId);
    if (!parentWin || parentWin.isDestroyed()) {
      this.resolvePending(wcId, undefined);
      return;
    }

    let glass: GlassParams | null = null;
    try {
      glass = readGlass(this.ctx.profileManager.getRepositories(profileId));
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
    this.ctx.profileWindowManager.registerAuxiliaryWindow(popup.id, profileId);

    popup.on('closed', () => {
      this.ctx.profileWindowManager.unregisterAuxiliaryWindow(popup.id);
      // Solo actuar si este popup sigue siendo el vigente para wcId: una
      // petición nueva pudo haber reemplazado ya la entrada (ver arriba).
      if (this.popupsByWc.get(wcId) === popup) {
        this.popupsByWc.delete(wcId);
        // Cerrado sin responder (Alt+F4, cierre de la ventana padre, etc.):
        // cancelar para no dejar el callback de Electron sin resolver.
        this.resolvePending(wcId, undefined);
      }
    });

    const pageUrl = new URL('vela://client-cert-select');
    pageUrl.searchParams.set('wcId', String(wcId));
    pageUrl.searchParams.set('windowId', String(windowId));
    if (glass) applyGlassUrlParams(pageUrl, glass);

    // Sin `.catch` un fallo de carga (ERR_FAILED, ERR_ABORTED al cerrarse el
    // popup a media carga…) queda como promesa rechazada sin manejar y tumba
    // el proceso main. Aquí se registra, se cierra el popup y la petición de
    // red se cancela por la vía normal ('closed' → resolvePending).
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
        else this.resolvePending(wcId, undefined);
      });
  }

  /** Datos iniciales para `vela://client-cert-select`, pedidos por la propia
   *  página tras montar (evita pasar la lista de certificados por query string). */
  getInitialData(wcId: number): { hostname: string; certificates: ClientCertificateInfo[] } | null {
    const pending = this.pendingByWc.get(wcId);
    if (!pending) return null;
    return {
      hostname: hostnameOf(pending.origin),
      certificates: pending.certificateList.map(toInfo),
    };
  }

  select(wcId: number, fingerprint: string, remember: boolean): void {
    const pending = this.pendingByWc.get(wcId);
    if (!pending) return;
    const cert = pending.certificateList.find((c) => c.fingerprint === fingerprint);
    if (!cert) return;

    if (remember) {
      const resolved = this.resolveWindowAndProfile(wcId);
      if (resolved) {
        this.saveChoice(resolved.profileId, {
          origin: pending.origin,
          fingerprint: cert.fingerprint,
          subject: cert.subjectName,
          chosenAt: Date.now(),
        });
        this.ctx.events.emit(IPC_EVENTS.CLIENT_CERT_CHANGED, { origin: pending.origin });
      }
    }

    this.resolvePending(wcId, cert);
    this.closePopup(wcId);
  }

  cancel(wcId: number): void {
    this.resolvePending(wcId, undefined);
    this.closePopup(wcId);
  }

  private closePopup(wcId: number): void {
    const popup = this.popupsByWc.get(wcId);
    if (popup && !popup.isDestroyed()) popup.close();
  }

  private resolvePending(wcId: number, certificate: Certificate | undefined): void {
    const pending = this.pendingByWc.get(wcId);
    if (!pending) return;
    this.pendingByWc.delete(wcId);
    try { pending.callback(certificate); } catch { /* wc puede estar destruido */ }
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
