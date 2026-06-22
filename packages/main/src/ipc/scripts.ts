import { ipcMain, net } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  z,
  type IpcResponse,
  type UserScript,
  type UserScriptMeta,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getFrameContext } from './helpers';
import { guardTrustedFrame } from './validate';
import { isPublicHttpUrl } from '../lib/urlSafety';

const addSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(1024).default(''),
  type: z.enum(['js', 'css']),
  code: z.string(),
  matchPatterns: z.array(z.string()).min(1),
  enabled: z.boolean().default(true),
  runAt: z.enum(['document-start', 'document-end', 'document-idle']).default('document-idle'),
});

const updateSchema = z.object({
  id: z.string().min(1),
  data: z.object({
    name: z.string().min(1).max(256).optional(),
    description: z.string().max(1024).optional(),
    type: z.enum(['js', 'css']).optional(),
    code: z.string().optional(),
    matchPatterns: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
    runAt: z.enum(['document-start', 'document-end', 'document-idle']).optional(),
  }),
});

const deleteSchema = z.object({ id: z.string().min(1) });

const toggleSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

const testSchema = z.object({
  code: z.string(),
  type: z.enum(['js', 'css']),
  tabId: z.string().optional(),
});

const importUrlSchema = z.object({ url: z.string().url() });

function parseGreasemonkeyMeta(code: string): Partial<UserScriptMeta> {
  const meta: Partial<UserScriptMeta> = {};
  const nameMatch = /\/\/\s*@name\s+(.+)/.exec(code);
  if (nameMatch) meta.name = nameMatch[1]?.trim() ?? '';
  const descMatch = /\/\/\s*@description\s+(.+)/.exec(code);
  if (descMatch) meta.description = descMatch[1]?.trim() ?? '';
  const runAtMatch = /\/\/\s*@run-at\s+(\S+)/.exec(code);
  if (runAtMatch) {
    const raw = runAtMatch[1]?.trim();
    if (raw === 'document-start' || raw === 'document-end' || raw === 'document-idle') {
      meta.runAt = raw;
    }
  }
  const matchPatterns: string[] = [];
  const matchRe = /\/\/\s*@match\s+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = matchRe.exec(code)) !== null) {
    if (m[1]) matchPatterns.push(m[1]);
  }
  const includeRe = /\/\/\s*@include\s+(\S+)/g;
  while ((m = includeRe.exec(code)) !== null) {
    if (m[1]) matchPatterns.push(m[1]);
  }
  if (matchPatterns.length > 0) meta.matchPatterns = matchPatterns;
  return meta;
}

export function registerScriptsHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SCRIPTS_LIST,
    async (event): Promise<IpcResponse<UserScript[]>> => {
      try {
        const { repos } = getFrameContext(event, ctx);
        return { ok: true, data: repos.userScripts.list() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCRIPTS_LIST);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCRIPTS_ADD,
    async (event, payload): Promise<IpcResponse<UserScript>> => {
      try {
        const data = addSchema.parse(payload);
        const { repos } = getFrameContext(event, ctx);
        const script = repos.userScripts.add(data);
        return { ok: true, data: script };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCRIPTS_ADD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCRIPTS_UPDATE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id, data } = updateSchema.parse(payload);
        const { repos } = getFrameContext(event, ctx);
        repos.userScripts.update(id, data);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCRIPTS_UPDATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCRIPTS_DELETE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id } = deleteSchema.parse(payload);
        const { repos } = getFrameContext(event, ctx);
        repos.userScripts.delete(id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCRIPTS_DELETE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCRIPTS_TOGGLE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id, enabled } = toggleSchema.parse(payload);
        const { repos } = getFrameContext(event, ctx);
        repos.userScripts.toggle(id, enabled);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCRIPTS_TOGGLE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCRIPTS_TEST,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { code, type, tabId } = testSchema.parse(payload);
        const { windowId } = getFrameContext(event, ctx);
        const resolvedTabId = tabId ?? ctx.tabManager.getActiveTabId(windowId);
        if (!resolvedTabId) return { ok: false, error: 'NOT_FOUND', details: 'No hay tab activa' };
        const wc = ctx.tabManager.getWcvForTab(resolvedTabId)?.webContents;
        if (!wc) return { ok: false, error: 'NOT_FOUND', details: 'Tab no encontrada' };
        if (type === 'css') {
          await wc.insertCSS(code);
        } else {
          await wc.executeJavaScript(code, false);
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCRIPTS_TEST);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCRIPTS_IMPORT_URL,
    async (event, payload): Promise<IpcResponse<UserScriptMeta>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SCRIPTS_IMPORT_URL);
      try {
        const { url } = importUrlSchema.parse(payload);
        // Anti-SSRF: solo http(s) público.
        if (!isPublicHttpUrl(url)) {
          return { ok: false, error: 'INVALID_INPUT', details: 'URL no permitida' };
        }
        const response = await net.fetch(url, { redirect: 'error' });
        if (!response.ok) {
          return { ok: false, error: 'INTERNAL', details: `HTTP ${response.status}` };
        }
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.byteLength > 2 * 1024 * 1024) {
          return { ok: false, error: 'INVALID_INPUT', details: 'Script demasiado grande' };
        }
        const code = buf.toString('utf-8');
        const meta = parseGreasemonkeyMeta(code);
        return {
          ok: true,
          data: {
            name: meta.name ?? 'Script importado',
            description: meta.description ?? '',
            code,
            matchPatterns: meta.matchPatterns ?? ['<all_urls>'],
            runAt: meta.runAt ?? 'document-idle',
          },
        };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCRIPTS_IMPORT_URL);
      }
    },
  );
}
