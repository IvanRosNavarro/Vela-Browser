import type { TabManager } from '../tabs/TabManager';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { Logger } from '../logger';

interface DiscardManagerCtx {
  tabManager: TabManager;
  profileManager: ProfileManager;
  logger: Logger;
}

const TIMEOUT_MAP: Record<string, number> = {
  '5':   5  * 60_000,
  '15':  15 * 60_000,
  '30':  30 * 60_000,
  '60':  60 * 60_000,
  '120': 2  * 60 * 60_000,
  '240': 4  * 60 * 60_000,
};

export class DiscardManager {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly ctx: DiscardManagerCtx) {}

  start(): void {
    this.timer = setInterval(() => {
      this.evaluate().catch((err: unknown) => {
        this.ctx.logger.warn('[discard] evaluate error', err);
      });
    }, 60_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async evaluate(): Promise<void> {
    const now = Date.now();
    for (const profileId of this.ctx.tabManager.getOpenProfileIds()) {
      try {
        await this.evaluateProfile(profileId, now);
      } catch (err) {
        this.ctx.logger.warn(
          `[discard] evaluateProfile falló para profile=${profileId}`,
          err,
        );
      }
    }
  }

  private async evaluateProfile(profileId: string, now: number): Promise<void> {
    const repos = this.ctx.profileManager.getRepositories(profileId);

    const enabledRaw = repos.settings.get('tabs:discard-enabled');
    const enabled = enabledRaw !== null ? (JSON.parse(enabledRaw) as boolean) !== false : true;
    if (!enabled) return;

    const timeoutRaw = repos.settings.get('tabs:discard-timeout');
    // Stored as a number (minutes) in the DB via JSON.stringify(Number(v))
    const timeoutMinStr = timeoutRaw !== null ? String(JSON.parse(timeoutRaw)) : '60';
    const timeoutMs = TIMEOUT_MAP[timeoutMinStr] ?? 60 * 60_000;

    const noAudioRaw = repos.settings.get('tabs:discard-audio');
    const noAudio = noAudioRaw !== null ? (JSON.parse(noAudioRaw) as boolean) !== false : true;

    const noFormRaw = repos.settings.get('tabs:discard-forms');
    const noForm = noFormRaw !== null ? (JSON.parse(noFormRaw) as boolean) !== false : true;

    const noPinnedRaw = repos.settings.get('tabs:discard-pinned');
    const noPinned = noPinnedRaw !== null ? (JSON.parse(noPinnedRaw) as boolean) !== false : true;

    // Global domain whitelist (textarea, one domain per line)
    const whitelistRaw = repos.settings.get('tabs:discard-whitelist');
    const whitelistStr = whitelistRaw !== null ? (JSON.parse(whitelistRaw) as string) : '';
    const globalWhitelist = whitelistStr.split('\n').map((s) => s.trim()).filter(Boolean);

    // Permanent per-tab whitelist
    const permRaw = repos.settings.get('tabs:discard-permanent-whitelist');
    const permWhitelist: string[] = permRaw !== null ? (JSON.parse(permRaw) as string[]) : [];

    // Workspace whitelists: Record<wsId, boolean>
    const wsWlRaw = repos.settings.get('tabs:discard-workspace-whitelists');
    const wsWhitelists: Record<string, boolean> = wsWlRaw !== null
      ? (JSON.parse(wsWlRaw) as Record<string, boolean>)
      : {};

    // Folder whitelists: Record<folderId, boolean>
    const folderWlRaw = repos.settings.get('tabs:discard-folder-whitelists');
    const folderWhitelists: Record<string, boolean> = folderWlRaw !== null
      ? (JSON.parse(folderWlRaw) as Record<string, boolean>)
      : {};

    const workspaces = repos.workspaces.list();

    // Ventana representativa del perfil para enrutar repos al descartar tabs
    // suspendidas (que no pertenecen a la ventana visible de ningún window).
    const profileWindowId = this.ctx.tabManager.getAnyWindowIdForProfile(profileId);

    for (const ws of workspaces) {
      if (wsWhitelists[ws.id]) continue;

      const allNodes = repos.treeNodes.getByWorkspace(ws.id);
      for (const node of allNodes) {
        if (node.kind !== 'tab') continue;
        if (node.discarded) continue;
        // Cargas (pinned) y Anclas (anchored) comparten el mismo guard: son
        // las tabs que el usuario mantiene abiertas a propósito y cuyo estado
        // (sesión, formularios) no debe perderse por inactividad.
        if (noPinned && (node.pinned || node.anchored)) continue;
        if (!node.lastActiveAt || node.lastActiveAt >= now - timeoutMs) continue;

        // Solo descartar tabs con WCV vivo en runtime (en ventana o suspendido).
        // Las suspendidas (otros workspaces) también consumen memoria y deben
        // poder descartarse.
        if (!this.ctx.tabManager.hasRuntimeView(node.id)) continue;
        const windowId =
          this.ctx.tabManager.getWindowIdForTab(node.id) ?? profileWindowId;
        if (windowId === null) continue;

        // Dominio en whitelist global
        let hostname = '';
        try {
          hostname = new URL(node.url).hostname;
        } catch {
          continue;
        }
        if (globalWhitelist.some((d) => hostname === d || hostname.endsWith(`.${d}`))) continue;

        // Whitelist permanente por tabId
        if (permWhitelist.includes(node.id)) continue;

        // Whitelist por carpeta (si la tab está dentro de una carpeta)
        if (node.parentId && folderWhitelists[node.parentId]) continue;

        // Audio activo
        if (noAudio && this.ctx.tabManager.isTabCurrentlyAudible(node.id)) continue;

        // Formulario con datos introducidos por el usuario sin enviar.
        // (No basta con que la página tenga un formulario: casi todas lo
        // tienen — buscadores, logins — y eso impediría descartar casi todo.)
        if (noForm && this.ctx.tabManager.isTabFormDirty(node.id)) continue;

        // Descartar
        try {
          await this.ctx.tabManager.discardTab(windowId, node.id);
          this.ctx.logger.info(
            `[discard] auto-descartada tab=${node.id} url=${node.url}`,
          );
        } catch (err) {
          // Tab activa — InvariantViolationError esperado, silenciar
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('es la tab activa')) {
            this.ctx.logger.warn(`[discard] discardTab falló (tab=${node.id})`, err);
          }
        }
      }
    }
  }
}
