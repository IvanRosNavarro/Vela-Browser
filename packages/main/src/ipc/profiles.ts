import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { isBlindedProfile } from '../profiles/blindedProfileUtils';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  createProfileInputSchema,
  profileArchiveInputSchema,
  profileDeleteInputSchema,
  profileLockInputSchema,
  profileOpenWindowInputSchema,
  profileRemoveMasterPasswordInputSchema,
  profileReorderInputSchema,
  profileSetMasterPasswordInputSchema,
  unlockProfileInputSchema,
  updateProfileInputSchema,
  type IpcResponse,
  type Profile,
  type ProfileUnlockResult,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { CannotDeleteOpenProfileError } from '../profiles/ProfileWindowManager';
import {
  InvalidMasterPasswordError,
  MasterPasswordRequiredError,
} from '../profiles/ProfileManager';
import { ProfileNotFoundError } from '../storage/repositories';
import { InvariantViolationError } from '../lib/errors';

function resolveWindowId(event: IpcMainInvokeEvent): number | null {
  const win =
    BrowserWindow.fromWebContents(event.sender) ??
    (event.sender as typeof event.sender & { getOwnerBrowserWindow?(): BrowserWindow | null }).getOwnerBrowserWindow?.() ??
    null;
  return win?.id ?? null;
}

export function registerProfileHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_LIST,
    async (event): Promise<IpcResponse<Profile[]>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_LIST);
      try {
        // Excluir perfiles temporales de ventanas fantasma del listado.
        return { ok: true, data: ctx.repositories.profiles.list().filter((p) => !isBlindedProfile(p)) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_LIST);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_LIST_ARCHIVED,
    async (event): Promise<IpcResponse<Profile[]>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_LIST_ARCHIVED);
      try {
        return { ok: true, data: ctx.repositories.profiles.listArchived() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_LIST_ARCHIVED);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_GET_ACTIVE,
    async (event): Promise<IpcResponse<{ profileId: string | null }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_GET_ACTIVE);
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'profile:get-active: webContents sin BrowserWindow asociada',
          );
        }
        const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
        return { ok: true, data: { profileId } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_GET_ACTIVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_CREATE,
    async (event, payload): Promise<IpcResponse<Profile>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_CREATE);
      const parsed = createProfileInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const profile = await ctx.profileManager.createProfile({
          name: parsed.data.name,
          icon: parsed.data.icon ?? null,
          color: parsed.data.color ?? null,
          ...(parsed.data.masterPassword
            ? { masterPassword: parsed.data.masterPassword }
            : {}),
          passwordHint: parsed.data.passwordHint ?? null,
        });
        return { ok: true, data: profile };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_CREATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_UPDATE,
    async (event, payload): Promise<IpcResponse<Profile>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_UPDATE);
      const parsed = updateProfileInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const { id, ...patch } = parsed.data;
        const profile = ctx.repositories.profiles.update(id, patch);
        ctx.events.emit(IPC_EVENTS.PROFILES_CHANGED);
        return { ok: true, data: profile };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_UPDATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_DELETE,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_DELETE);
      const parsed = profileDeleteInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        if (ctx.profileWindowManager.hasOpenWindowsForProfile(parsed.data.id)) {
          throw new CannotDeleteOpenProfileError(parsed.data.id);
        }
        await ctx.profileManager.deleteProfile(parsed.data.id);
        ctx.unlockRateLimiter.reset(parsed.data.id);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_DELETE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_ARCHIVE,
    async (event, payload): Promise<IpcResponse<Profile>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_ARCHIVE);
      const parsed = profileArchiveInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const profile = ctx.repositories.profiles.archive(
          parsed.data.id,
          parsed.data.archived,
        );
        ctx.events.emit(IPC_EVENTS.PROFILES_CHANGED);
        return { ok: true, data: profile };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_ARCHIVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_REORDER,
    async (event, payload): Promise<IpcResponse<Profile>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_REORDER);
      const parsed = profileReorderInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const profile = ctx.repositories.profiles.reorder(
          parsed.data.id,
          parsed.data.newPosition,
        );
        ctx.events.emit(IPC_EVENTS.PROFILES_CHANGED);
        return { ok: true, data: profile };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_REORDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_UNLOCK,
    async (event, payload): Promise<IpcResponse<ProfileUnlockResult>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_UNLOCK);
      const parsed = unlockProfileInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      const profileId = parsed.data.id;
      try {
        ctx.unlockRateLimiter.ensureCanAttempt(profileId);
        try {
          await ctx.profileManager.openProfile(
            profileId,
            parsed.data.masterPassword,
          );
        } catch (err) {
          if (err instanceof InvalidMasterPasswordError) {
            const { failedAttempts } =
              ctx.unlockRateLimiter.recordFailure(profileId);
            const wrapped = new InvalidMasterPasswordError(
              profileId,
              failedAttempts,
            );
            return mapError(wrapped, IPC_CHANNELS.PROFILE_UNLOCK);
          }
          if (err instanceof MasterPasswordRequiredError) {
            return mapError(err, IPC_CHANNELS.PROFILE_UNLOCK);
          }
          throw err;
        }
        ctx.unlockRateLimiter.recordSuccess(profileId);
        return { ok: true, data: { ok: true, profileId } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_UNLOCK);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_LOCK,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_LOCK);
      const parsed = profileLockInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        // Cerrar el perfil sólo es seguro cuando no hay ventanas abiertas
        // (cada WebContentsView referencia la BD vía repositorios). Si las
        // hay, el cierre se hará al cerrarse la última ventana.
        if (
          ctx.profileWindowManager.hasOpenWindowsForProfile(parsed.data.id)
        ) {
          // Cerramos las ventanas; el handler de "closed" se encarga de
          // closeProfile cuando se cierre la última.
          for (const windowId of ctx.profileWindowManager.getWindowsForProfile(
            parsed.data.id,
          )) {
            const win = BrowserWindow.fromId(windowId);
            if (win && !win.isDestroyed()) win.close();
          }
        } else {
          await ctx.profileManager.closeProfile(parsed.data.id);
        }
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_LOCK);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_SET_MASTER_PASSWORD,
    async (event, payload): Promise<IpcResponse<Profile>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_SET_MASTER_PASSWORD);
      const parsed = profileSetMasterPasswordInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const existing = ctx.repositories.profiles.getById(parsed.data.id);
        if (!existing) {
          return mapError(
            new ProfileNotFoundError(parsed.data.id),
            IPC_CHANNELS.PROFILE_SET_MASTER_PASSWORD,
          );
        }
        // El keyring necesita el perfil desbloqueado para reenvolver la clave.
        // Si no lo está, lo abrimos transitoriamente: con perfiles sin
        // contraseña actual basta openProfile sin password; con perfiles
        // que ya la tienen, el caller envía currentMasterPassword.
        const wasOpen = ctx.profileManager.isOpen(parsed.data.id);
        if (!wasOpen) {
          await ctx.profileManager.openProfile(
            parsed.data.id,
            parsed.data.currentMasterPassword,
          );
        }
        const settings = ctx.profileManager.getRepositories(parsed.data.id)
          .settings;
        await ctx.keyring.setMasterPassword(
          parsed.data.id,
          settings,
          existing.hasMasterPassword
            ? parsed.data.currentMasterPassword ?? null
            : null,
          parsed.data.masterPassword,
        );
        ctx.repositories.profiles.setMasterPasswordEnabled(
          parsed.data.id,
          true,
          parsed.data.hint ?? null,
        );
        ctx.events.emit(IPC_EVENTS.PROFILES_CHANGED);
        const refreshed = ctx.repositories.profiles.getById(parsed.data.id);
        if (!refreshed) {
          throw new InvariantViolationError(
            `setMasterPassword: profile ${parsed.data.id} desaparecido tras update`,
          );
        }
        return { ok: true, data: refreshed };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_SET_MASTER_PASSWORD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_REMOVE_MASTER_PASSWORD,
    async (event, payload): Promise<IpcResponse<Profile>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_REMOVE_MASTER_PASSWORD);
      const parsed = profileRemoveMasterPasswordInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const existing = ctx.repositories.profiles.getById(parsed.data.id);
        if (!existing) {
          return mapError(
            new ProfileNotFoundError(parsed.data.id),
            IPC_CHANNELS.PROFILE_REMOVE_MASTER_PASSWORD,
          );
        }
        if (!existing.hasMasterPassword) {
          // Idempotente: nada que quitar.
          return { ok: true, data: existing };
        }
        const wasOpen = ctx.profileManager.isOpen(parsed.data.id);
        if (!wasOpen) {
          await ctx.profileManager.openProfile(
            parsed.data.id,
            parsed.data.currentMasterPassword,
          );
        }
        const settings = ctx.profileManager.getRepositories(parsed.data.id)
          .settings;
        await ctx.keyring.setMasterPassword(
          parsed.data.id,
          settings,
          parsed.data.currentMasterPassword,
          null,
        );
        ctx.repositories.profiles.setMasterPasswordEnabled(
          parsed.data.id,
          false,
          null,
        );
        ctx.unlockRateLimiter.reset(parsed.data.id);
        ctx.events.emit(IPC_EVENTS.PROFILES_CHANGED);
        const refreshed = ctx.repositories.profiles.getById(parsed.data.id);
        if (!refreshed) {
          throw new InvariantViolationError(
            `removeMasterPassword: profile ${parsed.data.id} desaparecido tras update`,
          );
        }
        return { ok: true, data: refreshed };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_REMOVE_MASTER_PASSWORD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_OPEN_WINDOW,
    async (event, payload): Promise<IpcResponse<{ windowId: number }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_OPEN_WINDOW);
      const parsed = profileOpenWindowInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const opts = parsed.data.workspaceId
          ? { workspaceId: parsed.data.workspaceId }
          : {};
        const window = await ctx.profileWindowManager.openWindow(
          parsed.data.id,
          opts,
        );
        if (parsed.data.withSecureTab) {
          await ctx.tabManager.createSecureTab(window.id);
        }
        return { ok: true, data: { windowId: window.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_OPEN_WINDOW);
      }
    },
  );
}
