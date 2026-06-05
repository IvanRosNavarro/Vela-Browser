import { app, BrowserWindow, shell } from 'electron';
import {
  IPC_EVENTS,
  MRU_SCOPE_DEFAULT,
  z,
  type CommandContext,
  type MruScope,
  type RendererCommandAction,
  type Workspace,
} from '@vela/shared';
import type { IpcContext } from '../ipc';
import { CommandRegistry, defineCommand } from './registry';
import { reposForCommand } from './context';
import { BugSnapshotService, initConsoleBuffers } from '../devtools/BugSnapshotService';
import { translateAndShow } from '../ipc/translation';

const ACTIVE_WORKSPACE_KEY = 'active-workspace';
const MRU_SCOPE_KEY = 'mru:scope';
const MRU_BEHAVIOR_KEY = 'mru:behavior';
const PREVIEWS_ENABLED_KEY = 'previews:enabled';

function readMruScope(ipc: IpcContext, ctx: CommandContext): MruScope {
  const repos = reposForCommand(ipc, ctx);
  if (!repos) return MRU_SCOPE_DEFAULT;
  let raw: string | null;
  try {
    raw = repos.settings.get(MRU_SCOPE_KEY);
  } catch {
    return MRU_SCOPE_DEFAULT;
  }
  if (raw === null) return MRU_SCOPE_DEFAULT;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed === 'global' ? 'global' : 'workspace';
  } catch {
    return MRU_SCOPE_DEFAULT;
  }
}

function readMruBehavior(ipc: IpcContext, ctx: CommandContext): 'modal' | 'direct' {
  const repos = reposForCommand(ipc, ctx);
  if (!repos) return 'modal';
  let raw: string | null;
  try {
    raw = repos.settings.get(MRU_BEHAVIOR_KEY);
  } catch {
    return 'modal';
  }
  if (raw === null) return 'modal';
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed === 'direct' ? 'direct' : 'modal';
  } catch {
    return 'modal';
  }
}

function readPreviewsEnabled(ipc: IpcContext, ctx: CommandContext): boolean {
  const repos = reposForCommand(ipc, ctx);
  if (!repos) return true;
  let raw: string | null;
  try {
    raw = repos.settings.get(PREVIEWS_ENABLED_KEY);
  } catch {
    return true;
  }
  if (raw === null) return true;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== false;
  } catch {
    return true;
  }
}

export interface CommandDeps {
  ipc: IpcContext;
}

function emitRendererAction(
  ipc: IpcContext,
  ctx: CommandContext,
  action: RendererCommandAction,
  payload?: unknown,
): void {
  if (ctx.windowId === null) return;
  ipc.events.emit(IPC_EVENTS.COMMAND_RENDERER_ACTION, {
    windowId: ctx.windowId,
    action,
    ...(payload !== undefined ? { payload } : {}),
  });
}

function activateWorkspace(
  ipc: IpcContext,
  ctx: CommandContext,
  workspace: Workspace,
): void {
  if (ctx.windowId === null) return;
  const repos = reposForCommand(ipc, ctx);
  if (repos) {
    repos.metadata.set(ACTIVE_WORKSPACE_KEY, workspace.id);
  }
  ipc.tabManager.setWorkspaceForWindow(ctx.windowId, workspace.id);
  ipc.events.emit(IPC_EVENTS.ACTIVE_WORKSPACE_CHANGED, {
    windowId: ctx.windowId,
    workspaceId: workspace.id,
  });
}

function pickRelative(
  list: Workspace[],
  currentId: string | null,
  delta: 1 | -1,
): Workspace | null {
  if (list.length === 0) return null;
  const currentIdx = currentId ? list.findIndex((w) => w.id === currentId) : -1;
  const baseIdx = currentIdx === -1 ? 0 : currentIdx;
  const newIdx = (baseIdx + delta + list.length) % list.length;
  return list[newIdx] ?? null;
}

export function registerCoreCommands(
  registry: CommandRegistry,
  deps: CommandDeps,
): void {
  const { ipc } = deps;

  // ---------- workspace ----------

  registry.register(
    defineCommand({
      id: 'workspace.switchToIndex',
      title: 'Cambiar al workspace por índice',
      category: 'workspace',
      argsSchema: z.object({
        index: z.number().int().min(1).max(9),
      }),
      run: (ctx, args) => {
        if (ctx.windowId === null) return;
        const repos = reposForCommand(ipc, ctx);
        if (!repos) return;
        const list = repos.workspaces.list();
        const target = list[args.index - 1];
        if (!target) return;
        if (target.id === ctx.activeWorkspaceId) return;
        activateWorkspace(ipc, ctx, target);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'workspace.next',
      title: 'Siguiente workspace',
      category: 'workspace',
      defaultShortcut: 'Ctrl+Shift+]',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        const repos = reposForCommand(ipc, ctx);
        if (!repos) return;
        const list = repos.workspaces.list();
        const target = pickRelative(list, ctx.activeWorkspaceId, 1);
        if (!target || target.id === ctx.activeWorkspaceId) return;
        activateWorkspace(ipc, ctx, target);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'workspace.previous',
      title: 'Workspace anterior',
      category: 'workspace',
      defaultShortcut: 'Ctrl+Shift+[',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        const repos = reposForCommand(ipc, ctx);
        if (!repos) return;
        const list = repos.workspaces.list();
        const target = pickRelative(list, ctx.activeWorkspaceId, -1);
        if (!target || target.id === ctx.activeWorkspaceId) return;
        activateWorkspace(ipc, ctx, target);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'workspace.create',
      title: 'Crear workspace…',
      category: 'workspace',
      defaultShortcut: 'Ctrl+Shift+N',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-create-workspace-modal');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'workspace.switchTo',
      title: 'Cambiar a workspace',
      category: 'workspace',
      argsSchema: z.object({ workspaceId: z.string() }),
      run: (ctx, args) => {
        if (ctx.windowId === null) return;
        if (args.workspaceId === ctx.activeWorkspaceId) return;
        const repos = reposForCommand(ipc, ctx);
        if (!repos) return;
        const target = repos.workspaces.getById(args.workspaceId);
        if (!target) return;
        activateWorkspace(ipc, ctx, target);
      },
    }),
  );

  // ---------- tabs ----------

  registry.register(
    defineCommand({
      id: 'tab.activate',
      title: 'Activar pestaña',
      category: 'tab',
      argsSchema: z.object({ tabId: z.string() }),
      run: async (ctx, args) => {
        if (ctx.windowId === null) return;
        await ipc.tabManager.activateTab(ctx.windowId, args.tabId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.close',
      title: 'Cerrar pestaña',
      category: 'tab',
      argsSchema: z.object({ tabId: z.string() }),
      run: async (ctx, args) => {
        const windowId =
          ipc.tabManager.getWindowIdForTab(args.tabId) ?? ctx.windowId;
        if (windowId === null) return;
        await ipc.tabManager.closeTab(windowId, args.tabId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.closeActive',
      title: 'Cerrar pestaña activa',
      category: 'tab',
      defaultShortcut: 'Ctrl+W',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeTabId === null) return;
        await ipc.tabManager.closeTab(ctx.windowId, ctx.activeTabId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.pin',
      title: 'Anclar pestaña',
      category: 'tab',
      argsSchema: z.object({ tabId: z.string().optional() }),
      run: (ctx, args) => {
        if (ctx.windowId === null) return;
        const tabId = args.tabId ?? ctx.activeTabId;
        if (!tabId) return;
        ipc.tabManager.pinTab(ctx.windowId, tabId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.unpin',
      title: 'Desanclar pestaña',
      category: 'tab',
      argsSchema: z.object({ tabId: z.string().optional() }),
      run: (ctx, args) => {
        if (ctx.windowId === null) return;
        const tabId = args.tabId ?? ctx.activeTabId;
        if (!tabId) return;
        ipc.tabManager.unpinTab(ctx.windowId, tabId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.duplicate',
      title: 'Duplicar pestaña',
      category: 'tab',
      defaultShortcut: 'Ctrl+Shift+D',
      argsSchema: z.object({ tabId: z.string().optional() }),
      run: async (ctx, args) => {
        if (ctx.windowId === null) return;
        const repos = reposForCommand(ipc, ctx);
        if (!repos) return;
        const sourceId = args.tabId ?? ctx.activeTabId;
        if (!sourceId) return;
        const source = repos.treeNodes.getById(sourceId);
        if (!source || source.kind !== 'tab') return;
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: source.workspaceId,
          parentId: source.parentId,
          url: source.url,
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.rename',
      title: 'Renombrar pestaña',
      category: 'tab',
      argsSchema: z.object({ tabId: z.string().optional() }),
      run: (ctx, args) => {
        const tabId = args.tabId ?? ctx.activeTabId;
        if (!tabId) return;
        emitRendererAction(ipc, ctx, 'rename-tab', { tabId });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.cycleMru',
      title: 'Alternar pestaña reciente',
      category: 'tab',
      argsSchema: z.object({
        direction: z.enum(['forward', 'backward']),
      }),
      run: async (ctx, args) => {
        if (ctx.windowId === null) return;
        const repos = reposForCommand(ipc, ctx);
        if (!repos) return;
        const scope = readMruScope(ipc, ctx);
        const behavior = readMruBehavior(ipc, ctx);

        const all = ctx.activeProfileId
          ? ipc.tabManager.getGlobalMru(ctx.activeProfileId)
          : [];
        const candidates =
          scope === 'workspace'
            ? all.filter((tabId) => {
                const node = repos.treeNodes.getById(tabId);
                return (
                  node?.kind === 'tab' &&
                  node.workspaceId === ctx.activeWorkspaceId
                );
              })
            : [...all];

        if (candidates.length < 2) return;

        if (behavior === 'modal') {
          const previewsEnabled = readPreviewsEnabled(ipc, ctx);
          const wsCache = new Map<string, string>();
          const getWsName = (wsId: string): string => {
            if (wsCache.has(wsId)) return wsCache.get(wsId)!;
            const ws = repos.workspaces.getById(wsId);
            const name = ws?.name ?? '';
            wsCache.set(wsId, name);
            return name;
          };

          const tabs = candidates
            .map((tabId) => {
              const node = repos.treeNodes.getById(tabId);
              if (!node || node.kind !== 'tab') return null;
              return {
                id: node.id,
                url: node.url,
                originalTitle: node.originalTitle,
                customTitle: node.name,
                favicon: node.favicon,
                workspaceId: node.workspaceId,
                workspaceName: getWsName(node.workspaceId),
                discarded: node.discarded,
                lastActiveAt: node.lastActiveAt,
              };
            })
            .filter((t): t is NonNullable<typeof t> => t !== null);

          emitRendererAction(ipc, ctx, 'open-mru-modal', {
            direction: args.direction,
            tabs,
            previewsEnabled,
          });
        } else {
          // Salto directo: candidates[0] es la tab actual. Para 'forward'
          // saltamos a la siguiente más reciente; para 'backward' a la más
          // antigua dentro del subconjunto.
          const target =
            args.direction === 'forward'
              ? candidates[1]
              : candidates[candidates.length - 1];
          if (!target) return;

          const targetNode = repos.treeNodes.getById(target);
          if (!targetNode || targetNode.kind !== 'tab') return;

          if (targetNode.workspaceId !== ctx.activeWorkspaceId) {
            await registry.execute('workspace.switchTo', ctx, {
              workspaceId: targetNode.workspaceId,
            });
          }
          await registry.execute('tab.activate', ctx, { tabId: target });
        }
      },
    }),
  );

  // ---------- navegación ----------

  registry.register(
    defineCommand({
      id: 'nav.back',
      title: 'Atrás',
      category: 'navigation',
      defaultShortcut: 'Alt+Left',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        ipc.tabManager.goBack(ctx.windowId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'nav.forward',
      title: 'Adelante',
      category: 'navigation',
      defaultShortcut: 'Alt+Right',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        ipc.tabManager.goForward(ctx.windowId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'nav.reload',
      title: 'Recargar',
      category: 'navigation',
      defaultShortcut: 'F5',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        ipc.tabManager.reload(ctx.windowId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'nav.reloadHard',
      title: 'Recargar vaciando caché',
      category: 'navigation',
      defaultShortcut: 'Ctrl+Shift+R',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        ipc.tabManager.reloadIgnoringCache(ctx.windowId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'nav.stop',
      title: 'Detener carga',
      category: 'navigation',
      defaultShortcut: 'Escape',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        ipc.tabManager.stop(ctx.windowId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'nav.focusAddressBar',
      title: 'Enfocar barra de direcciones',
      category: 'navigation',
      defaultShortcut: 'Ctrl+L',
      run: (ctx) => {
        // Cuando el atajo se dispara desde el WCV (que es lo habitual al
        // navegar), su webContents tiene el foco; el `.focus()` del input
        // dentro del renderer no transfiere el foco entre webContents. Hay
        // que pedir explícitamente al main que devuelva el foco al renderer
        // de la BrowserWindow antes de emitir el evento.
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) {
            win.webContents.focus();
          }
        }
        emitRendererAction(ipc, ctx, 'focus-address-bar');
      },
    }),
  );

  // ---------- folders ----------

  registry.register(
    defineCommand({
      id: 'folder.createInActive',
      title: 'Nueva carpeta en el workspace activo',
      category: 'folder',
      // El atajo Ctrl+E queda reservado para "enfocar la barra de direcciones"
      // (alias estilo Chrome). Cuando exista UI para esta acción, se asignará
      // un combo nuevo desde el panel de settings (Fase 4).
      run: (ctx) => {
        if (ctx.activeWorkspaceId === null) return;
        emitRendererAction(ipc, ctx, 'create-folder-prompt', {
          workspaceId: ctx.activeWorkspaceId,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'folder.toggleCollapse',
      title: 'Plegar/desplegar carpeta',
      category: 'folder',
      argsSchema: z.object({ folderId: z.string() }),
      run: (ctx, args) => {
        const repos = reposForCommand(ipc, ctx);
        if (!repos) return;
        const folder = repos.treeNodes.toggleCollapse(args.folderId);
        ipc.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: folder.workspaceId,
        });
      },
    }),
  );

  // ---------- view ----------

  registry.register(
    defineCommand({
      id: 'view.toggleSidebarMode',
      title: 'Alternar modo de la barra lateral',
      category: 'view',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'toggle-sidebar-mode');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'view.toggleSidebar',
      title: 'Mostrar/ocultar barra lateral',
      category: 'view',
      defaultShortcut: 'Ctrl+B',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'toggle-sidebar');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'view.toggleDeviceMode',
      title: 'Modo dispositivo (responsive)',
      category: 'view',
      defaultShortcut: 'Ctrl+Shift+M',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'toggle-device-mode');
      },
    }),
  );

  // ---------- window ----------

  registry.register(
    defineCommand({
      id: 'window.minimize',
      title: 'Minimizar ventana',
      category: 'view',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        const win = BrowserWindow.fromId(ctx.windowId);
        if (!win || win.isDestroyed()) return;
        win.minimize();
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'window.toggleMaximize',
      title: 'Maximizar/restaurar ventana',
      category: 'view',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        const win = BrowserWindow.fromId(ctx.windowId);
        if (!win || win.isDestroyed()) return;
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'window.toggleFullscreen',
      title: 'Pantalla completa',
      category: 'view',
      defaultShortcut: 'F11',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        const win = BrowserWindow.fromId(ctx.windowId);
        if (!win || win.isDestroyed()) return;
        win.setFullScreen(!win.isFullScreen());
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'window.newSameProfile',
      title: 'Nueva ventana (mismo perfil)',
      category: 'view',
      defaultShortcut: 'Ctrl+Shift+W',
      run: async (ctx) => {
        if (ctx.windowId === null) return;
        const profileId = ipc.profileWindowManager.getProfileForWindow(ctx.windowId);
        if (!profileId) return;
        try {
          await ipc.profileWindowManager.openWindow(profileId, {});
        } catch (err) {
          ipc.logger.warn('[commands] window.newSameProfile falló', err);
        }
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'window.openBlinded',
      title: 'Nueva ventana blindada',
      category: 'view',
      defaultShortcut: 'Ctrl+Shift+B',
      run: async () => {
        try {
          await ipc.profileWindowManager.openBlindedWindow();
        } catch (err) {
          ipc.logger.warn('[commands] window.openBlinded falló', err);
        }
      },
    }),
  );

  // ---------- profile ----------

  registry.register(
    defineCommand({
      id: 'profile.openInNewWindow',
      title: 'Abrir perfil en nueva ventana',
      category: 'profile',
      argsSchema: z.object({ profileId: z.string() }),
      run: async (_ctx, args) => {
        await ipc.profileWindowManager.openWindow(args.profileId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'profile.openLastUsedInNewWindow',
      title: 'Abrir último perfil reciente en nueva ventana',
      category: 'profile',
      run: async (ctx) => {
        // "Último perfil distinto del actual" se resuelve por lastUsedAt.
        // No persistimos un MRU global aparte: lastUsedAt sube cada vez
        // que el perfil se abre, así que ordenando por él tenemos el
        // historial de "perfiles vistos recientemente" en orden razonable.
        const currentProfileId =
          ctx.windowId !== null
            ? ipc.profileWindowManager.getProfileForWindow(ctx.windowId)
            : null;
        const others = ipc.repositories.profiles
          .list()
          .filter((p) => p.id !== currentProfileId)
          .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
        const target = others[0];
        if (!target) return;
        await ipc.profileWindowManager.openWindow(target.id);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'profile.create',
      title: 'Crear perfil…',
      category: 'profile',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-create-profile-modal');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'profile.manage',
      title: 'Gestionar perfiles…',
      category: 'profile',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-manage-profile-modal');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'profile.lockCurrent',
      title: 'Cerrar el perfil actual',
      category: 'profile',
      defaultShortcut: 'Ctrl+Shift+L',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        const win = BrowserWindow.fromId(ctx.windowId);
        if (!win || win.isDestroyed()) return;
        // Cerrar la ventana enfocada dispara handleWindowClosed en
        // ProfileWindowManager, que a su vez cierra el perfil cuando es
        // la última ventana asociada. Es la forma más simple de "lock"
        // que respeta los invariantes (BD abierta mientras haya tabs).
        win.close();
      },
    }),
  );

  // ---------- url ----------

  registry.register(
    defineCommand({
      id: 'tab.copyUrl',
      title: 'Copiar URL de la pestaña activa',
      category: 'tab',
      defaultShortcut: 'Ctrl+Shift+C',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        // Devuelve el foco al renderer antes de emitir la acción para que
        // navigator.clipboard esté disponible (requiere contexto de documento activo).
        const win = BrowserWindow.fromId(ctx.windowId);
        if (win && !win.isDestroyed()) {
          win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'copy-url');
      },
    }),
  );

  // ---------- páginas internas ----------

  // ---------- reader ----------

  registry.register(
    defineCommand({
      id: 'reader.toggle',
      title: 'Alternar modo lectura',
      category: 'reader',
      defaultShortcut: 'Ctrl+Alt+R',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeTabId === null) return;
        const repos = reposForCommand(ipc, ctx);
        if (!repos) return;
        const node = repos.treeNodes.getById(ctx.activeTabId);
        if (!node || node.kind !== 'tab') return;

        if (node.url.startsWith('vela://reader')) {
          const params = new URLSearchParams(new URL(node.url).search);
          const sourceUrl = params.get('source');
          if (sourceUrl) ipc.tabManager.goto(ctx.windowId, sourceUrl);
        } else {
          const readerState = ipc.tabManager.getReaderState(ctx.activeTabId);
          if (!readerState?.readable) return;
          ipc.tabManager.goto(
            ctx.windowId,
            `vela://reader?source=${encodeURIComponent(node.url)}`,
          );
        }
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openSettings',
      title: 'Abrir Ajustes',
      category: 'internal',
      defaultShortcut: 'Ctrl+,',
      argsSchema: z.object({ section: z.string().optional() }),
      run: async (ctx, args) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        const section = args.section;
        const url = section ? `vela://settings#${section}` : 'vela://settings';
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url,
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openNewTab',
      title: 'Nueva pestaña',
      category: 'internal',
      defaultShortcut: 'Ctrl+T',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        const repos = reposForCommand(ipc, ctx);
        let newTabUrl = 'vela://newtab';
        if (repos) {
          try {
            const pageRaw = repos.settings.get('tabs:new-tab-page');
            const page = pageRaw ? (JSON.parse(pageRaw) as string) : 'newtab';
            if (page === 'blank') {
              newTabUrl = 'about:blank';
            } else if (page === 'custom') {
              const customRaw = repos.settings.get('tabs:new-tab-custom-url');
              const custom = customRaw ? (JSON.parse(customRaw) as string) : '';
              if (custom.startsWith('http://') || custom.startsWith('https://')) {
                newTabUrl = custom;
              }
            }
          } catch {
            // fall through to default
          }
        }
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url: newTabUrl,
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openAbout',
      title: 'Acerca de Vela',
      category: 'internal',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url: 'vela://about',
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openExtensions',
      title: 'Gestionar extensiones',
      category: 'internal',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url: 'vela://extensions',
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openHistory',
      title: 'Ver historial',
      category: 'internal',
      defaultShortcut: 'Ctrl+H',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url: 'vela://history',
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openFavorites',
      title: 'Ver favoritos',
      category: 'internal',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url: 'vela://favorites',
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openAnchors',
      title: 'Ver anclas',
      category: 'internal',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url: 'vela://anchors',
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openPasswords',
      title: 'Gestor de contraseñas',
      category: 'internal',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url: 'vela://passwords',
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openScripts',
      title: 'Scripts de usuario',
      category: 'internal',
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeWorkspaceId === null) return;
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId: ctx.activeWorkspaceId,
          parentId: null,
          url: 'vela://scripts',
          activate: true,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.createSecure',
      title: 'Nueva pestaña blindada',
      category: 'tab',
      // Ctrl+Shift+N está reservado para workspace.create; usamos Ctrl+Alt+N.
      defaultShortcut: 'Ctrl+Alt+N',
      run: async (ctx) => {
        if (ctx.windowId === null) return;
        const tabId = await ipc.tabManager.createSecureTab(ctx.windowId);
        const count = ipc.tabManager.getSecureTabCount();
        if (count > 5) {
          emitRendererAction(ipc, ctx, 'show-toast', {
            message: `Tienes ${count} pestañas blindadas abiertas. Cada una usa un proceso de renderer dedicado.`,
            type: 'info',
          });
        }
        void tabId;
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.reopenClosed',
      title: 'Reabrir última pestaña cerrada',
      category: 'tab',
      defaultShortcut: 'Ctrl+Shift+T',
      run: async (ctx) => {
        if (ctx.windowId === null) return;
        await ipc.tabManager.reopenLastClosed(ctx.windowId);
      },
    }),
  );

  // ---------- address bar modes ----------

  registry.register(
    defineCommand({
      id: 'tabSwitcher.open',
      title: 'Abrir buscador de pestañas',
      category: 'tab',
      defaultShortcut: 'Ctrl+Shift+A',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'open-tab-switcher');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'addressBar.openTabsMode',
      title: 'Buscar en pestañas abiertas',
      category: 'navigation',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'focus-address-bar-with-prefix', { prefix: '@' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'addressBar.openHistoryMode',
      title: 'Buscar en historial',
      category: 'navigation',
      defaultShortcut: 'Ctrl+Shift+H',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'focus-address-bar-with-prefix', { prefix: '#' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'addressBar.openCommandMode',
      title: 'Modo comando en la barra de direcciones',
      category: 'navigation',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'focus-address-bar-with-prefix', { prefix: '>' });
      },
    }),
  );

  // ---------- devtools ----------

  registry.register(
    defineCommand({
      id: 'devtools.toggleForActiveTab',
      title: 'Abrir/cerrar DevTools de la pestaña activa',
      category: 'view',
      defaultShortcut: 'F12',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        ipc.tabManager.toggleDevTools(ctx.windowId);
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.toggleForShell',
      title: 'Abrir/cerrar DevTools de la shell de Vela',
      category: 'view',
      defaultShortcut: 'Ctrl+Shift+Alt+I',
      run: (ctx) => {
        if (ctx.windowId === null) return;
        const win = BrowserWindow.fromId(ctx.windowId);
        if (!win || win.isDestroyed()) return;
        win.webContents.toggleDevTools();
      },
    }),
  );

  // ---------- screenshot ----------

  registry.register(
    defineCommand({
      id: 'screenshot.capture',
      title: 'Capturar pantalla',
      category: 'screenshot',
      defaultShortcut: 'Ctrl+Shift+S',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'screenshot-start');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'screenshot.captureVisible',
      title: 'Capturar área visible',
      category: 'screenshot',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'screenshot-start');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'screenshot.captureRegion',
      title: 'Capturar región seleccionada',
      category: 'screenshot',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'screenshot-start');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'screenshot.captureFullPage',
      title: 'Capturar página completa',
      category: 'screenshot',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'screenshot-start');
      },
    }),
  );

  // ---------- split view ----------

  registry.register(
    defineCommand({
      id: 'layout.splitHorizontal',
      title: 'Dividir horizontalmente',
      category: 'view',
      run: async (ctx) => {
        if (ctx.windowId === null) return;
        await ipc.layoutManager.setSplit(ctx.windowId, 'split-h');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'layout.splitVertical',
      title: 'Dividir verticalmente',
      category: 'view',
      run: async (ctx) => {
        if (ctx.windowId === null) return;
        await ipc.layoutManager.setSplit(ctx.windowId, 'split-v');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'layout.closeSplit',
      title: 'Cerrar división',
      category: 'view',
      run: async (ctx) => {
        if (ctx.windowId === null) return;
        await ipc.layoutManager.closeSplit(ctx.windowId);
      },
    }),
  );

  // ---------- command palette ----------

  registry.register(
    defineCommand({
      id: 'commandPalette.open',
      title: 'Abrir paleta de comandos',
      category: 'internal',
      defaultShortcut: 'Ctrl+Space',
      run: (ctx) => {
        if (ctx.windowId !== null) {
          const win = BrowserWindow.fromId(ctx.windowId);
          if (win && !win.isDestroyed()) win.webContents.focus();
        }
        emitRendererAction(ipc, ctx, 'open-command-palette');
      },
    }),
  );

  // ---------- nuevos comandos para el palette ----------

  registry.register(
    defineCommand({
      id: 'workspace.rename',
      title: 'Renombrar workspace…',
      category: 'workspace',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-command-palette', { initialCommand: 'workspace.rename' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'workspace.setColor',
      title: 'Color del workspace…',
      category: 'workspace',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-command-palette', { initialCommand: 'workspace.setColor' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'tab.moveToWorkspace',
      title: 'Mover pestaña a workspace…',
      category: 'tab',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-command-palette', { initialCommand: 'tab.moveToWorkspace' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'view.setTheme',
      title: 'Cambiar tema…',
      category: 'view',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-command-palette', { initialCommand: 'view.setTheme' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'history.clearToday',
      title: 'Borrar historial de hoy',
      category: 'internal',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-command-palette', { initialCommand: 'history.clearToday' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'history.clearAll',
      title: 'Borrar todo el historial',
      category: 'internal',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-command-palette', { initialCommand: 'history.clearAll' });
      },
    }),
  );

  // ---------- recursos ----------

  registry.register(
    defineCommand({
      id: 'view.openResourcesMonitor',
      title: 'Visualizador de recursos',
      category: 'view',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-resources-monitor');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.openDownloads',
      title: 'Abrir descargas',
      category: 'internal',
      defaultShortcut: 'Ctrl+J',
      run: async (ctx) => {
        if (ctx.windowId === null) return;
        const workspaceId = ipc.tabManager.getWorkspaceForWindow(ctx.windowId);
        if (!workspaceId) return;
        const downloadsUrl = 'vela://downloads';
        await ipc.tabManager.createTab(ctx.windowId, {
          workspaceId,
          url: downloadsUrl,
          activate: true,
          parentId: null,
        });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'downloads.clearCompleted',
      title: 'Limpiar descargas completadas',
      category: 'navigation',
      run: () => {
        ipc.downloadManager.clearCompleted();
      },
    }),
  );

  // ---------- bug snapshot ----------

  initConsoleBuffers();
  const bugSnapshotSvc = new BugSnapshotService(ipc.tabManager, ipc.logger);

  registry.register(
    defineCommand({
      id: 'devtools.captureBugSnapshot',
      title: 'Capturar snapshot de bug',
      category: 'devtools',
      isVisible: (ctx) => ctx.activeTabId !== null,
      run: async (ctx) => {
        if (ctx.windowId === null || ctx.activeTabId === null) return;
        const repos = reposForCommand(ipc, ctx);
        const raw = repos?.settings.get('bug-snapshot:include-network');
        const includeNetwork = raw !== null ? (JSON.parse(raw ?? 'true') as boolean) : true;
        try {
          const zipPath = await bugSnapshotSvc.capture(ctx.activeTabId, ctx.windowId, includeNetwork);
          shell.showItemInFolder(zipPath);
          emitRendererAction(ipc, ctx, 'show-toast', {
            message: `Snapshot guardado: ${zipPath.split(/[\\/]/).pop() ?? 'bug-snapshot.zip'}`,
            type: 'info',
          });
        } catch (err) {
          emitRendererAction(ipc, ctx, 'show-toast', {
            message: `Error al capturar snapshot: ${err instanceof Error ? err.message : String(err)}`,
            type: 'error',
          });
        }
      },
    }),
  );

  // ---------- analytics debugger ----------

  registry.register(
    defineCommand({
      id: 'devtools.openAnalyticsDebugger',
      title: 'Analytics Debugger',
      category: 'devtools',
      defaultShortcut: 'Ctrl+Shift+Alt+A',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-analytics-debugger');
      },
    }),
  );

  // ---------- herramientas desarrollador ----------

  registry.register(
    defineCommand({
      id: 'devtools.color-picker',
      title: 'Herramientas dev: Pick de color',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-color-picker');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.json-formatter',
      title: 'Herramientas dev: Formateador JSON',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-json-formatter');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.regex-tester',
      title: 'Herramientas dev: Regex tester',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-regex-tester');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.text-diff',
      title: 'Herramientas dev: Diff de texto',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-text-diff');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.converters',
      title: 'Conversores',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-converters', { tab: 'css' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.converters.css',
      title: 'Conversores: Unidades CSS',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-converters', { tab: 'css' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.converters.base64',
      title: 'Conversores: Base64',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-converters', { tab: 'base64' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.converters.hash',
      title: 'Conversores: Hash',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-converters', { tab: 'hash' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.converters.uuid',
      title: 'Conversores: UUID / NanoID',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-converters', { tab: 'uuid' });
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'devtools.converters.timestamp',
      title: 'Conversores: Timestamps Unix',
      category: 'devtools',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'open-devtools-converters', { tab: 'timestamp' });
      },
    }),
  );

  // ---------- ayuda ----------

  // ---------- buscar en página ----------

  registry.register(
    defineCommand({
      id: 'find.open',
      title: 'Buscar en página',
      category: 'navigation',
      defaultShortcut: 'Ctrl+F',
      run: (ctx) => {
        emitRendererAction(ipc, ctx, 'find-open');
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'internal.reportBug',
      title: 'Reportar un bug…',
      category: 'internal',
      run: () => {
        const v = process.versions;
        const body = [
          '## Descripción del problema\n\n<!-- Describe el bug aquí -->',
          '## Pasos para reproducir\n\n1. \n2. \n3. ',
          '## Comportamiento esperado\n\n',
          '## Versiones\n\n' +
            `| Componente | Versión |\n|---|---|\n` +
            `| Vela | ${app.getVersion()} |\n` +
            `| Electron | ${v['electron'] ?? ''} |\n` +
            `| Chromium | ${v['chrome'] ?? ''} |\n` +
            `| Node.js | ${v['node'] ?? ''} |\n` +
            `| Plataforma | ${process.platform} ${process.arch} |`,
        ].join('\n\n');
        void shell.openExternal(
          `https://github.com/IvanRosNavarro/Vela-Browser/issues/new?labels=bug&body=${encodeURIComponent(body)}`,
        );
      },
    }),
  );

  registry.register(
    defineCommand({
      id: 'translate.selectedText',
      title: 'Traducir texto seleccionado',
      category: 'translation',
      run: (ctx) => {
        if (ctx.windowId === null || !ctx.activeTabId) return;
        const wcv = ipc.tabManager.getWcvForTab(ctx.activeTabId);
        if (!wcv) return;
        void (async () => {
          let text = '';
          try {
            text = (await wcv.webContents.executeJavaScript(
              'window.getSelection().toString()',
              true,
            )) as string;
          } catch {
            return;
          }
          if (!text?.trim()) return;
          void translateAndShow(ipc, ctx.windowId!, text.trim());
        })();
      },
    }),
  );
}
