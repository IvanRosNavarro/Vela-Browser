import { BrowserWindow } from 'electron';
import { IPC_EVENTS } from '@vela/shared';
import type { MainEventBus } from '../ipc/events';
import type { Logger } from '../logger';
import type { ProfileManager } from '../profiles/ProfileManager';

interface StoredPermission {
  origin: string;
  state: 'granted' | 'denied';
  grantedAt?: number;
  deniedAt?: number;
}

interface PendingRequest {
  wcId: number;
  mediaTypes: Array<'video' | 'audio'>;
  callback: (granted: boolean) => void;
}

const PERMISSIONS_KEY = 'media:permissions';

export interface MediaPermissionManagerCtx {
  profileManager: ProfileManager;
  events: MainEventBus;
  logger: Logger;
}

export class MediaPermissionManager {
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(private readonly ctx: MediaPermissionManagerCtx) {}

  // ---------- pending ----------

  registerPendingRequest(
    wcId: number,
    origin: string,
    mediaTypes: Array<'video' | 'audio'>,
    callback: (granted: boolean) => void,
  ): void {
    this.pendingRequests.set(origin, { wcId, mediaTypes, callback });
    const windowId = this.resolveWindowForWc(wcId) ?? 0;
    this.ctx.events.emit(IPC_EVENTS.MEDIA_PERMISSION_PENDING, {
      origin,
      windowId,
      mediaTypes,
    });
  }

  clearPendingRequest(origin: string): void {
    this.pendingRequests.delete(origin);
  }

  getPendingRequest(origin: string): PendingRequest | undefined {
    return this.pendingRequests.get(origin);
  }

  // ---------- decisions ----------

  grantPermission(origin: string, profileId: string): void {
    this.savePermission(profileId, { origin, state: 'granted', grantedAt: Date.now() });
    const pending = this.pendingRequests.get(origin);
    try { pending?.callback(true); } catch { /* wc puede estar destruido */ }
    this.clearPendingRequest(origin);
    this.ctx.events.emit(IPC_EVENTS.MEDIA_PERMISSION_CHANGED, {
      origin,
      state: 'granted',
      windowId: this.resolveWindowForProfile(profileId) ?? 0,
    });
  }

  denyPermission(origin: string, profileId: string): void {
    this.savePermission(profileId, { origin, state: 'denied', deniedAt: Date.now() });
    const pending = this.pendingRequests.get(origin);
    try { pending?.callback(false); } catch { /* wc puede estar destruido */ }
    this.clearPendingRequest(origin);
    this.ctx.events.emit(IPC_EVENTS.MEDIA_PERMISSION_CHANGED, {
      origin,
      state: 'denied',
      windowId: this.resolveWindowForProfile(profileId) ?? 0,
    });
  }

  revokePermission(origin: string, profileId: string): void {
    const perms = this.loadPermissions(profileId).filter((p) => p.origin !== origin);
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.settings.set(PERMISSIONS_KEY, JSON.stringify(perms));
    this.ctx.events.emit(IPC_EVENTS.MEDIA_PERMISSION_CHANGED, {
      origin,
      state: 'none',
      windowId: this.resolveWindowForProfile(profileId) ?? 0,
    });
  }

  isGranted(origin: string, profileId: string): boolean {
    return this.getStoredState(origin, profileId) === 'granted';
  }

  isDenied(origin: string, profileId: string): boolean {
    return this.getStoredState(origin, profileId) === 'denied';
  }

  getPermissionState(origin: string, profileId: string): 'none' | 'pending' | 'granted' | 'denied' {
    if (this.pendingRequests.has(origin)) return 'pending';
    return this.getStoredState(origin, profileId);
  }

  getAllPermissions(profileId: string): Array<{ origin: string; state: 'granted' | 'denied'; grantedAt?: number; deniedAt?: number }> {
    return this.loadPermissions(profileId);
  }

  // ---------- private ----------

  private getStoredState(origin: string, profileId: string): 'none' | 'granted' | 'denied' {
    const stored = this.loadPermissions(profileId).find((p) => p.origin === origin);
    return stored?.state ?? 'none';
  }

  private loadPermissions(profileId: string): StoredPermission[] {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const raw = repos.settings.get(PERMISSIONS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as StoredPermission[];
    } catch {
      return [];
    }
  }

  private savePermission(profileId: string, perm: StoredPermission): void {
    const perms = this.loadPermissions(profileId).filter((p) => p.origin !== perm.origin);
    perms.push(perm);
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.settings.set(PERMISSIONS_KEY, JSON.stringify(perms));
  }

  private resolveWindowForProfile(_profileId: string): number | null {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) return win.id;
    }
    return null;
  }

  private resolveWindowForWc(wcId: number): number | null {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents.id === wcId) return win.id;
    }
    return null;
  }
}
