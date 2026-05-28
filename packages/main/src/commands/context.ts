import type { CommandContext } from '@vela/shared';
import type { IpcContext } from '../ipc';
import type { ProfileRepositories } from '../profiles/ProfileManager';

const ACTIVE_WORKSPACE_KEY = 'active-workspace';

/**
 * Construye el CommandContext actual a partir del IpcContext y el id de la
 * BrowserWindow desde la que se dispara el comando. Si la ventana ya está
 * registrada en el TabManager se usa su workspace; en caso contrario cae al
 * profile_metadata del perfil. La pestaña activa se lee directamente del
 * TabManager.
 */
export function buildContext(
  ipc: IpcContext,
  windowId: number | null,
): CommandContext {
  if (windowId === null) {
    return {
      windowId: null,
      activeProfileId: null,
      activeTabId: null,
      activeWorkspaceId: null,
    };
  }

  const activeProfileId =
    ipc.profileWindowManager.getProfileForWindow(windowId);

  let activeWorkspaceId: string | null =
    ipc.tabManager.getWorkspaceForWindow(windowId);
  if (!activeWorkspaceId && activeProfileId) {
    try {
      const repos = ipc.profileManager.getRepositories(activeProfileId);
      activeWorkspaceId = repos.metadata.get(ACTIVE_WORKSPACE_KEY);
    } catch {
      // perfil cerrado: dejamos null y los comandos abortan
    }
  }

  return {
    windowId,
    activeProfileId: activeProfileId ?? null,
    activeTabId: ipc.tabManager.getActiveTabId(windowId),
    activeWorkspaceId,
  };
}

/**
 * Devuelve los repositorios per-perfil correspondientes al CommandContext
 * actual, o null si el comando se ejecuta sin perfil resoluble (windowId
 * null o perfil cerrado). Los handlers que llaman a workspaces/treeNodes/
 * autoGroupRules deben tratarlo como abort silencioso.
 */
export function reposForCommand(
  ipc: IpcContext,
  ctx: CommandContext,
): ProfileRepositories | null {
  if (!ctx.activeProfileId) return null;
  try {
    return ipc.profileManager.getRepositories(ctx.activeProfileId);
  } catch {
    return null;
  }
}
