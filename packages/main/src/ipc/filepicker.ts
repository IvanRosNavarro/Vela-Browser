import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, screen } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { resolveWindowId } from './helpers';
import { guardTrustedFrame } from './validate';

const PICKER_WIDTH  = 400;
const PICKER_HEIGHT = 480;

const INTERNAL_PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');

// Map parentWindowId → picker BrowserWindow
const activePickerWindows = new Map<number, BrowserWindow>();

// ─── Accept filter helpers ───────────────────────────────────────────────────

function acceptToElectronFilters(accept: string): Electron.FileFilter[] {
  if (!accept) return [];
  const exts: string[] = [];
  accept.split(',').forEach((token) => {
    const t = token.trim();
    if (!t) return;
    if (t.startsWith('.')) {
      exts.push(t.slice(1).toLowerCase());
    }
    // MIME types can't be directly converted to extensions; skip
  });
  if (exts.length === 0) return [];
  return [{ name: 'Archivos seleccionados', extensions: exts }];
}

// ─── MIME detection from file extension ─────────────────────────────────────

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
  pdf: 'application/pdf',
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
  json: 'application/json', xml: 'application/xml',
  txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'text/javascript',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

// ─── File injection helper ────────────────────────────────────────────────────

async function injectFilesIntoInput(
  wc: Electron.WebContents,
  pickerIds: string[],
  filesData: Array<{ name: string; type: string; data: number[] }>,
): Promise<void> {
  const pickerIdSelector = pickerIds.map((id) => `[data-vela-picker="${id}"]`).join(',');
  const script = `
(async () => {
  const files = ${JSON.stringify(filesData)}.map(
    ({ name, type, data }) =>
      new File([new Uint8Array(data)], name, { type })
  );
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  const sel = ${JSON.stringify(pickerIdSelector)};
  const input = sel ? document.querySelector(sel) : window.__velaFileTarget;
  if (!input) return;
  Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
})();
`;
  await wc.executeJavaScript(script).catch(() => {});
}

async function persistRecentFiles(
  ctx: IpcContext,
  profileId: string,
  filePaths: string[],
): Promise<void> {
  try {
    const repos = ctx.profileManager.getRepositories(profileId);
    for (const filePath of filePaths) {
      try {
        const stat = await fs.promises.stat(filePath);
        repos.recentFiles.upsert(profileId, {
          path: filePath,
          name: path.basename(filePath),
          mimeType: mimeFromPath(filePath),
          sizeBytes: stat.size,
        });
      } catch { /* archivo ya borrado, etc. */ }
    }
  } catch { /* perfil no abierto */ }
}

// ─── Clipboard image to PNG buffer ───────────────────────────────────────────

function clipboardImageToDataUrl(): string | null {
  try {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    const buf = img.toPNG();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function clipboardImageToBuffer(): Promise<{ name: string; type: string; data: number[] } | null> {
  try {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    const buf = img.toPNG();
    return { name: 'portapapeles.png', type: 'image/png', data: [...buf] };
  } catch {
    return null;
  }
}

// ─── Position picker window below the file input ────────────────────────────

function calcPickerPosition(
  parentWin: BrowserWindow,
  inputRect: { x: number; y: number; width: number; height: number },
  ctx: IpcContext,
): { x: number; y: number } {
  const pos = parentWin.getPosition();
  const winX = pos[0] ?? 0;
  const winY = pos[1] ?? 0;
  const layout = ctx.tabManager.getWindowLayout(parentWin.id);
  const sidebarW = layout?.sidebarWidth ?? 0;
  const barH = layout?.addressBarHeight ?? 0;

  const inputScreenX = winX + sidebarW + inputRect.x;
  const inputScreenY = winY + barH + inputRect.y;

  let x = Math.round(inputScreenX);
  let y = Math.round(inputScreenY + inputRect.height + 4);

  // Keep within display bounds
  const display = screen.getDisplayNearestPoint({ x, y });
  const { bounds } = display;
  x = Math.max(bounds.x + 4, Math.min(x, bounds.x + bounds.width  - PICKER_WIDTH  - 4));
  y = Math.max(bounds.y + 4, Math.min(y, bounds.y + bounds.height - PICKER_HEIGHT - 4));

  return { x, y };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const showSchema = z.object({
  accept:    z.string(),
  multiple:  z.boolean(),
  inputRect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  pickerId:  z.string(),
});

const selectSchema = z.object({
  windowId:  z.number().int(),
  profileId: z.string().min(1),
  paths:     z.array(z.string()),
  pickerId:  z.string(),
});

const nativeSchema = z.object({
  windowId:  z.number().int(),
  profileId: z.string().min(1),
  accept:    z.string(),
  multiple:  z.boolean(),
  pickerId:  z.string(),
});

const listRecentSchema = z.object({
  profileId: z.string().min(1),
  limit:     z.number().int().min(1).max(50).default(10),
  accept:    z.string().default(''),
});

const listDownloadsSchema = z.object({
  limit:  z.number().int().min(1).max(50).default(10),
  accept: z.string().default(''),
});

const cancelSchema = z.object({
  windowId: z.number().int(),
});

const clearRecentSchema = z.object({
  profileId: z.string().min(1),
});

// ─── Registration ────────────────────────────────────────────────────────────

export function registerFilePickerHandlers(ctx: IpcContext): void {

  // ── filepicker:show ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILEPICKER_SHOW,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = showSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) return { ok: true, data: undefined };

        const parentWin = BrowserWindow.fromId(windowId);
        if (!parentWin) return { ok: true, data: undefined };

        const profileId = ctx.profileWindowManager.getProfileForWindow(windowId) ?? '';

        let enabled = true;
        try {
          const repos = ctx.profileManager.getRepositories(profileId);
          const raw = repos.settings.get('filepicker:enabled');
          // null = not set (default: enabled). JSON-serialized booleans.
          enabled = raw === null || raw === 'true';
        } catch { /* perfil no abierto — usar nativo */ }

        if (!enabled) {
          const filters = acceptToElectronFilters(parsed.data.accept);
          const nativeProps: Electron.OpenDialogOptions['properties'] = ['openFile'];
          if (parsed.data.multiple) nativeProps.push('multiSelections');
          const { filePaths } = await dialog.showOpenDialog(parentWin, {
            properties: nativeProps,
            filters: filters.length ? filters : undefined,
          });
          if (filePaths.length > 0) {
            const wc = ctx.tabManager.getActiveTabWebContents(windowId);
            if (wc && !wc.isDestroyed()) {
              const filesData = await Promise.all(
                filePaths.map(async (fp) => {
                  const buf = await fs.promises.readFile(fp);
                  return { name: path.basename(fp), type: mimeFromPath(fp), data: [...buf] };
                }),
              );
              await injectFilesIntoInput(wc, [parsed.data.pickerId], filesData);
              await persistRecentFiles(ctx, profileId, filePaths);
            }
          }
          return { ok: true, data: undefined };
        }

        const existing = activePickerWindows.get(windowId);
        if (existing && !existing.isDestroyed()) existing.close();

        const { x, y } = calcPickerPosition(parentWin, parsed.data.inputRect, ctx);

        const preloadPath = fs.existsSync(INTERNAL_PRELOAD_PATH) ? INTERNAL_PRELOAD_PATH : undefined;

        const pickerWin = new BrowserWindow({
          width: PICKER_WIDTH,
          height: PICKER_HEIGHT,
          x,
          y,
          frame: false,
          transparent: false,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          show: false,
          backgroundColor: '#141519',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            ...(preloadPath ? { preload: preloadPath } : {}),
          },
        });

        activePickerWindows.set(windowId, pickerWin);

        const url = new URL('vela://filepicker');
        url.searchParams.set('accept', parsed.data.accept);
        url.searchParams.set('multiple', String(parsed.data.multiple));
        url.searchParams.set('profileId', profileId);
        url.searchParams.set('windowId', String(windowId));
        url.searchParams.set('pickerId', parsed.data.pickerId);

        await pickerWin.loadURL(url.toString());

        pickerWin.show();

        pickerWin.on('blur', () => {
          if (!pickerWin.isDestroyed()) pickerWin.close();
        });

        pickerWin.on('closed', () => {
          if (activePickerWindows.get(windowId) === pickerWin) {
            activePickerWindows.delete(windowId);
          }
        });

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FILEPICKER_SHOW);
      }
    },
  );

  // ── filepicker:select ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILEPICKER_SELECT,
    async (event, payload): Promise<IpcResponse<void>> => {
      // Solo la ventana del picker (vela://filepicker) puede inyectar ficheros;
      // nunca una pestaña web. Evita lectura/exfiltración de ficheros locales.
      guardTrustedFrame(event, IPC_CHANNELS.FILEPICKER_SELECT);
      const parsed = selectSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { windowId, profileId, paths, pickerId } = parsed.data;

        const pickerWin = activePickerWindows.get(windowId);
        if (pickerWin && !pickerWin.isDestroyed()) pickerWin.close();

        const wc = ctx.tabManager.getActiveTabWebContents(windowId);
        if (!wc || wc.isDestroyed()) return { ok: true, data: undefined };

        const clipboardPaths = paths.filter((p) => p.startsWith('__clipboard__:'));
        const filePaths      = paths.filter((p) => !p.startsWith('__clipboard__:'));

        const filesData: Array<{ name: string; type: string; data: number[] }> = [];

        for (const fp of filePaths) {
          try {
            const buf = await fs.promises.readFile(fp);
            filesData.push({ name: path.basename(fp), type: mimeFromPath(fp), data: [...buf] });
          } catch { /* skip unreadable */ }
        }

        for (const cp of clipboardPaths) {
          const clipData = await clipboardImageToBuffer();
          if (clipData) filesData.push(clipData);
        }

        if (filesData.length > 0) {
          await injectFilesIntoInput(wc, [pickerId], filesData);
          await persistRecentFiles(ctx, profileId, filePaths);
        }

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FILEPICKER_SELECT);
      }
    },
  );

  // ── filepicker:open-native ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILEPICKER_OPEN_NATIVE,
    async (event, payload): Promise<IpcResponse<{ paths: string[] }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.FILEPICKER_OPEN_NATIVE);
      const parsed = nativeSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { windowId, profileId, accept, multiple, pickerId } = parsed.data;

        const pickerWin = activePickerWindows.get(windowId);
        if (pickerWin && !pickerWin.isDestroyed()) pickerWin.close();

        const parentWin = BrowserWindow.fromId(windowId);
        const filters = acceptToElectronFilters(accept);
        const properties: Electron.OpenDialogOptions['properties'] = ['openFile'];
        if (multiple) properties.push('multiSelections');

        const { filePaths, canceled } = await dialog.showOpenDialog(
          parentWin ?? undefined!,
          { properties, filters: filters.length ? filters : undefined },
        );

        if (!canceled && filePaths.length > 0) {
          const wc = ctx.tabManager.getActiveTabWebContents(windowId);
          if (wc && !wc.isDestroyed()) {
            const filesData = await Promise.all(
              filePaths.map(async (fp) => {
                const buf = await fs.promises.readFile(fp);
                return { name: path.basename(fp), type: mimeFromPath(fp), data: [...buf] };
              }),
            );
            await injectFilesIntoInput(wc, [pickerId], filesData);
            await persistRecentFiles(ctx, profileId, filePaths);
          }
        }

        return { ok: true, data: { paths: canceled ? [] : filePaths } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FILEPICKER_OPEN_NATIVE);
      }
    },
  );

  // ── filepicker:list-recent ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILEPICKER_LIST_RECENT,
    (event, payload): IpcResponse<unknown[]> => {
      guardTrustedFrame(event, IPC_CHANNELS.FILEPICKER_LIST_RECENT);
      const parsed = listRecentSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { profileId, limit } = parsed.data;
        const repos = ctx.profileManager.getRepositories(profileId);
        const files = repos.recentFiles.list(profileId, limit);
        return { ok: true, data: files };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FILEPICKER_LIST_RECENT);
      }
    },
  );

  // ── filepicker:list-downloads ──────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILEPICKER_LIST_DOWNLOADS,
    async (event, payload): Promise<IpcResponse<unknown[]>> => {
      guardTrustedFrame(event, IPC_CHANNELS.FILEPICKER_LIST_DOWNLOADS);
      const parsed = listDownloadsSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { limit } = parsed.data;
        const downloadsDir = app.getPath('downloads');
        const entries = await fs.promises.readdir(downloadsDir, { withFileTypes: true }).catch(() => []);
        const files = await Promise.all(
          entries
            .filter((e) => e.isFile() && !e.name.startsWith('.'))
            .map(async (e) => {
              const fp = path.join(downloadsDir, e.name);
              try {
                const stat = await fs.promises.stat(fp);
                return {
                  name: e.name,
                  path: fp,
                  mimeType: mimeFromPath(fp),
                  sizeBytes: stat.size,
                  modifiedAt: stat.mtimeMs,
                };
              } catch {
                return null;
              }
            }),
        );
        const sorted = files
          .filter((f) => f !== null)
          .sort((a, b) => (b!.modifiedAt - a!.modifiedAt))
          .slice(0, limit);
        return { ok: true, data: sorted };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FILEPICKER_LIST_DOWNLOADS);
      }
    },
  );

  // ── filepicker:clipboard-image ─────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILEPICKER_CLIPBOARD_IMAGE,
    (event): IpcResponse<{ dataUrl: string | null }> => {
      guardTrustedFrame(event, IPC_CHANNELS.FILEPICKER_CLIPBOARD_IMAGE);
      try {
        const dataUrl = clipboardImageToDataUrl();
        return { ok: true, data: { dataUrl } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FILEPICKER_CLIPBOARD_IMAGE);
      }
    },
  );

  // ── filepicker:cancel ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILEPICKER_CANCEL,
    (_event, payload): IpcResponse<void> => {
      const parsed = cancelSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const pickerWin = activePickerWindows.get(parsed.data.windowId);
        if (pickerWin && !pickerWin.isDestroyed()) pickerWin.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FILEPICKER_CANCEL);
      }
    },
  );

  // ── filepicker:clear-recent ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FILEPICKER_CLEAR_RECENT,
    (event, payload): IpcResponse<void> => {
      guardTrustedFrame(event, IPC_CHANNELS.FILEPICKER_CLEAR_RECENT);
      const parsed = clearRecentSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const repos = ctx.profileManager.getRepositories(parsed.data.profileId);
        repos.recentFiles.clearAll(parsed.data.profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FILEPICKER_CLEAR_RECENT);
      }
    },
  );
}
