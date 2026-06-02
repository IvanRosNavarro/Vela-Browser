import { BrowserWindow } from 'electron';

export interface WindowEntry {
  /** UUID estable que persiste entre sesiones. */
  windowId: string;
  /** ID numérico asignado por Electron (cambia entre sesiones). */
  electronId: number;
  browserWindow: BrowserWindow;
  profileId: string;
  workspaceId: string | null;
  isPrimary: boolean;
  /** Ventana blindada: efímera, sin historial ni persistencia. */
  isBlinded?: boolean;
}

export interface WindowInfo {
  windowId: string;
  profileId: string;
  workspaceId: string | null;
  workspaceName: string | null;
  isPrimary: boolean;
}

export class WindowRegistry {
  // clave: windowId estable (UUID)
  private readonly byWindowId = new Map<string, WindowEntry>();
  // clave: electronId numérico de Electron
  private readonly byElectronId = new Map<number, string>();

  register(entry: WindowEntry): void {
    this.byWindowId.set(entry.windowId, entry);
    this.byElectronId.set(entry.electronId, entry.windowId);
  }

  unregister(windowId: string): void {
    const entry = this.byWindowId.get(windowId);
    if (entry) {
      this.byElectronId.delete(entry.electronId);
      this.byWindowId.delete(windowId);
    }
  }

  get(windowId: string): WindowEntry | undefined {
    return this.byWindowId.get(windowId);
  }

  getByElectronId(electronId: number): WindowEntry | undefined {
    const windowId = this.byElectronId.get(electronId);
    return windowId ? this.byWindowId.get(windowId) : undefined;
  }

  getByProfile(profileId: string): WindowEntry[] {
    return [...this.byWindowId.values()].filter((e) => e.profileId === profileId);
  }

  getAll(): WindowEntry[] {
    return [...this.byWindowId.values()];
  }

  updateWorkspace(windowId: string, workspaceId: string | null): void {
    const entry = this.byWindowId.get(windowId);
    if (entry) entry.workspaceId = workspaceId;
  }

  broadcastToProfile(
    profileId: string,
    channel: string,
    payload: unknown,
    excludeWindowId?: string,
  ): void {
    for (const entry of this.getByProfile(profileId)) {
      if (entry.windowId === excludeWindowId) continue;
      if (!entry.browserWindow.isDestroyed()) {
        try {
          entry.browserWindow.webContents.send(channel, payload);
        } catch {
          // ignorar si la ventana ya no responde
        }
      }
    }
  }

  broadcastToProfileAll(profileId: string, channel: string, payload: unknown): void {
    this.broadcastToProfile(profileId, channel, payload, undefined);
  }
}

export const windowRegistry = new WindowRegistry();
