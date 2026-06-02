import { BrowserWindow, dialog } from 'electron';
import { IPC_EVENTS } from '@vela/shared';
import { isBlindedProfile, BLINDED_PROFILE_MARKER } from './blindedProfileUtils';
import type { Logger } from '../logger';
import type { MainEventBus } from '../ipc/events';
import type {
  AppMetadataRepository,
  ProfileRepository,
} from '../storage/repositories';
import { ProfileNotFoundError } from '../storage/repositories';
import type { WindowStateRepository } from '../storage/repositories/WindowStateRepository';
import type { TabManager } from '../tabs/TabManager';
import { InvariantViolationError, NotImplementedError } from '../lib/errors';
import { ProfileManager } from './ProfileManager';
import { windowRegistry } from '../window/WindowRegistry';
import type { WindowInfo } from '@vela/shared';

const LAST_ACTIVE_PROFILE_KEY = 'last-active-profile';
const LAST_ACTIVE_WORKSPACE_KEY = 'last-active-workspace';

function generateId(): string {
  return globalThis.crypto.randomUUID();
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { fn(...args); timer = null; }, ms);
  }) as T;
}

export interface OpenWindowOptions {
  workspaceId?: string;
  /** Si se pasa, se usa como windowId estable en lugar de generar uno nuevo. */
  existingWindowId?: string;
}

export interface ProfileWindowManagerCtx {
  profileManager: ProfileManager;
  profileRepo: ProfileRepository;
  /** Metadatos globales (vela.db) — se usa para 'last-active-profile'. */
  appMetadata: AppMetadataRepository;
  windowStateRepo: WindowStateRepository;
  tabManager: TabManager;
  events: MainEventBus;
  logger: Logger;
  createWindow: (initState?: { sidebarWidth?: number; isBlinded?: boolean }) => BrowserWindow;
  loadRenderer: (window: BrowserWindow) => void;
  onWindowOpened?: (window: BrowserWindow, profileId: string) => void;
}

export class CannotDeleteOpenProfileError extends Error {
  readonly profileId: string;
  constructor(profileId: string) {
    super(`Profile ${profileId} has open windows; close them before deleting`);
    this.name = 'CannotDeleteOpenProfileError';
    this.profileId = profileId;
  }
}

/**
 * Asocia BrowserWindows con perfiles. Múltiples ventanas pueden coexistir,
 * cada una pegada a un perfil distinto o al mismo. Cuando la última ventana
 * de un perfil se cierra, el perfil se cierra también.
 */
export class ProfileWindowManager {
  // electronId (numérico) → profileId
  private readonly profileByWindow = new Map<number, string>();
  // profileId → set de electronIds que muestran ese perfil
  private readonly windowsByProfile = new Map<string, Set<number>>();
  // electronId → stable windowId (UUID)
  private readonly stableIdByElectronId = new Map<number, string>();

  private readonly disposers: Array<() => void> = [];

  constructor(private readonly ctx: ProfileWindowManagerCtx) {
    const off = this.ctx.events.on(
      IPC_EVENTS.ACTIVE_WORKSPACE_CHANGED,
      (payload) => {
        const profileId = this.profileByWindow.get(payload.windowId);
        if (!profileId) return;
        // Persistir last-active-workspace por perfil (workspace más reciente)
        try {
          const repos = this.ctx.profileManager.getRepositories(profileId);
          repos.metadata.set(LAST_ACTIVE_WORKSPACE_KEY, payload.workspaceId);
        } catch (err) {
          this.ctx.logger.warn(
            `[profile-window] no se pudo persistir last-active-workspace para profile=${profileId}`,
            err,
          );
        }
        // Persistir workspace por ventana en window_state
        const stableId = this.stableIdByElectronId.get(payload.windowId);
        if (stableId) {
          try {
            this.ctx.windowStateRepo.updateWorkspace(stableId, payload.workspaceId);
            windowRegistry.updateWorkspace(stableId, payload.workspaceId);
          } catch {
            // no crítico
          }
        }
      },
    );
    this.disposers.push(off);
  }

  dispose(): void {
    for (const off of this.disposers) {
      try { off(); } catch { /* ignorar */ }
    }
    this.disposers.length = 0;
  }

  async openWindow(
    profileId: string,
    options: OpenWindowOptions = {},
  ): Promise<BrowserWindow> {
    const profile = this.ctx.profileRepo.getById(profileId);
    if (!profile) throw new ProfileNotFoundError(profileId);

    // Advertencia al abrir la 5ª ventana
    const existingCount = this.windowsByProfile.get(profileId)?.size ?? 0;
    if (existingCount >= 4) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Continuar de todas formas', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        title: 'Muchas ventanas abiertas',
        message: `Tienes ${existingCount + 1} ventanas abiertas del mismo perfil. Cada ventana usa un proceso renderer separado.`,
      });
      if (response === 1) {
        throw new Error('Window creation cancelled by user');
      }
    }

    await this.ctx.profileManager.openProfile(profileId);

    const workspaceId = this.resolveStartupWorkspace(profileId, options);
    if (!workspaceId) {
      throw new InvariantViolationError(
        `openWindow: profile ${profileId} no tiene workspaces; ¿migración rota?`,
      );
    }

    const repos = this.ctx.profileManager.getRepositories(profileId);
    const rawWidth = repos?.settings.get('ui:sidebarWidth');
    const sidebarWidth = rawWidth !== null && rawWidth !== undefined ? Number(rawWidth) : undefined;
    const window = this.ctx.createWindow({ sidebarWidth });
    const electronId = window.id;

    // Determinar windowId estable
    const isPrimary = (this.windowsByProfile.get(profileId)?.size ?? 0) === 0;
    let stableWindowId: string;
    if (options.existingWindowId) {
      stableWindowId = options.existingWindowId;
    } else if (isPrimary) {
      // Para la ventana primaria: buscar si ya existe un windowId guardado
      const savedPrimary = this.ctx.windowStateRepo.getPrimary(profileId);
      stableWindowId = savedPrimary?.windowId ?? generateId();
    } else {
      stableWindowId = generateId();
    }

    // Registrar mapeos
    this.profileByWindow.set(electronId, profileId);
    this.stableIdByElectronId.set(electronId, stableWindowId);
    this.getOrCreateWindowSet(profileId).add(electronId);

    try {
      this.ctx.loadRenderer(window);
      this.ctx.tabManager.attachWindow(window, workspaceId, profileId);

      // Registrar en WindowRegistry
      windowRegistry.register({
        windowId: stableWindowId,
        electronId,
        browserWindow: window,
        profileId,
        workspaceId,
        isPrimary,
      });

      // Persistir en window_state
      const now = Date.now();
      const existingState = this.ctx.windowStateRepo.get(stableWindowId);
      this.ctx.windowStateRepo.upsert({
        windowId: stableWindowId,
        profileId,
        workspaceId,
        bounds: existingState?.bounds ?? { x: 0, y: 0, width: 1280, height: 800 },
        isPrimary,
        createdAt: existingState?.createdAt ?? now,
        updatedAt: now,
      });
      if (isPrimary) {
        this.ctx.windowStateRepo.setPrimary(stableWindowId, profileId);
      }

      // Guardar bounds al mover/redimensionar
      const saveBounds = debounce(() => {
        if (!window.isDestroyed()) {
          try {
            this.ctx.windowStateRepo.updateBounds(stableWindowId, window.getBounds());
          } catch { /* no crítico */ }
        }
      }, 500);
      window.on('move', saveBounds);
      window.on('resize', saveBounds);

      window.once('closed', () => {
        // Guardar bounds finales antes de limpiar
        try {
          if (!window.isDestroyed()) {
            this.ctx.windowStateRepo.updateBounds(stableWindowId, window.getBounds());
          }
        } catch { /* ignorar */ }
        void this.handleWindowClosed(electronId).catch((err) => {
          this.ctx.logger.error(
            `[profile-window] handleWindowClosed falló (window=${electronId})`,
            err,
          );
        });
      });

      // Si es ventana primaria y hay secundarias al cerrar, mostrar diálogo
      if (isPrimary) {
        window.on('close', (event) => {
          const siblings = windowRegistry
            .getByProfile(profileId)
            .filter((w) => w.windowId !== stableWindowId);
          if (siblings.length === 0) return;

          event.preventDefault();
          void (async () => {
            const count = siblings.length;
            const plural = count > 1;
            const { response } = await dialog.showMessageBox(window, {
              type: 'question',
              buttons: ['Cerrar todas', 'Cancelar'],
              defaultId: 1,
              cancelId: 1,
              title: 'Cerrar Vela',
              message: `Hay ${count} ventana${plural ? 's' : ''} adicional${plural ? 'es' : ''} abierta${plural ? 's' : ''} de este perfil. ¿Cerrar todas?`,
            });
            if (response === 1) return; // cancelar
            for (const sibling of siblings) {
              if (!sibling.browserWindow.isDestroyed()) {
                sibling.browserWindow.destroy();
              }
            }
            window.destroy();
          })();
        });
      }

      const now2 = Date.now();
      try { this.ctx.profileRepo.setLastUsedAt(profileId, now2); } catch { /* ignorar */ }
      try { this.ctx.appMetadata.set(LAST_ACTIVE_PROFILE_KEY, profileId); } catch { /* ignorar */ }

      if (this.ctx.onWindowOpened) {
        try { this.ctx.onWindowOpened(window, profileId); } catch (err) {
          this.ctx.logger.warn('[profile-window] onWindowOpened lanzó', err);
        }
      }

      this.ctx.logger.info(
        `[profile-window] abierta window=${electronId} (stable=${stableWindowId}) profile=${profileId} workspace=${workspaceId}`,
      );

      this.ctx.events.emit(IPC_EVENTS.ACTIVE_PROFILE_CHANGED, { windowId: electronId, profileId });

      // Notificar a todas las ventanas del perfil que el número de ventanas cambió
      this.broadcastWindowsChanged(profileId);

      return window;
    } catch (err) {
      this.profileByWindow.delete(electronId);
      this.stableIdByElectronId.delete(electronId);
      const set = this.windowsByProfile.get(profileId);
      set?.delete(electronId);
      if (set && set.size === 0) {
        this.windowsByProfile.delete(profileId);
        try { await this.ctx.profileManager.closeProfile(profileId); } catch { /* ignorar */ }
      }
      windowRegistry.unregister(stableWindowId);
      if (!window.isDestroyed()) {
        try { window.destroy(); } catch { /* ignorar */ }
      }
      throw err;
    }
  }

  async handleWindowClosed(electronId: number): Promise<void> {
    const profileId = this.profileByWindow.get(electronId);
    if (!profileId) return;

    const stableId = this.stableIdByElectronId.get(electronId);

    this.profileByWindow.delete(electronId);
    this.stableIdByElectronId.delete(electronId);
    const wins = this.windowsByProfile.get(profileId);
    wins?.delete(electronId);

    if (stableId) windowRegistry.unregister(stableId);

    this.ctx.logger.info(
      `[profile-window] cerrada window=${electronId} profile=${profileId} (restantes: ${wins?.size ?? 0})`,
    );

    // Notificar a las ventanas restantes del perfil
    this.broadcastWindowsChanged(profileId);

    if (wins && wins.size === 0) {
      this.windowsByProfile.delete(profileId);
      try { await this.ctx.profileManager.closeProfile(profileId); } catch (err) {
        this.ctx.logger.warn(`[profile-window] closeProfile falló (profile=${profileId})`, err);
      }
    }
  }

  getProfileForWindow(electronId: number): string | null {
    return this.profileByWindow.get(electronId) ?? null;
  }

  getStableWindowId(electronId: number): string | null {
    return this.stableIdByElectronId.get(electronId) ?? null;
  }

  registerAuxiliaryWindow(electronId: number, profileId: string): void {
    this.profileByWindow.set(electronId, profileId);
  }

  unregisterAuxiliaryWindow(electronId: number): void {
    this.profileByWindow.delete(electronId);
  }

  getWindowsForProfile(profileId: string): readonly number[] {
    const set = this.windowsByProfile.get(profileId);
    return set ? [...set] : [];
  }

  hasOpenWindowsForProfile(profileId: string): boolean {
    const set = this.windowsByProfile.get(profileId);
    return set !== undefined && set.size > 0;
  }

  /** Construye la lista WindowInfo para broadcast al renderer. */
  getWindowInfos(profileId: string): WindowInfo[] {
    return windowRegistry.getByProfile(profileId).map((entry) => {
      let workspaceName: string | null = null;
      if (entry.workspaceId) {
        try {
          const repos = this.ctx.profileManager.getRepositories(profileId);
          const ws = repos.workspaces.getById(entry.workspaceId);
          workspaceName = ws?.name ?? null;
        } catch { /* ignorar */ }
      }
      return {
        windowId: entry.windowId,
        profileId,
        workspaceId: entry.workspaceId,
        workspaceName,
        isPrimary: entry.isPrimary,
      };
    });
  }

  /**
   * Abre una ventana blindada: todas sus pestañas son efímeras, sin historial
   * ni persistencia. Usa el último perfil activo para infraestructura (extensiones,
   * bloqueador, workspace), pero la ventana en sí no se guarda en window_state.
   */
  /** @deprecated Usar BLINDED_PROFILE_MARKER importado de blindedProfileUtils. */
  static readonly BLINDED_PROFILE_MARKER = BLINDED_PROFILE_MARKER;

  /** Elimina perfiles fantasma que no tienen ninguna ventana abierta. */
  private async cleanupOrphanedBlindedProfiles(): Promise<void> {
    const all = [
      ...this.ctx.profileRepo.list(),
      ...this.ctx.profileRepo.listArchived(),
    ].filter(isBlindedProfile);

    for (const p of all) {
      const windows = this.windowsByProfile.get(p.id);
      if (windows && windows.size > 0) continue; // todavía en uso
      try {
        await this.ctx.profileManager.deleteProfile(p.id);
        this.ctx.logger.info(`[profile-window] perfil fantasma huérfano eliminado: ${p.id} (${p.name})`);
      } catch (err) {
        this.ctx.logger.warn(`[profile-window] deleteProfile falló para ${p.id}, forzando borrado del registro`, err);
        try { this.ctx.profileRepo.delete(p.id); } catch { /* ignorar */ }
      }
    }
  }

  /** Devuelve el primer nombre disponible del tipo "Fantasma", "Fantasma 2", etc. */
  private nextBlindedProfileName(): string {
    const taken = new Set([
      ...this.ctx.profileRepo.list().map((p) => p.name),
      ...this.ctx.profileRepo.listArchived().map((p) => p.name),
    ]);
    if (!taken.has('Fantasma')) return 'Fantasma';
    for (let i = 2; i <= 99; i++) {
      const candidate = `Fantasma ${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `Fantasma ${Date.now()}`;
  }

  async openBlindedWindow(): Promise<BrowserWindow> {
    // Perfil temporal de un solo uso: sesión vacía, sin extensiones, sin datos
    // del perfil activo. Se borra completamente al cerrar la ventana.
    const tempProfile = await this.ctx.profileManager.createProfile({
      name: this.nextBlindedProfileName(),
      icon: ProfileWindowManager.BLINDED_PROFILE_MARKER,
    });
    const tempProfileId = tempProfile.id;
    await this.ctx.profileManager.openProfile(tempProfileId);

    const repos = this.ctx.profileManager.getRepositories(tempProfileId);
    const workspaceId = repos.workspaces.list()[0]?.id;
    if (!workspaceId) throw new InvariantViolationError('openBlindedWindow: perfil temporal sin workspace');

    // Heredar el ancho de sidebar del perfil activo para consistencia visual.
    const sourceProfileId = this.ctx.appMetadata.get(LAST_ACTIVE_PROFILE_KEY)
      ?? this.ctx.profileRepo.list().find((p) => p.id !== tempProfileId)?.id;
    const sourceRepos = sourceProfileId
      ? this.ctx.profileManager.getRepositories(sourceProfileId)
      : null;
    const rawWidth = sourceRepos?.settings.get('ui:sidebarWidth');
    const sidebarWidth = rawWidth !== null && rawWidth !== undefined ? Number(rawWidth) : undefined;

    const window = this.ctx.createWindow({ sidebarWidth, isBlinded: true });
    const electronId = window.id;
    const stableWindowId = generateId();

    this.profileByWindow.set(electronId, tempProfileId);
    this.stableIdByElectronId.set(electronId, stableWindowId);
    this.getOrCreateWindowSet(tempProfileId).add(electronId);

    try {
      this.ctx.loadRenderer(window);
      this.ctx.tabManager.markWindowAsBlinded(electronId);
      this.ctx.tabManager.attachWindow(window, workspaceId, tempProfileId);
      await this.ctx.tabManager.createTab(electronId, {
        workspaceId,
        url: 'vela://newtab',
        parentId: null,
        activate: true,
      });

      windowRegistry.register({
        windowId: stableWindowId,
        electronId,
        browserWindow: window,
        profileId: tempProfileId,
        workspaceId,
        isPrimary: false,
        isBlinded: true,
      });

      window.once('closed', () => {
        void this.handleWindowClosed(electronId).catch((err) => {
          this.ctx.logger.error(
            `[profile-window] handleWindowClosed (blinded) falló (window=${electronId})`,
            err,
          );
        });
        // Borrar el perfil temporal y limpiar cualquier otro huérfano fantasma.
        void this.ctx.profileManager.deleteProfile(tempProfileId)
          .catch((err) => {
            this.ctx.logger.warn('[profile-window] deleteProfile (blinded) falló', err);
          })
          .finally(() => { void this.cleanupOrphanedBlindedProfiles(); });
      });

      if (this.ctx.onWindowOpened) {
        try { this.ctx.onWindowOpened(window, tempProfileId); } catch (err) {
          this.ctx.logger.warn('[profile-window] onWindowOpened (blinded) lanzó', err);
        }
      }

      this.ctx.logger.info(
        `[profile-window] ventana fantasma abierta window=${electronId} (stable=${stableWindowId}) profile=${tempProfileId}`,
      );

      this.ctx.events.emit(IPC_EVENTS.ACTIVE_PROFILE_CHANGED, { windowId: electronId, profileId: tempProfileId });

      return window;
    } catch (err) {
      this.profileByWindow.delete(electronId);
      this.stableIdByElectronId.delete(electronId);
      const set = this.windowsByProfile.get(tempProfileId);
      set?.delete(electronId);
      windowRegistry.unregister(stableWindowId);
      void this.ctx.profileManager.deleteProfile(tempProfileId).catch(() => { /* ignorar */ });
      if (!window.isDestroyed()) {
        try { window.destroy(); } catch { /* ignorar */ }
      }
      throw err;
    }
  }

  async switchWindowProfile(
    _windowId: number,
    _newProfileId: string,
  ): Promise<void> {
    throw new NotImplementedError(
      'switchWindowProfile: cambia el perfil abriendo una nueva ventana',
    );
  }

  private broadcastWindowsChanged(profileId: string): void {
    const infos = this.getWindowInfos(profileId);
    windowRegistry.broadcastToProfileAll(
      profileId,
      IPC_EVENTS.WINDOWS_CHANGED,
      { windows: infos },
    );
  }

  private getOrCreateWindowSet(profileId: string): Set<number> {
    let set = this.windowsByProfile.get(profileId);
    if (!set) {
      set = new Set<number>();
      this.windowsByProfile.set(profileId, set);
    }
    return set;
  }

  private resolveStartupWorkspace(
    profileId: string,
    options: OpenWindowOptions,
  ): string | null {
    const repos = this.ctx.profileManager.getRepositories(profileId);

    if (options.workspaceId) {
      const ws = repos.workspaces.getById(options.workspaceId);
      if (ws) return ws.id;
      this.ctx.logger.warn(
        `[profile-window] options.workspaceId=${options.workspaceId} no existe en profile=${profileId}, usando fallback`,
      );
    }

    const stored = repos.metadata.get(LAST_ACTIVE_WORKSPACE_KEY);
    if (stored) {
      const ws = repos.workspaces.getById(stored);
      if (ws && !ws.archived) return ws.id;
    }

    const first = repos.workspaces.list()[0];
    return first?.id ?? null;
  }
}
