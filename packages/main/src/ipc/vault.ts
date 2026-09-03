import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ipcMain, BrowserWindow, dialog, screen } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcResponse,
  type VaultEntry,
  type VaultEntrySummary,
  type VaultPendingInfo,
} from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext, resolveWindowId } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { applyGlassUrlParams, applyNativeMaterial } from './popupUtils';
import type { GlassParams } from './popupUtils';

function readGlass(repos: { settings: { get(key: string): string | null | undefined } }): GlassParams | null {
  if (repos.settings.get('ui:glassmorphism') !== 'true') return null;
  const intensity = Number(repos.settings.get('ui:glassmorphism-intensity') ?? 60);
  const opacity = Number(repos.settings.get('ui:glassmorphism-opacity') ?? 60);
  return {
    blurPx: Math.round(16 + (intensity / 100) * 8),
    bgOpacity: parseFloat((0.20 + (opacity / 100) * 0.65).toFixed(2)),
  };
}

const SAVE_MODAL_WIDTH = 360;
const SAVE_MODAL_HEIGHT = 200;
const AUTOFILL_MODAL_WIDTH = 320;
const AUTOFILL_MODAL_HEIGHT_BASE = 140;
const AUTOFILL_MODAL_ROW_HEIGHT = 60;
const AUTOFILL_MODAL_MAX_HEIGHT = 400;

const INTERNAL_PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');

const activeSaveModals = new Map<number, BrowserWindow>();
const activeAutofillModals = new Map<number, BrowserWindow>();

// Credenciales pendientes de guardar por ventana (en memoria).
const pendingCredentials = new Map<number, {
  tabId: string;
  domain: string;
  loginUrl: string;
  username: string;
  password: string;
  hasExisting: boolean;
  existingId: string | null;
}>();

// Credenciales recién enviadas por un formulario, aún sin confirmar. No se
// ofrecen al usuario hasta que la pestaña navega (o su formulario desaparece):
// una contraseña rechazada no debe acabar en el vault.
interface ProvisionalCredentials {
  username: string;
  password: string;
  loginUrl: string;
  dispose: () => void;
}
const provisionalCredentials = new Map<number, ProvisionalCredentials>();

const PROVISIONAL_TTL_MS = 20_000;

/** Compara origen + ruta: el query y el hash cambian en los redirects de error. */
function samePage(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname;
  } catch {
    return false;
  }
}

export function registerVaultHandlers(ctx: IpcContext): void {

  /** Descarta la oferta de guardado de una ventana y avisa a su renderer. */
  function clearPending(windowId: number): void {
    if (!pendingCredentials.delete(windowId)) return;
    const win = BrowserWindow.fromId(windowId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_EVENTS.VAULT_PENDING_CLEARED, { windowId });
    }
  }

  // ── vault:is-unlocked ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_IS_UNLOCKED,
    async (event): Promise<IpcResponse<{ unlocked: boolean }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_IS_UNLOCKED);
        const { profileId } = getFrameContext(event, ctx);
        const unlocked = ctx.profileManager.isOpen(profileId);
        return { ok: true, data: { unlocked } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_IS_UNLOCKED);
      }
    },
  );

  // ── vault:list ─────────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_LIST,
    async (event): Promise<IpcResponse<VaultEntrySummary[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_LIST);
        const { repos } = getFrameContext(event, ctx);
        return { ok: true, data: repos.passwordVault.listAll() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_LIST);
      }
    },
  );

  // ── vault:list-folders ─────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_LIST_FOLDERS,
    async (event): Promise<IpcResponse<string[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_LIST_FOLDERS);
        const { repos } = getFrameContext(event, ctx);
        return { ok: true, data: repos.passwordVault.listFolders() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_LIST_FOLDERS);
      }
    },
  );

  // ── vault:search ───────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_SEARCH,
    async (event, payload): Promise<IpcResponse<VaultEntrySummary[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_SEARCH);
        const { repos } = getFrameContext(event, ctx);
        const { query } = payload as { query: string };
        return { ok: true, data: repos.passwordVault.search(query) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_SEARCH);
      }
    },
  );

  // ── vault:get-for-domain ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_GET_FOR_DOMAIN,
    async (event, payload): Promise<IpcResponse<VaultEntry[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_GET_FOR_DOMAIN);
        const { repos } = getFrameContext(event, ctx);
        const { domain } = payload as { domain: string };
        const entries = repos.passwordVault.retrieveForDomain(domain);
        return { ok: true, data: entries };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_GET_FOR_DOMAIN);
      }
    },
  );

  // ── vault:retrieve ─────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_RETRIEVE,
    async (event, payload): Promise<IpcResponse<VaultEntry | null>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_RETRIEVE);
        const { repos } = getFrameContext(event, ctx);
        const { id } = payload as { id: string };
        return { ok: true, data: repos.passwordVault.retrieve(id) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_RETRIEVE);
      }
    },
  );

  // ── vault:save ─────────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_SAVE,
    async (event, payload): Promise<IpcResponse<VaultEntrySummary>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_SAVE);
        const { repos } = getFrameContext(event, ctx);
        const { domain, loginUrl, username, password, folder, notes } = payload as {
          domain: string;
          loginUrl: string;
          username: string;
          password: string;
          folder?: string;
          notes?: string;
        };
        const id = repos.passwordVault.store({ domain, loginUrl, username, password, folder, notes });
        const entry = repos.passwordVault.listAll().find((e) => e.id === id);
        return { ok: true, data: entry! };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_SAVE);
      }
    },
  );

  // ── vault:update ───────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_UPDATE,
    async (event, payload): Promise<IpcResponse<VaultEntry>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_UPDATE);
        const { repos } = getFrameContext(event, ctx);
        const { id, ...patch } = payload as {
          id: string;
          username?: string;
          password?: string;
          notes?: string;
          folder?: string;
          loginUrl?: string;
        };
        const updated = repos.passwordVault.update(id, patch);
        return { ok: true, data: updated };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_UPDATE);
      }
    },
  );

  // ── vault:delete ───────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_DELETE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_DELETE);
        const { repos } = getFrameContext(event, ctx);
        const { id } = payload as { id: string };
        repos.passwordVault.delete(id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_DELETE);
      }
    },
  );

  // ── vault:mark-used ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_MARK_USED,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_MARK_USED);
        const { repos } = getFrameContext(event, ctx);
        const { id } = payload as { id: string };
        repos.passwordVault.markUsed(id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_MARK_USED);
      }
    },
  );

  // ── vault:fill ─────────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_FILL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_FILL);
        const { tabId, username, password } = payload as {
          tabId: string;
          username: string;
          password: string;
        };
        const wcv = ctx.tabManager.getWcvForTab(tabId);
        if (!wcv) return { ok: true, data: undefined };

        const safeUsername = JSON.stringify(username);
        const safePassword = JSON.stringify(password);
        await wcv.webContents.executeJavaScript(
          `(function() {
            // Use native value setter so React's synthetic event system detects the change
            function fillInput(el, value) {
              try {
                const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                if (desc && desc.set) {
                  desc.set.call(el, value);
                } else {
                  el.value = value;
                }
              } catch (_) {
                el.value = value;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Priority-ordered selectors for username/email field
            const usernameSelectors = [
              'input[autocomplete="username"]',
              'input[autocomplete="email"]',
              'input[type="email"]',
              'input[name="email"]',
              'input[name="username"]',
              'input[name="user"]',
              'input[name="login"]',
              'input[id="email"]',
              'input[id="username"]',
              'input[name*="email"]',
              'input[name*="user"]',
              'input[name*="login"]',
              'input[type="text"]',
            ];

            let usernameField = null;
            for (const sel of usernameSelectors) {
              const el = document.querySelector(sel);
              if (el) { usernameField = el; break; }
            }

            const passwordField = document.querySelector('input[type="password"]');

            if (usernameField) fillInput(usernameField, ${safeUsername});
            if (passwordField) fillInput(passwordField, ${safePassword});
          })()`,
          true,
        );
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_FILL);
      }
    },
  );

  // ── vault:open-save-modal ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_OPEN_SAVE_MODAL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_OPEN_SAVE_MODAL);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };

        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = activeSaveModals.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { domain, loginUrl, username, password, hasExisting, existingId } = payload as {
          domain: string;
          loginUrl: string;
          username: string;
          password: string;
          hasExisting: boolean;
          existingId: string | null;
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const originTabId = ctx.tabManager.getActiveTabId(parentWindowId);
        if (!originTabId) return { ok: true, data: undefined };
        pendingCredentials.set(parentWindowId, { tabId: originTabId, domain, loginUrl, username, password, hasExisting, existingId });

        // Posición: esquina inferior derecha de la ventana padre
        const pos = parentWin.getBounds();
        const x = pos.x + pos.width - SAVE_MODAL_WIDTH - 16;
        const y = pos.y + pos.height - SAVE_MODAL_HEIGHT - 48;

        const display = screen.getDisplayNearestPoint({ x, y });
        const { bounds } = display;
        const clampedX = Math.max(bounds.x + 4, Math.min(x, bounds.x + bounds.width - SAVE_MODAL_WIDTH - 4));
        const clampedY = Math.max(bounds.y + 4, Math.min(y, bounds.y + bounds.height - SAVE_MODAL_HEIGHT - 4));

        const preloadPath = fs.existsSync(INTERNAL_PRELOAD_PATH) ? INTERNAL_PRELOAD_PATH : undefined;

        const modalWin = new BrowserWindow({
          width: SAVE_MODAL_WIDTH,
          height: SAVE_MODAL_HEIGHT,
          x: clampedX,
          y: clampedY,
          frame: false,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          show: false,
          roundedCorners: true,
          ...(glass ? { transparent: true, backgroundColor: '#00000000' } : { backgroundColor: '#1c1f26' }),
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            ...(preloadPath ? { preload: preloadPath } : {}),
          },
        });

        if (glass) applyNativeMaterial(modalWin);
        activeSaveModals.set(parentWindowId, modalWin);
        ctx.profileWindowManager.registerAuxiliaryWindow(modalWin.id, profileId);

        const pageUrl = new URL('vela://vault-save-modal');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('domain', domain);
        pageUrl.searchParams.set('loginUrl', loginUrl);
        pageUrl.searchParams.set('username', username);
        pageUrl.searchParams.set('hasExisting', String(hasExisting));
        if (existingId) pageUrl.searchParams.set('existingId', existingId);
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await modalWin.loadURL(pageUrl.toString());
        modalWin.show();

        modalWin.on('blur', () => {
          if (!modalWin.isDestroyed()) modalWin.close();
        });

        modalWin.on('closed', () => {
          ctx.profileWindowManager.unregisterAuxiliaryWindow(modalWin.id);
          if (activeSaveModals.get(parentWindowId) === modalWin) {
            activeSaveModals.delete(parentWindowId);
          }
        });

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_OPEN_SAVE_MODAL);
      }
    },
  );

  // ── vault:close-save-modal ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_CLOSE_SAVE_MODAL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_CLOSE_SAVE_MODAL);
        const { windowId, decided } = payload as { windowId: number; decided?: boolean };
        // Solo una decisión explícita (guardar / no guardar) retira la oferta;
        // si la modal se cierra por perder el foco, el icono la sigue ofreciendo.
        if (decided) clearPending(windowId);
        const win = activeSaveModals.get(windowId);
        if (win && !win.isDestroyed()) win.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_CLOSE_SAVE_MODAL);
      }
    },
  );

  // ── vault:open-autofill-modal ─────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_OPEN_AUTOFILL_MODAL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_OPEN_AUTOFILL_MODAL);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };

        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = activeAutofillModals.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { tabId, domain, anchorRect } = payload as {
          tabId: string;
          domain: string;
          anchorRect: { right: number; bottom: number };
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const entries = repos.passwordVault.listForDomain(domain);
        const modalHeight = Math.min(
          AUTOFILL_MODAL_HEIGHT_BASE + entries.length * AUTOFILL_MODAL_ROW_HEIGHT,
          AUTOFILL_MODAL_MAX_HEIGHT,
        );

        const pos = parentWin.getPosition();
        const winX = pos[0] ?? 0;
        const winY = pos[1] ?? 0;
        let x = winX + Math.round(anchorRect.right) - AUTOFILL_MODAL_WIDTH;
        let y = winY + Math.round(anchorRect.bottom) + 6;

        const display = screen.getDisplayNearestPoint({ x, y });
        const { bounds } = display;
        x = Math.max(bounds.x + 4, Math.min(x, bounds.x + bounds.width - AUTOFILL_MODAL_WIDTH - 4));
        y = Math.max(bounds.y + 4, Math.min(y, bounds.y + bounds.height - modalHeight - 4));

        const preloadPath = fs.existsSync(INTERNAL_PRELOAD_PATH) ? INTERNAL_PRELOAD_PATH : undefined;

        const modalWin = new BrowserWindow({
          width: AUTOFILL_MODAL_WIDTH,
          height: modalHeight,
          x,
          y,
          frame: false,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          show: false,
          roundedCorners: true,
          ...(glass ? { transparent: true, backgroundColor: '#00000000' } : { backgroundColor: '#1c1f26' }),
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            ...(preloadPath ? { preload: preloadPath } : {}),
          },
        });

        if (glass) applyNativeMaterial(modalWin);
        activeAutofillModals.set(parentWindowId, modalWin);
        ctx.profileWindowManager.registerAuxiliaryWindow(modalWin.id, profileId);

        const pageUrl = new URL('vela://vault-autofill-modal');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('tabId', tabId);
        pageUrl.searchParams.set('domain', domain);
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await modalWin.loadURL(pageUrl.toString());
        modalWin.show();

        modalWin.on('blur', () => {
          if (!modalWin.isDestroyed()) modalWin.close();
        });

        modalWin.on('closed', () => {
          ctx.profileWindowManager.unregisterAuxiliaryWindow(modalWin.id);
          if (activeAutofillModals.get(parentWindowId) === modalWin) {
            activeAutofillModals.delete(parentWindowId);
          }
        });

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_OPEN_AUTOFILL_MODAL);
      }
    },
  );

  // ── vault:close-autofill-modal ────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_CLOSE_AUTOFILL_MODAL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_CLOSE_AUTOFILL_MODAL);
        const { windowId } = payload as { windowId: number };
        const win = activeAutofillModals.get(windowId);
        if (win && !win.isDestroyed()) win.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_CLOSE_AUTOFILL_MODAL);
      }
    },
  );

  // ── vault:export ───────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_EXPORT,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_EXPORT);
        const { repos } = getFrameContext(event, ctx);
        const { protectionPassword } = payload as { protectionPassword: string };

        const parentWindowId = resolveWindowId(event);
        const parentWin = parentWindowId !== null ? BrowserWindow.fromId(parentWindowId) : null;

        const { filePath } = await dialog.showSaveDialog(parentWin ?? BrowserWindow.getFocusedWindow()!, {
          title: 'Exportar contraseñas',
          defaultPath: `vela-passwords-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON cifrado', extensions: ['json'] }],
        });

        if (!filePath) return { ok: true, data: undefined };

        const entries = repos.passwordVault.exportAll();
        const plaintext = JSON.stringify(entries, null, 2);

        // Cifrar con AES-256-GCM usando la contraseña de protección
        const salt = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);
        const derivedKey = crypto.pbkdf2Sync(protectionPassword, salt, 100_000, 32, 'sha256');
        const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        const exportData = {
          v: 1,
          algo: 'aes-256-gcm',
          kdf: 'pbkdf2-sha256',
          iterations: 100_000,
          salt: salt.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64'),
          data: encrypted.toString('base64'),
        };

        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_EXPORT);
      }
    },
  );

  // ── vault:import-csv ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VAULT_IMPORT_CSV,
    async (event): Promise<IpcResponse<{ imported: number; skipped: number }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_IMPORT_CSV);
        const { repos } = getFrameContext(event, ctx);

        const parentWindowId = resolveWindowId(event);
        const parentWin = parentWindowId !== null ? BrowserWindow.fromId(parentWindowId) : null;

        const { filePaths } = await dialog.showOpenDialog(parentWin ?? BrowserWindow.getFocusedWindow()!, {
          title: 'Importar contraseñas',
          filters: [{ name: 'CSV', extensions: ['csv'] }],
          properties: ['openFile'],
        });

        if (!filePaths.length) return { ok: true, data: { imported: 0, skipped: 0 } };

        const content = fs.readFileSync(filePaths[0]!, 'utf-8');
        const parsed = parseCsv(content);

        let imported = 0;
        let skipped = 0;

        for (const row of parsed) {
          if (!row.username || !row.password || !row.domain) { skipped++; continue; }
          const existing = repos.passwordVault.listForDomain(row.domain)
            .find((e) => e.username === row.username);
          if (existing) { skipped++; continue; }
          repos.passwordVault.store({
            domain: row.domain,
            loginUrl: row.url ?? undefined,
            username: row.username,
            password: row.password,
            notes: row.notes ?? undefined,
          });
          imported++;
        }

        return { ok: true, data: { imported, skipped } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_IMPORT_CSV);
      }
    },
  );

  // ── vault:credentials-detected (from webTab preload, ipcMain.on) ───────────
  // Llega en cuanto el usuario envía un formulario con contraseña. Todavía no
  // sabemos si el login ha funcionado, así que la oferta queda en suspenso
  // hasta que la pestaña navegue a otra página (o su formulario desaparezca,
  // caso de los logins SPA que avisa `vault:credentials-confirm`).
  ipcMain.on('vault:credentials-detected', (event, payload: unknown) => {
    const data = payload as { username: string; password: string; loginUrl: string } | null;
    if (!data?.username || !data?.password || !data?.loginUrl) return;

    const wc = event.sender;
    const wcId = wc.id;

    // Un formulario nuevo reemplaza al anterior de la misma pestaña.
    provisionalCredentials.get(wcId)?.dispose();

    const onNavigate = (_e: unknown, url: string): void => {
      // Seguir en la misma página suele significar credenciales rechazadas;
      // esperamos a una navegación real dentro del TTL.
      if (samePage(url, data.loginUrl)) return;
      confirmCredentials(wcId);
    };
    const onDestroyed = (): void => {
      provisionalCredentials.get(wcId)?.dispose();
    };

    const timer = setTimeout(() => {
      provisionalCredentials.get(wcId)?.dispose();
    }, PROVISIONAL_TTL_MS);

    provisionalCredentials.set(wcId, {
      username: data.username,
      password: data.password,
      loginUrl: data.loginUrl,
      dispose: () => {
        clearTimeout(timer);
        provisionalCredentials.delete(wcId);
        if (!wc.isDestroyed()) {
          wc.off('did-navigate', onNavigate);
          wc.off('did-navigate-in-page', onNavigate);
          wc.off('destroyed', onDestroyed);
        }
      },
    });

    wc.on('did-navigate', onNavigate);
    wc.on('did-navigate-in-page', onNavigate);
    wc.once('destroyed', onDestroyed);
  });

  // ── vault:credentials-confirm (from webTab preload, ipcMain.on) ────────────
  // El formulario de login desapareció sin navegación: login SPA correcto.
  ipcMain.on('vault:credentials-confirm', (event) => {
    confirmCredentials(event.sender.id);
  });

  /**
   * Convierte las credenciales provisionales de una pestaña en una oferta de
   * guardado visible en la barra de direcciones.
   */
  function confirmCredentials(wcId: number): void {
    const provisional = provisionalCredentials.get(wcId);
    if (!provisional) return;
    provisional.dispose();

    try {
      const tabId = ctx.tabManager.getTabIdForWebContents(wcId);
      if (!tabId) return;

      const windowId = ctx.tabManager.getWindowIdForTab(tabId);
      if (windowId === null) return;

      const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
      if (!profileId) return;

      let domain = '';
      try { domain = new URL(provisional.loginUrl).hostname; } catch { return; }

      const repos = ctx.profileManager.getRepositories(profileId);
      const existing = repos.passwordVault.listForDomain(domain);
      const match = existing.find((e) => e.username === provisional.username);

      pendingCredentials.set(windowId, {
        tabId,
        domain,
        loginUrl: provisional.loginUrl,
        username: provisional.username,
        password: provisional.password,
        hasExisting: !!match,
        existingId: match?.id ?? null,
      });

      ctx.events.emit(IPC_EVENTS.VAULT_CREDENTIALS_PENDING, {
        windowId,
        tabId,
        domain,
        loginUrl: provisional.loginUrl,
        username: provisional.username,
        hasExisting: !!match,
        existingId: match?.id ?? null,
      });
    } catch {
      // Perfil bloqueado o pestaña ya cerrada: no hay oferta que mostrar.
    }
  }

  // ── vault:get-pending ─────────────────────────────────────────────────────
  // El evento push llega durante la navegación post-login, justo cuando el
  // renderer reinicia el estado del icono de llave por el cambio de URL. El
  // botón lo vuelve a consultar en cada navegación para no perder la oferta.
  ipcMain.handle(
    IPC_CHANNELS.VAULT_GET_PENDING,
    async (event, payload): Promise<IpcResponse<VaultPendingInfo | null>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_GET_PENDING);
        const { windowId } = payload as { windowId: unknown };
        if (typeof windowId !== 'number') return { ok: true, data: null };
        const creds = pendingCredentials.get(windowId);
        if (!creds) return { ok: true, data: null };
        return {
          ok: true,
          data: {
            tabId: creds.tabId,
            domain: creds.domain,
            loginUrl: creds.loginUrl,
            username: creds.username,
            hasExisting: creds.hasExisting,
            existingId: creds.existingId,
          },
        };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_GET_PENDING);
      }
    },
  );

  // ── vault:open-pending-save-modal ─────────────────────────────────────────
  // Abre la modal de guardado usando las credenciales pendientes almacenadas.
  // El renderer llama esto cuando el usuario hace clic en el icono de llave
  // con estado "pendiente".
  ipcMain.handle(
    IPC_CHANNELS.VAULT_OPEN_PENDING_SAVE_MODAL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_OPEN_PENDING_SAVE_MODAL);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };

        const creds = pendingCredentials.get(parentWindowId);
        if (!creds) return { ok: true, data: undefined };

        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = activeSaveModals.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.focus();
          return { ok: true, data: undefined };
        }

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);

        const pos = parentWin.getBounds();
        const x = pos.x + pos.width - SAVE_MODAL_WIDTH - 16;
        const y = pos.y + pos.height - SAVE_MODAL_HEIGHT - 48;

        const display = screen.getDisplayNearestPoint({ x, y });
        const { bounds } = display;
        const clampedX = Math.max(bounds.x + 4, Math.min(x, bounds.x + bounds.width - SAVE_MODAL_WIDTH - 4));
        const clampedY = Math.max(bounds.y + 4, Math.min(y, bounds.y + bounds.height - SAVE_MODAL_HEIGHT - 4));

        const preloadPath = fs.existsSync(INTERNAL_PRELOAD_PATH) ? INTERNAL_PRELOAD_PATH : undefined;

        const modalWin = new BrowserWindow({
          width: SAVE_MODAL_WIDTH,
          height: SAVE_MODAL_HEIGHT,
          x: clampedX,
          y: clampedY,
          frame: false,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          show: false,
          roundedCorners: true,
          ...(glass ? { transparent: true, backgroundColor: '#00000000' } : { backgroundColor: '#1c1f26' }),
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            ...(preloadPath ? { preload: preloadPath } : {}),
          },
        });

        if (glass) applyNativeMaterial(modalWin);
        activeSaveModals.set(parentWindowId, modalWin);
        ctx.profileWindowManager.registerAuxiliaryWindow(modalWin.id, profileId);

        const pageUrl = new URL('vela://vault-save-modal');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('domain', creds.domain);
        pageUrl.searchParams.set('loginUrl', creds.loginUrl);
        pageUrl.searchParams.set('username', creds.username);
        pageUrl.searchParams.set('password', creds.password);
        pageUrl.searchParams.set('hasExisting', String(creds.hasExisting));
        if (creds.existingId) pageUrl.searchParams.set('existingId', creds.existingId);
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await modalWin.loadURL(pageUrl.toString());
        modalWin.show();

        modalWin.on('blur', () => {
          if (!modalWin.isDestroyed()) modalWin.close();
        });

        modalWin.on('closed', () => {
          ctx.profileWindowManager.unregisterAuxiliaryWindow(modalWin.id);
          if (activeSaveModals.get(parentWindowId) === modalWin) {
            activeSaveModals.delete(parentWindowId);
          }
        });

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_OPEN_PENDING_SAVE_MODAL);
      }
    },
  );

  // ── vault:open-manager ────────────────────────────────────────────────────
  // Cierra la modal de autorrelleno y abre vela://passwords en el main window.
  // El payload debe incluir el windowId del main window (no de la modal).
  ipcMain.handle(
    IPC_CHANNELS.VAULT_OPEN_MANAGER,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_OPEN_MANAGER);
        const { windowId } = payload as { windowId: number };

        // Cerrar modal si está abierta
        const modal = activeAutofillModals.get(windowId);
        if (modal && !modal.isDestroyed()) modal.close();

        const workspaceId = ctx.tabManager.getWorkspaceForWindow(windowId);
        if (!workspaceId) return { ok: true, data: undefined };

        await ctx.tabManager.createTab(windowId, {
          workspaceId,
          parentId: null,
          url: 'vela://passwords',
          activate: true,
        });

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_OPEN_MANAGER);
      }
    },
  );
  // ── vault:count-for-domain ────────────────────────────────────────────────
  // Cuenta credenciales sin descifrar. Funciona aunque el vault esté bloqueado.
  ipcMain.handle(
    IPC_CHANNELS.VAULT_COUNT_FOR_DOMAIN,
    async (event, payload): Promise<IpcResponse<{ count: number }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_COUNT_FOR_DOMAIN);
        const { repos } = getFrameContext(event, ctx);
        const { domain } = payload as { domain: string };
        const count = repos.passwordVault.listForDomain(domain).length;
        return { ok: true, data: { count } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_COUNT_FOR_DOMAIN);
      }
    },
  );

  // ── vault:open-and-fill ───────────────────────────────────────────────────
  // Abre una nueva pestaña con loginUrl y rellena las credenciales cuando carga.
  ipcMain.handle(
    IPC_CHANNELS.VAULT_OPEN_AND_FILL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VAULT_OPEN_AND_FILL);
        const { windowId, loginUrl, username, password } = payload as {
          windowId: number;
          loginUrl: string;
          username: string;
          password: string;
        };

        const workspaceId = ctx.tabManager.getWorkspaceForWindow(windowId);
        if (!workspaceId) return { ok: true, data: undefined };

        const tab = await ctx.tabManager.createTab(windowId, {
          workspaceId,
          parentId: null,
          url: loginUrl,
          activate: true,
        });

        const wcv = ctx.tabManager.getWcvForTab(tab.id);
        if (!wcv) return { ok: true, data: undefined };

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 15_000);
          wcv.webContents.once('did-finish-load', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        const safeUsername = JSON.stringify(username);
        const safePassword = JSON.stringify(password);
        await wcv.webContents.executeJavaScript(
          `(function() {
            function fillInput(el, value) {
              try {
                const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                if (desc && desc.set) { desc.set.call(el, value); } else { el.value = value; }
              } catch (_) { el.value = value; }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const usernameSelectors = [
              'input[autocomplete="username"]', 'input[autocomplete="email"]',
              'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
              'input[name="user"]', 'input[name="login"]', 'input[id="email"]',
              'input[id="username"]', 'input[name*="email"]', 'input[name*="user"]',
              'input[name*="login"]', 'input[type="text"]',
            ];
            let usernameField = null;
            for (const sel of usernameSelectors) {
              const el = document.querySelector(sel);
              if (el) { usernameField = el; break; }
            }
            const passwordField = document.querySelector('input[type="password"]');
            if (usernameField) fillInput(usernameField, ${safeUsername});
            if (passwordField) fillInput(passwordField, ${safePassword});
          })()`,
          true,
        );

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VAULT_OPEN_AND_FILL);
      }
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CsvRow {
  domain: string;
  url: string;
  username: string;
  password: string;
  notes: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const results: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });

    // Chrome CSV: name, url, username, password
    // Firefox CSV: url, username, password, httpRealm, formActionOrigin, guid, timeCreated, timeLastUsed, timePasswordChanged
    // Bitwarden CSV: folder, favorite, type, name, notes, fields, reprompt, login_uri, login_username, login_password

    const url = row['url'] ?? row['login_uri'] ?? '';
    const username = row['username'] ?? row['login_username'] ?? '';
    const password = row['password'] ?? row['login_password'] ?? '';
    const notes = row['notes'] ?? '';

    let domain = '';
    try { domain = new URL(url).hostname; } catch { domain = url; }

    results.push({ domain, url, username, password, notes });
  }

  return results;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
