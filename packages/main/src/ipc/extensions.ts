import fs from 'node:fs';
import path from 'node:path';
import { ipcMain, dialog, BrowserWindow, app, type Session } from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  z,
  type ExtensionAction,
  type InstalledExtension,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import type { ProfileRepositories } from '../profiles/ProfileManager';
import { getFrameContext } from './helpers';
import { mapError } from './errors';
import { EXTENSIONS_DIR } from '../extensions/loadExtensions';
import { resolveI18nMessage } from '../extensions/manifestI18n';
import { wakeExtensionServiceWorker } from '../extensions/wakeServiceWorker';

const extensionIdSchema = z.object({ extensionId: z.string().min(1) });

const openPopupSchema = z.object({
  extensionId: z.string().min(1),
  anchorRect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});

// ─── Tipos privados ECE ──────────────────────────────────────────────────────

interface EceActionDetails {
  title?: string;
  popup?: string;
  badgeText?: string;
  badgeBackgroundColor?: number[];
  enabled?: boolean;
}

interface EcePrivate {
  api?: {
    browserAction?: {
      getState?(): { actions: Array<{ id: string } & EceActionDetails> };
      activateClick?(details: {
        extensionId: string;
        tabId: number;
        anchorRect: { x: number; y: number; width: number; height: number };
        alignment?: string;
      }): void;
    };
  };
}

function getEcePrivate(session: Session): EcePrivate | null {
  const raw = ElectronChromeExtensions.fromSession(session);
  if (!raw) return null;
  return raw as unknown as EcePrivate;
}

function getEceActionMap(session: Session): Map<string, EceActionDetails> {
  const ece = getEcePrivate(session);
  if (!ece) return new Map();
  try {
    const state = ece.api?.browserAction?.getState?.();
    if (!state) return new Map();
    return new Map(
      state.actions.map((a: { id: string } & EceActionDetails) => [a.id, a]),
    );
  } catch {
    return new Map();
  }
}

function badgeColorToString(color: number[] | undefined): string | null {
  if (!color || color.length < 3) return null;
  const [r, g, b] = color;
  const a = color[3] ?? 255;
  if (a === 0) return null;
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

// ─── Helpers de icono ────────────────────────────────────────────────────────

interface IconFields {
  default_icon?: Record<string, string> | string;
  icons?: Record<string, string> | string;
}

function extractIconRelPath(fields: IconFields): string | null {
  const iconField =
    (fields.default_icon as Record<string, string> | string | undefined) ??
    (fields.icons as Record<string, string> | string | undefined) ??
    null;

  if (typeof iconField === 'string') return iconField;
  if (iconField && typeof iconField === 'object') {
    for (const size of ['48', '32', '64', '128', '16', '19', '24']) {
      const candidate = iconField[size];
      if (candidate) return candidate;
    }
    return Object.values(iconField)[0] ?? null;
  }
  return null;
}

function getIconDataUrl(extension: Electron.Extension): string | null {
  const manifest = extension.manifest as Record<string, unknown>;
  const actionField =
    (manifest['browser_action'] as Record<string, unknown> | undefined) ??
    (manifest['action'] as Record<string, unknown> | undefined) ??
    {};
  const relPath = extractIconRelPath({
    default_icon: actionField['default_icon'] as Record<string, string> | string | undefined,
    icons: manifest['icons'] as Record<string, string> | string | undefined,
  });
  if (!relPath) return null;
  return readIconAsDataUrl(extension.path, relPath);
}

function getIconDataUrlFromManifest(extPath: string, manifest: FullManifest): string | null {
  const actionField = manifest.browser_action ?? manifest.action ?? {};
  const relPath = extractIconRelPath({
    default_icon: actionField.default_icon,
    icons: manifest.icons,
  });
  if (!relPath) return null;
  return readIconAsDataUrl(extPath, relPath);
}

function readIconAsDataUrl(extPath: string, relPath: string): string | null {
  try {
    const fullPath = path.join(extPath, relPath);
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(relPath).toLowerCase();
    const mime =
      ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// ─── Manifest completo ───────────────────────────────────────────────────────

interface ActionManifest {
  default_popup?: string;
  default_icon?: Record<string, string> | string;
}

interface OptionsUiManifest {
  page?: string;
  open_in_tab?: boolean;
}

interface FullManifest {
  name?: string;
  version?: string;
  manifest_version?: number;
  description?: string;
  homepage_url?: string;
  permissions?: string[];
  host_permissions?: string[];
  options_page?: string;
  options_ui?: OptionsUiManifest;
  browser_action?: ActionManifest;
  action?: ActionManifest;
  icons?: Record<string, string> | string;
}

function readFullManifest(extPath: string): FullManifest {
  try {
    const raw = fs.readFileSync(path.join(extPath, 'manifest.json'), 'utf8');
    return JSON.parse(raw) as FullManifest;
  } catch {
    return {};
  }
}

function getOptionsUrl(extensionId: string, manifest: FullManifest): string | null {
  const page = manifest.options_page ?? manifest.options_ui?.page;
  if (!page) return null;
  if (page.startsWith('http')) return page;
  return `chrome-extension://${extensionId}/${page}`;
}

// ─── Construcción de InstalledExtension ──────────────────────────────────────

function buildInstalledExtension(
  extPath: string,
  extId: string,
  name: string,
  version: string,
  manifest: FullManifest,
  enabled: boolean,
): InstalledExtension {
  const mv = manifest.manifest_version;
  const manifestVersion: 2 | 3 = mv === 3 ? 3 : 2;

  const actionField = manifest.browser_action ?? manifest.action ?? {};
  const hasPopup = !!actionField.default_popup;
  const hasOptionsPage = !!(manifest.options_page || manifest.options_ui?.page);

  const resolvedName = resolveI18nMessage(extPath, name);
  const resolvedDesc = resolveI18nMessage(extPath, manifest.description);

  return {
    id: extId,
    name: resolvedName || name,
    version,
    description: resolvedDesc,
    iconUrl: getIconDataUrlFromManifest(extPath, manifest),
    enabled,
    hasPopup,
    hasOptionsPage,
    homepageUrl: manifest.homepage_url ?? null,
    permissions: Array.isArray(manifest.permissions) ? manifest.permissions.filter(p => typeof p === 'string') : [],
    hostPermissions: Array.isArray(manifest.host_permissions) ? manifest.host_permissions.filter(p => typeof p === 'string') : [],
    manifestVersion,
    installPath: extPath,
  };
}

// ─── build ExtensionAction (barra de título) ─────────────────────────────────

function buildExtensionActions(session: Session, unpinnedIds: Set<string>): ExtensionAction[] {
  const extensions = session.extensions.getAllExtensions();
  const eceMap = getEceActionMap(session);
  const actions: ExtensionAction[] = [];

  for (const ext of extensions) {
    if (unpinnedIds.has(ext.id)) continue; // despineado por el usuario
    const manifest = ext.manifest as Record<string, unknown>;
    const hasBrowserAction = 'browser_action' in manifest || 'action' in manifest;
    if (!hasBrowserAction) continue;

    const eceDetails = eceMap.get(ext.id);
    const actionManifest =
      (manifest['browser_action'] as Record<string, unknown> | undefined) ??
      (manifest['action'] as Record<string, unknown> | undefined) ??
      {};

    const rawTitle =
      typeof eceDetails?.title === 'string'
        ? eceDetails.title
        : typeof actionManifest['default_title'] === 'string'
          ? (actionManifest['default_title'] as string)
          : ext.name;
    const title = resolveI18nMessage(ext.path, rawTitle) || rawTitle;

    let popupUrl: string | null = null;
    const rawPopup =
      (typeof eceDetails?.popup === 'string' ? eceDetails.popup : null) ??
      (typeof actionManifest['default_popup'] === 'string'
        ? (actionManifest['default_popup'] as string)
        : null);
    if (rawPopup) {
      try {
        popupUrl = new URL(rawPopup).href;
      } catch {
        popupUrl = `chrome-extension://${ext.id}/${rawPopup}`;
      }
    }

    actions.push({
      extensionId: ext.id,
      title,
      iconDataUrl: getIconDataUrl(ext),
      popupUrl,
      badgeText: eceDetails?.badgeText ?? '',
      badgeBackgroundColor: badgeColorToString(eceDetails?.badgeBackgroundColor),
      enabled: eceDetails?.enabled ?? true,
    });
  }

  return actions;
}

// ─── Helper sets para settings ───────────────────────────────────────────────

function getDisabledSet(repos: Pick<ProfileRepositories, 'settings'>): Set<string> {
  try {
    const raw = repos.settings.get('extensions:disabled');
    if (!raw) return new Set<string>();
    return new Set<string>(JSON.parse(raw) as string[]);
  } catch {
    return new Set<string>();
  }
}

function saveDisabledSet(repos: Pick<ProfileRepositories, 'settings'>, disabled: Set<string>): void {
  repos.settings.set('extensions:disabled', JSON.stringify([...disabled]));
}

// Opt-out: almacena IDs despineados. Si no está en el set → está pineado (por defecto).
function getUnpinnedSet(repos: Pick<ProfileRepositories, 'settings'>): Set<string> {
  try {
    const raw = repos.settings.get('extensions:unpinned-ids');
    if (!raw) return new Set<string>();
    return new Set<string>(JSON.parse(raw) as string[]);
  } catch {
    return new Set<string>();
  }
}

function saveUnpinnedSet(repos: Pick<ProfileRepositories, 'settings'>, unpinned: Set<string>): void {
  repos.settings.set('extensions:unpinned-ids', JSON.stringify([...unpinned]));
}

// Almacena IDs de extensiones permitidas en tabs blindadas. Opt-in (por defecto ninguna).
function getSecureAllowedSet(repos: Pick<ProfileRepositories, 'settings'>): Set<string> {
  try {
    const raw = repos.settings.get('extensions:secure-allowed-ids');
    if (!raw) return new Set<string>();
    return new Set<string>(JSON.parse(raw) as string[]);
  } catch {
    return new Set<string>();
  }
}

function saveSecureAllowedSet(repos: Pick<ProfileRepositories, 'settings'>, allowed: Set<string>): void {
  repos.settings.set('extensions:secure-allowed-ids', JSON.stringify([...allowed]));
}

// Almacena nombres de carpeta de bundled extensions eliminadas por el usuario.
function getRemovedBundledNames(repos: Pick<ProfileRepositories, 'settings'>): Set<string> {
  try {
    const raw = repos.settings.get('extensions:removed-bundled-names');
    if (!raw) return new Set<string>();
    return new Set<string>(JSON.parse(raw) as string[]);
  } catch {
    return new Set<string>();
  }
}

function saveRemovedBundledNames(repos: Pick<ProfileRepositories, 'settings'>, names: Set<string>): void {
  repos.settings.set('extensions:removed-bundled-names', JSON.stringify([...names]));
}

// ─── Registro de handlers ────────────────────────────────────────────────────

export function registerExtensionHandlers(ctx: IpcContext): void {

  // ── extensions:get-actions ──────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_GET_ACTIONS,
    async (event): Promise<IpcResponse<ExtensionAction[]>> => {
      try {
        const { profileId, repos } = getFrameContext(event, ctx);
        const session = ctx.profileManager.getSession(profileId);
        const unpinnedIds = getUnpinnedSet(repos);
        return { ok: true, data: buildExtensionActions(session, unpinnedIds) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_GET_ACTIONS);
      }
    },
  );

  // ── extensions:open-popup ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_OPEN_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = openPopupSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { profileId } = getFrameContext(event, ctx);
        const session = ctx.profileManager.getSession(profileId);
        const { extensionId, anchorRect } = parsed.data;

        const ecePrivate = getEcePrivate(session);
        if (!ecePrivate) {
          return { ok: false, error: 'INVARIANT', details: 'ECE no disponible para esta sesión' };
        }

        const browserAction = ecePrivate.api?.browserAction;
        if (!browserAction?.activateClick) {
          return { ok: false, error: 'INVARIANT', details: 'browserAction.activateClick no disponible' };
        }

        const { windowId } = getFrameContext(event, ctx);
        const activeWc = ctx.tabManager.getActiveTabWebContents(windowId);
        if (!activeWc) {
          return { ok: false, error: 'NO_ACTIVE_TAB', details: 'No hay pestaña activa en esta ventana' };
        }

        // Si Chromium había dormido el service worker de la extensión, su
        // popup abriría sin poder hablar con la página (en Bitwarden: "Unable
        // to autofill the selected item on this page").
        await wakeExtensionServiceWorker(session, extensionId);

        browserAction.activateClick({
          extensionId,
          tabId: activeWc.id,
          anchorRect: {
            x: anchorRect.x,
            y: anchorRect.y,
            width: anchorRect.width,
            height: anchorRect.height,
          },
          alignment: 'bottom',
        });

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_OPEN_POPUP);
      }
    },
  );

  // ── extensions:list-installed ───────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_LIST_INSTALLED,
    async (event): Promise<IpcResponse<InstalledExtension[]>> => {
      try {
        const { profileId, repos } = getFrameContext(event, ctx);
        const disabled = getDisabledSet(repos);
        const unpinnedIds = getUnpinnedSet(repos);
        const secureAllowed = getSecureAllowedSet(repos);

        // Extensiones instaladas por el usuario (por perfil)
        const userInstalled = await ctx.extensionManager.getInstalledExtensions(profileId);
        const userInstalledIds = new Set(userInstalled.map((e) => e.id));

        const result: InstalledExtension[] = userInstalled.map((ext) => {
          const manifest = readFullManifest(ext.path);
          return {
            ...buildInstalledExtension(ext.path, ext.id, ext.name, ext.version, manifest, !disabled.has(ext.id)),
            pinnedToBar: !unpinnedIds.has(ext.id),
            allowedInSecureTabs: secureAllowed.has(ext.id),
          };
        });

        // Extensiones bundled: cargadas en sesión pero con path dentro de EXTENSIONS_DIR.
        // Usamos path.normalize + path.relative para comparar rutas de forma segura
        // en Windows (Electron puede devolver ext.path con forward-slashes).
        const session = ctx.profileManager.getSession(profileId);
        const normalizedBundleDir = path.normalize(EXTENSIONS_DIR);
        for (const ext of session.extensions.getAllExtensions()) {
          if (userInstalledIds.has(ext.id)) continue;
          const rel = path.relative(normalizedBundleDir, path.normalize(ext.path));
          if (rel.startsWith('..') || path.isAbsolute(rel) || rel === '') continue;
          const manifest = readFullManifest(ext.path);
          result.push({
            ...buildInstalledExtension(ext.path, ext.id, ext.name, ext.version, manifest, !disabled.has(ext.id)),
            bundled: true,
            pinnedToBar: !unpinnedIds.has(ext.id),
            allowedInSecureTabs: secureAllowed.has(ext.id),
          });
        }

        return { ok: true, data: result };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_LIST_INSTALLED);
      }
    },
  );

  // ── extensions:enable ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_ENABLE,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = extensionIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { profileId, repos } = getFrameContext(event, ctx);
        const { extensionId } = parsed.data;
        const session = ctx.profileManager.getSession(profileId);

        const disabled = getDisabledSet(repos);
        disabled.delete(extensionId);
        saveDisabledSet(repos, disabled);

        const installed = await ctx.extensionManager.getInstalledExtensions(profileId);
        const ext = installed.find((e) => e.id === extensionId);
        if (ext) {
          await session.extensions.loadExtension(ext.path, { allowFileAccess: true });
        }

        ctx.events.emit(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_ENABLE);
      }
    },
  );

  // ── extensions:disable ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_DISABLE,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = extensionIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { profileId, repos } = getFrameContext(event, ctx);
        const { extensionId } = parsed.data;
        const session = ctx.profileManager.getSession(profileId);

        try {
          session.extensions.removeExtension(extensionId);
        } catch {
          // puede que no estuviera cargada
        }

        const disabled = getDisabledSet(repos);
        disabled.add(extensionId);
        saveDisabledSet(repos, disabled);

        ctx.events.emit(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_DISABLE);
      }
    },
  );

  // ── extensions:uninstall ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_UNINSTALL,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = extensionIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { profileId, repos } = getFrameContext(event, ctx);
        const { extensionId } = parsed.data;
        const session = ctx.profileManager.getSession(profileId);

        // Detectar si es bundled para tratarla distinto
        const normalizedBundleDir = path.normalize(EXTENSIONS_DIR);
        const bundledExt = session.extensions.getAllExtensions().find((e) => {
          if (e.id !== extensionId) return false;
          const rel = path.relative(normalizedBundleDir, path.normalize(e.path));
          return !rel.startsWith('..') && !path.isAbsolute(rel) && rel !== '';
        });

        if (bundledExt) {
          // Extensión bundled: eliminar de la sesión y persistir nombre de carpeta
          const folderName = path.relative(normalizedBundleDir, path.normalize(bundledExt.path));
          try { session.extensions.removeExtension(extensionId); } catch { /* ignorar */ }
          const removed = getRemovedBundledNames(repos);
          removed.add(folderName);
          saveRemovedBundledNames(repos, removed);
        } else {
          // Extensión de usuario: desinstalar del filesystem
          await ctx.extensionManager.uninstall(profileId, extensionId);
        }

        // Limpiar de disabled/unpinned/secure-allowed si estaba ahí
        const disabled = getDisabledSet(repos);
        if (disabled.has(extensionId)) { disabled.delete(extensionId); saveDisabledSet(repos, disabled); }
        const unpinned = getUnpinnedSet(repos);
        if (unpinned.has(extensionId)) { unpinned.delete(extensionId); saveUnpinnedSet(repos, unpinned); }
        const secureAllowed = getSecureAllowedSet(repos);
        if (secureAllowed.has(extensionId)) { secureAllowed.delete(extensionId); saveSecureAllowedSet(repos, secureAllowed); }

        ctx.events.emit(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_UNINSTALL);
      }
    },
  );

  // ── extensions:set-pinned ──────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_SET_PINNED,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = z.object({ extensionId: z.string().min(1), pinned: z.boolean() }).safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { repos } = getFrameContext(event, ctx);
        const { extensionId, pinned } = parsed.data;
        const unpinned = getUnpinnedSet(repos);
        if (pinned) unpinned.delete(extensionId);
        else unpinned.add(extensionId);
        saveUnpinnedSet(repos, unpinned);
        ctx.events.emit(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_SET_PINNED);
      }
    },
  );

  // ── extensions:set-secure-allowed ─────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_SET_SECURE_ALLOWED,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = z.object({ extensionId: z.string().min(1), allowed: z.boolean() }).safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { repos } = getFrameContext(event, ctx);
        const { extensionId, allowed } = parsed.data;
        const secureAllowed = getSecureAllowedSet(repos);
        if (allowed) secureAllowed.add(extensionId);
        else secureAllowed.delete(extensionId);
        saveSecureAllowedSet(repos, secureAllowed);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_SET_SECURE_ALLOWED);
      }
    },
  );

  // ── extensions:install-from-crx ────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_INSTALL_FROM_CRX,
    async (event): Promise<IpcResponse<InstalledExtension>> => {
      try {
        const { profileId, windowId } = getFrameContext(event, ctx);
        const win = BrowserWindow.fromId(windowId);

        const dialogOpts = {
          filters: [{ name: 'Chrome Extension', extensions: ['crx'] }],
          properties: ['openFile' as const],
        };
        const result = win
          ? await dialog.showOpenDialog(win, dialogOpts)
          : await dialog.showOpenDialog(dialogOpts);

        if (result.canceled || result.filePaths.length === 0) {
          return { ok: false, error: 'CANCELLED', details: 'El usuario canceló la selección' };
        }

        const crxPath = result.filePaths[0]!;
        const installed = await ctx.extensionManager.installFromCrx(profileId, crxPath);

        const manifest = readFullManifest(installed.path);
        const richExt = buildInstalledExtension(
          installed.path,
          installed.id,
          installed.name,
          installed.version,
          manifest,
          true,
        );

        ctx.events.emit(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED);
        return { ok: true, data: richExt };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_INSTALL_FROM_CRX);
      }
    },
  );

  // ── extensions:install-from-path ──────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_INSTALL_FROM_PATH,
    async (event, rawArgs): Promise<IpcResponse<InstalledExtension>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);

        const parsed = z.object({ filePath: z.string().min(1) }).safeParse(rawArgs);
        if (!parsed.success) {
          return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        }

        const { filePath } = parsed.data;
        if (!filePath.toLowerCase().endsWith('.crx')) {
          return { ok: false, error: 'INVALID_FORMAT', details: 'Solo se admiten archivos .crx' };
        }
        if (!fs.existsSync(filePath)) {
          return { ok: false, error: 'NOT_FOUND', details: 'El archivo no existe' };
        }

        const installed = await ctx.extensionManager.installFromCrx(profileId, filePath);

        const manifest = readFullManifest(installed.path);
        const richExt = buildInstalledExtension(
          installed.path,
          installed.id,
          installed.name,
          installed.version,
          manifest,
          true,
        );

        ctx.events.emit(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED);
        return { ok: true, data: richExt };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_INSTALL_FROM_PATH);
      }
    },
  );

  // ── extensions:open-options-page ──────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.EXTENSIONS_OPEN_OPTIONS_PAGE,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = extensionIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { profileId, windowId, repos } = getFrameContext(event, ctx);
        const { extensionId } = parsed.data;

        const installed = await ctx.extensionManager.getInstalledExtensions(profileId);
        const ext = installed.find((e) => e.id === extensionId);
        if (!ext) {
          return { ok: false, error: 'NOT_FOUND', details: `Extensión ${extensionId} no encontrada` };
        }

        const manifest = readFullManifest(ext.path);
        const optionsUrl = getOptionsUrl(extensionId, manifest);
        if (!optionsUrl) {
          return { ok: false, error: 'NO_OPTIONS_PAGE', details: 'La extensión no tiene página de opciones' };
        }
        const activeWsRaw = repos.metadata.get('active-workspace');
        const workspaceId = activeWsRaw ?? repos.workspaces.list()[0]?.id ?? null;
        if (!workspaceId) {
          return { ok: false, error: 'NO_WORKSPACE', details: 'No hay workspace activo' };
        }

        await ctx.tabManager.createTab(windowId, {
          workspaceId,
          parentId: null,
          url: optionsUrl,
          activate: true,
        });

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.EXTENSIONS_OPEN_OPTIONS_PAGE);
      }
    },
  );

  // Emitir EXTENSION_ACTIONS_CHANGED en cada navegación de pestaña para
  // que los renderers refresquen los badges (uBlock, etc.).
  ctx.events.on(IPC_EVENTS.TAB_NAVIGATED, () => {
    ctx.events.emit(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED);
  });
}
