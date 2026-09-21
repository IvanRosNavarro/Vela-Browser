import { ipcMain, app, shell, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IPC_CHANNELS, IPC_EVENTS, z, type IpcResponse } from '@vela/shared';
import type { SyncStatus, DeviceInfo, RemoteSyncProfile, AccountProfile } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getFrameContext } from './helpers';
import { SyncManager, listRemoteProfiles } from '../sync/SyncManager';
import { syncEvents } from '../sync/syncEvents';

const SERVER_URL = 'https://sync.vela-browser.com';

// Token del magic link recibido vía vela://sync-callback. Persiste en memoria
// para que getStatus() lo devuelva incluso tras un reload del renderer.
let pendingCallbackToken: string | null = null;

// Sondeo del login (servidor ≥ migración 005). El deep link vela://sync-callback
// no llega si el correo se abre en otro navegador u otro equipo, así que la app
// pregunta al servidor hasta que se pulse el enlace. Solo hay uno activo: pedir
// otro enlace sustituye al anterior.
let loginPollTimer: ReturnType<typeof setTimeout> | null = null;

function stopLoginPoll(): void {
  if (loginPollTimer !== null) clearTimeout(loginPollTimer);
  loginPollTimer = null;
}

function startLoginPoll(
  loginId: string,
  intervalMs: number,
  expiresAt: number,
  onToken: (token: string) => void,
): void {
  stopLoginPoll();
  // Margen tras la caducidad por si el enlace se pulsó en el último momento.
  const deadline = expiresAt + 60_000;
  const tick = async (): Promise<void> => {
    loginPollTimer = null;
    if (Date.now() > deadline) return;
    try {
      const res = await fetch(`${SERVER_URL}/auth/magic-link/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: loginId }),
      });
      if (res.status === 410 || res.status === 400) return;
      if (res.ok) {
        const body = (await res.json()) as { status?: string; token?: string };
        if (body.status === 'verified' && body.token) {
          onToken(body.token);
          return;
        }
      }
    } catch {
      // Red caída: se reintenta en la siguiente vuelta.
    }
    loginPollTimer = setTimeout(() => void tick(), intervalMs);
    if (typeof loginPollTimer.unref === 'function') loginPollTimer.unref();
  };
  loginPollTimer = setTimeout(() => void tick(), intervalMs);
  if (typeof loginPollTimer.unref === 'function') loginPollTimer.unref();
}

const updateDeviceNameSchema = z.object({ name: z.string().min(1).max(100) });
const recoveryCardPdfSchema = z.object({ email: z.string(), date: z.string() });

const requestMagicLinkSchema = z.object({ email: z.string().email() });
const setupSchema = z.object({
  token: z.string().min(1),
  syncPassword: z.string().min(1),
  /** Perfil del servidor al que engancharse. Ausente = crear uno nuevo. */
  remoteProfileId: z.string().min(1).nullish(),
});
const listRemoteProfilesSchema = z.object({
  token: z.string().min(1),
  syncPassword: z.string().min(1),
});
const disconnectDeviceSchema = z.object({ tokenSuffix: z.string().min(1) });
const adoptRemoteProfileSchema = z.object({
  remoteProfileId: z.string().min(1),
  name: z.string().min(1).max(120),
});
const setProfilePausedSchema = z.object({
  localProfileId: z.string().min(1),
  paused: z.boolean(),
});

function getOrCreateSyncManager(profileId: string, ctx: IpcContext): SyncManager {
  if (!ctx.syncManagers.has(profileId)) {
    const manager = new SyncManager(
      profileId,
      () => ctx.profileManager.getRepositories(profileId),
      ctx.logger,
      ctx.events,
      (pid, origin, payloadBase64) => {
        const plaintext = ctx.pushProxyManager.decryptPayload(pid, origin, payloadBase64);
        if (!plaintext) return;
        let title = 'Notificación push';
        let body = plaintext;
        let icon: string | undefined;
        try {
          const parsed = JSON.parse(plaintext) as {
            title?: string;
            body?: string;
            icon?: string;
            url?: string;
          };
          title = parsed.title ?? title;
          body = parsed.body ?? '';
          icon = parsed.icon;
        } catch { /* plaintext is not JSON — use as body */ }

        ctx.notificationManager.receive({
          origin,
          title,
          body,
          icon,
          source: 'push',
          profileId: pid,
        });
      },
      () => ctx.repositories.profiles.getById(profileId)?.name ?? 'Perfil',
    );
    ctx.syncManagers.set(profileId, manager);
  }
  return ctx.syncManagers.get(profileId)!;
}

export function registerSyncHandlers(ctx: IpcContext): void {

  // Cuando el protocolo vela:// recibe vela://sync-callback?token=X, reenviar
  // el token al renderer para que la UI de settings avance al siguiente paso.
  syncEvents.on('callback:sync', ({ token }: { token: string }) => {
    // Llegue por deep link o por sondeo, el login ya está hecho.
    stopLoginPoll();
    pendingCallbackToken = token;
    ctx.events.emit(IPC_EVENTS.SYNC_CALLBACK_RECEIVED, { token });
  });

  // Cuando el servidor devuelve 401, el SyncManager emite SYNC_SESSION_EXPIRED.
  // Limpiamos las credenciales del disco para que el próximo arranque no entre
  // en un bucle de 401s, y dejamos el manager en estado unconfigured para que
  // el usuario pueda volver a hacer login.
  ctx.events.on(IPC_EVENTS.SYNC_SESSION_EXPIRED, ({ profileId }) => {
    const manager = ctx.syncManagers.get(profileId);
    if (!manager) return;
    void manager.deactivate().then(() => {
      ctx.logger.warn(`[sync] sesión expirada — credenciales limpiadas para perfil ${profileId}`);
    });
  });

  // Al abrir un perfil, intentar restaurar la sesión de sync desde el keychain
  // del SO (token + clave cifrada con safeStorage). Si no hay credenciales
  // guardadas el manager queda en estado unconfigured y sigue el flujo normal.
  ctx.events.on(IPC_EVENTS.PROFILE_UNLOCKED, ({ profileId }) => {
    // Un perfil en pausa se abre sin sincronizar: conserva sus credenciales y
    // espera a que el usuario lo reanude desde Ajustes › Sincronización.
    if (ctx.repositories.profiles.getById(profileId)?.syncPaused) {
      ctx.logger.info(`[sync] perfil ${profileId} en pausa — no se restaura la sesión`);
      return;
    }
    const manager = getOrCreateSyncManager(profileId, ctx);
    if (manager.isConfigured()) return;
    void manager.restoreFromStorage().then((restored) => {
      if (restored) {
        ctx.repositories.profiles.setSyncLink(profileId, manager.getRemoteProfileId());
        ctx.logger.info(`[sync] sesión restaurada para perfil ${profileId}`);
      }
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.SYNC_REQUEST_MAGIC_LINK,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { email } = requestMagicLinkSchema.parse(payload);

        const res = await fetch(`${SERVER_URL}/auth/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // poll: true — este cliente recoge la sesión por sondeo (servidor ≥ migración 005).
          body: JSON.stringify({ email, poll: true }),
        });

        if (!res.ok) {
          return { ok: false, error: 'INTERNAL', details: `Status ${res.status}` };
        }
        // Servidores anteriores al sondeo no mandan login_id: queda solo el deep link.
        const body = (await res.json().catch(() => ({}))) as {
          login_id?: string;
          poll_interval_ms?: number;
          expires_at?: number;
        };
        if (typeof body.login_id === 'string') {
          startLoginPoll(
            body.login_id,
            Math.max(1_000, body.poll_interval_ms ?? 2_000),
            body.expires_at ?? Date.now() + 15 * 60_000,
            (token) => syncEvents.emit('callback:sync', { token }),
          );
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_REQUEST_MAGIC_LINK);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_SETUP,
    async (event, payload): Promise<IpcResponse<SyncStatus>> => {
      try {
        const { token, syncPassword, remoteProfileId } = setupSchema.parse(payload);
        const { profileId } = getFrameContext(event, ctx);

        const manager = getOrCreateSyncManager(profileId, ctx);
        await manager.configure(token, syncPassword, remoteProfileId ?? null);
        ctx.repositories.profiles.setSyncLink(profileId, manager.getRemoteProfileId());
        ctx.repositories.profiles.setSyncPaused(profileId, false);
        pendingCallbackToken = null;

        return { ok: true, data: manager.getStatus() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_SETUP);
      }
    },
  );

  // Perfiles que el usuario ya tiene en el servidor. Se consulta entre el
  // magic link y la activación: sin esto, cada dispositivo creaba su propio
  // perfil remoto y nunca veía los datos de los demás.
  ipcMain.handle(
    IPC_CHANNELS.SYNC_LIST_REMOTE_PROFILES,
    async (event, payload): Promise<IpcResponse<RemoteSyncProfile[]>> => {
      try {
        const { token, syncPassword } = listRemoteProfilesSchema.parse(payload);
        getFrameContext(event, ctx); // valida que el emisor es la shell
        const profiles = await listRemoteProfiles(token, syncPassword);
        return { ok: true, data: profiles };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_LIST_REMOTE_PROFILES);
      }
    },
  );

  // ── Perfiles de la cuenta ──────────────────────────────────────────────────
  //
  // Una cuenta de Vela tiene varios perfiles y el servidor particiona todo por
  // perfil (ADR 0101). Aquí se ve la cuenta entera desde este equipo: cuáles ya
  // están, cuáles faltan y cuáles están en pausa.

  function accountProfiles(currentProfileId: string): Promise<AccountProfile[]> {
    const manager = ctx.syncManagers.get(currentProfileId);
    if (!manager?.isConfigured()) return Promise.resolve([]);
    return manager.listAccountProfiles().then((remotes) => {
      const locals = ctx.repositories.profiles.listAll();
      return remotes.map((remote) => {
        const local = locals.find((p) => p.remoteProfileId === remote.id) ?? null;
        return {
          remoteId: remote.id,
          name: remote.name,
          host: remote.host,
          updatedAt: remote.updatedAt,
          localProfileId: local?.id ?? null,
          localName: local?.name ?? null,
          paused: local?.syncPaused ?? false,
          isCurrent: local?.id === currentProfileId,
        };
      });
    });
  }

  ipcMain.handle(
    IPC_CHANNELS.SYNC_LIST_ACCOUNT_PROFILES,
    async (event): Promise<IpcResponse<AccountProfile[]>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        return { ok: true, data: await accountProfiles(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_LIST_ACCOUNT_PROFILES);
      }
    },
  );

  // Trae a este equipo un perfil de la cuenta que aún no está: crea su perfil
  // local (sin workspace por defecto, los trae la sincronización) y lo vincula
  // con la sesión y la clave que ya tiene el perfil actual — sin enlace mágico
  // ni contraseña de por medio.
  ipcMain.handle(
    IPC_CHANNELS.SYNC_ADOPT_REMOTE_PROFILE,
    async (event, payload): Promise<IpcResponse<AccountProfile[]>> => {
      try {
        const { remoteProfileId, name } = adoptRemoteProfileSchema.parse(payload);
        const { profileId } = getFrameContext(event, ctx);

        const source = ctx.syncManagers.get(profileId);
        const credentials = source?.getCredentialsForLinking();
        if (!credentials) {
          return { ok: false, error: 'INVALID_INPUT', details: 'La sincronización no está activa en este perfil' };
        }
        if (ctx.repositories.profiles.listAll().some((p) => p.remoteProfileId === remoteProfileId)) {
          return { ok: true, data: await accountProfiles(profileId) };
        }

        const created = await ctx.profileManager.createProfile({ name, skipDefaultWorkspace: true });
        await ctx.profileManager.openProfile(created.id);

        const manager = getOrCreateSyncManager(created.id, ctx);
        await manager.configureWithKey(
          credentials.sessionToken,
          credentials.syncKey,
          remoteProfileId,
          { pushLocal: false },
        );
        ctx.repositories.profiles.setSyncLink(created.id, remoteProfileId);
        ctx.logger.info(`[sync] perfil ${remoteProfileId} de la cuenta traído a este equipo como ${created.id}`);

        return { ok: true, data: await accountProfiles(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_ADOPT_REMOTE_PROFILE);
      }
    },
  );

  // Pausar no desvincula: las credenciales y el cursor se quedan donde están,
  // así que reanudar solo tiene que releer lo que haya pasado mientras tanto.
  ipcMain.handle(
    IPC_CHANNELS.SYNC_SET_PROFILE_PAUSED,
    async (event, payload): Promise<IpcResponse<AccountProfile[]>> => {
      try {
        const { localProfileId, paused } = setProfilePausedSchema.parse(payload);
        const { profileId } = getFrameContext(event, ctx);

        ctx.repositories.profiles.setSyncPaused(localProfileId, paused);
        const manager = ctx.syncManagers.get(localProfileId);
        if (paused) {
          manager?.pause();
        } else if (ctx.profileManager.isOpen(localProfileId)) {
          const target = getOrCreateSyncManager(localProfileId, ctx);
          if (!target.isConfigured()) await target.restoreFromStorage();
        }

        return { ok: true, data: await accountProfiles(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_SET_PROFILE_PAUSED);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_GET_STATUS,
    async (event): Promise<IpcResponse<SyncStatus>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        const status: SyncStatus = manager?.getStatus() ?? {
          configured: false,
          connected: false,
          lastSyncAt: null,
          syncInProgress: false,
          accountEmail: null,
        };
        if (pendingCallbackToken) {
          status.pendingCallbackToken = pendingCallbackToken;
        }
        return { ok: true, data: status };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_GET_STATUS);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_NOW,
    async (event): Promise<IpcResponse<void>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        if (manager?.isConfigured()) {
          // Ciclo completo: entidades, vault y notas rápidas.
          await manager.pushAllLocal();
          await manager.syncAll();
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_NOW);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_GET_DEVICES,
    async (event): Promise<IpcResponse<DeviceInfo[]>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        const devices = (await manager?.getDevices()) ?? [];
        return { ok: true, data: devices as DeviceInfo[] };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_GET_DEVICES);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_DISCONNECT_DEVICE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { tokenSuffix } = disconnectDeviceSchema.parse(payload);
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        await manager?.disconnectDevice(tokenSuffix);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_DISCONNECT_DEVICE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_DEACTIVATE,
    async (event): Promise<IpcResponse<void>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        if (manager) {
          await manager.deactivate();
          manager.destroy();
          ctx.syncManagers.delete(profileId);
        }
        ctx.repositories.profiles.setSyncLink(profileId, null);
        ctx.repositories.profiles.setSyncPaused(profileId, false);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_DEACTIVATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_UPDATE_DEVICE_NAME,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { name } = updateDeviceNameSchema.parse(payload);
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        if (manager?.isConfigured()) {
          await fetch(`${SERVER_URL}/sync/device-name`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${manager.getSessionToken()!}`,
            },
            body: JSON.stringify({ name }),
          });
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_UPDATE_DEVICE_NAME);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RECOVERY_CARD_DOWNLOAD_PDF,
    async (event, payload): Promise<IpcResponse<{ filePath: string }>> => {
      try {
        const { email, date } = recoveryCardPdfSchema.parse(payload);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) {
          return { ok: false, error: 'INTERNAL', details: 'No window found' };
        }

        const data = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'default' },
        });

        const downloadsDir = app.getPath('downloads');
        const fileName = `vela-recovery-card-${date.replace(/\s/g, '-')}.pdf`;
        const filePath = path.join(downloadsDir, fileName);
        fs.writeFileSync(filePath, data);
        await shell.openPath(filePath);

        return { ok: true, data: { filePath } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RECOVERY_CARD_DOWNLOAD_PDF);
      }
    },
  );
}
