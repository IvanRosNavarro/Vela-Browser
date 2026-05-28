import { app, BrowserWindow, type Session } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ElectronBlocker } from '@cliqz/adblocker-electron';
import type { AdBlockerCounts } from '@vela/shared';
import { IPC_EVENTS } from '@vela/shared';
import type { Logger } from '../logger';
import type { TabManager } from '../tabs/TabManager';
import type { MainEventBus } from '../ipc/events';
import type { AdblockerExceptionsRepository } from '../storage/repositories/AdblockerExceptionsRepository';
import type { ProfileSettingsRepository } from '../storage/repositories/ProfileSettingsRepository';

const FILTER_LISTS: Record<string, string> = {
  easylist: 'https://easylist.to/easylist/easylist.txt',
  easyprivacy: 'https://easylist.to/easylist/easyprivacy.txt',
  ublock: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
};

const TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LISTS = ['easylist', 'easyprivacy', 'ublock'];

type BlockEntry = { url: string; rule: string };

interface TabCounts extends AdBlockerCounts {
  blocked: BlockEntry[];
}

interface ProfileState {
  blocker: ElectronBlocker | null;
  profileId: string;
  listsDir: string;
  session: Session;
  settingsRepo: ProfileSettingsRepository;
  exceptionsRepo: AdblockerExceptionsRepository;
  exceptions: Set<string>;
}

export class AdBlockerManager {
  private readonly blockCounts = new Map<string, TabCounts>();
  private readonly profiles = new Map<string, ProfileState>();
  private readonly lastUpdated = new Map<string, number>();

  constructor(
    private readonly ctx: {
      logger: Logger;
      tabManager: TabManager;
      events: MainEventBus;
    },
  ) {}

  async initialize(
    profileId: string,
    session: Session,
    settingsRepo: ProfileSettingsRepository,
    exceptionsRepo: AdblockerExceptionsRepository,
  ): Promise<void> {
    let enabled = true;
    let activeLists: string[] = DEFAULT_LISTS;
    let customLists: string[] = [];

    try {
      const rawEnabled = settingsRepo.get('adblocker:enabled');
      if (rawEnabled !== null) enabled = JSON.parse(rawEnabled) as boolean;

      const rawLists = settingsRepo.get('adblocker:active-lists');
      if (rawLists !== null) activeLists = JSON.parse(rawLists) as string[];

      const rawCustom = settingsRepo.get('adblocker:custom-lists');
      if (rawCustom !== null) customLists = JSON.parse(rawCustom) as string[];
    } catch { /* usar defaults */ }

    if (!enabled) {
      this.ctx.logger.info(`[adblocker] desactivado para perfil ${profileId}`);
      return;
    }

    const listsDir = path.join(
      app.getPath('userData'),
      'profiles',
      profileId,
      'filterlists',
    );
    await fs.mkdir(listsDir, { recursive: true });

    const exceptions = new Set<string>(exceptionsRepo.list());

    const state: ProfileState = {
      blocker: null,
      profileId,
      listsDir,
      session,
      settingsRepo,
      exceptionsRepo,
      exceptions,
    };
    this.profiles.set(profileId, state);

    await this.buildBlocker(state, activeLists, customLists);
  }

  private async buildBlocker(
    state: ProfileState,
    activeLists: string[],
    customLists: string[],
  ): Promise<void> {
    const { profileId, listsDir, session } = state;

    if (state.blocker) {
      try {
        state.blocker.disableBlockingInSession(session);
      } catch { /* ignore */ }
      state.blocker = null;
    }

    const filterTexts: string[] = [];
    let newestFetch = 0;

    for (const key of activeLists) {
      const url = FILTER_LISTS[key];
      if (!url) continue;
      const result = await this.loadList(key, listsDir, url);
      if (result) {
        filterTexts.push(result.text);
        if (result.fetchedAt > newestFetch) newestFetch = result.fetchedAt;
      }
    }

    for (let i = 0; i < customLists.length; i++) {
      const url = customLists[i];
      if (!url) continue;
      const result = await this.loadList(`custom_${i}`, listsDir, url);
      if (result) filterTexts.push(result.text);
    }

    if (filterTexts.length === 0) {
      this.ctx.logger.warn(`[adblocker] sin listas de filtros para perfil ${profileId}`);
      return;
    }

    const exceptionRules = Array.from(state.exceptions)
      .map((d) => `@@*$domain=${d}`)
      .join('\n');

    const allFilters = filterTexts.join('\n') + (exceptionRules ? '\n' + exceptionRules : '');

    try {
      this.ctx.logger.info(`[adblocker] compilando blocker para perfil ${profileId}…`);
      const blocker = ElectronBlocker.parse(allFilters, { enableCompression: false });
      state.blocker = blocker;

      blocker.enableBlockingInSession(session);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (blocker as any).on('request-blocked', (request: any) => {
        const webContentsId: number = typeof request.tabId === 'number' ? request.tabId : -1;
        if (webContentsId <= 0) return;
        const velaTabId = this.ctx.tabManager.getTabIdForWebContents(webContentsId);
        if (!velaTabId) return;
        this.recordBlock(velaTabId, request);
      });

      this.lastUpdated.set(profileId, newestFetch || Date.now());
      this.ctx.logger.info(`[adblocker] blocker activo para perfil ${profileId}`);
    } catch (err) {
      this.ctx.logger.error(`[adblocker] error compilando para perfil ${profileId}:`, err);
    }
  }

  private async loadList(
    key: string,
    dir: string,
    url: string,
  ): Promise<{ text: string; fetchedAt: number } | null> {
    const filePath = path.join(dir, `${key}.txt`);
    const metaPath = path.join(dir, `${key}.meta.json`);

    try {
      const metaRaw = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaRaw) as { fetchedAt: number };
      if (Date.now() - meta.fetchedAt < TTL_MS) {
        const text = await fs.readFile(filePath, 'utf-8');
        return { text, fetchedAt: meta.fetchedAt };
      }
    } catch { /* no caché o caducado */ }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const fetchedAt = Date.now();
      await fs.writeFile(filePath, text, 'utf-8');
      await fs.writeFile(metaPath, JSON.stringify({ fetchedAt }), 'utf-8');
      return { text, fetchedAt };
    } catch (err) {
      this.ctx.logger.warn(`[adblocker] no se pudo descargar ${key}: ${err}`);
      try {
        const text = await fs.readFile(filePath, 'utf-8');
        return { text, fetchedAt: 0 };
      } catch {
        return null;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recordBlock(velaTabId: string, request: any): void {
    const existing = this.blockCounts.get(velaTabId) ?? {
      ads: 0,
      trackers: 0,
      other: 0,
      blocked: [],
    };

    const type: string = request.type ?? '';
    if (type === 'script' || type === 'image' || type === 'stylesheet' || type === 'media') {
      existing.ads++;
    } else if (type === 'beacon' || type === 'ping' || type === 'xmlhttprequest') {
      existing.trackers++;
    } else {
      existing.other++;
    }

    existing.blocked.unshift({
      url: String(request.url ?? ''),
      rule: String(request.filter ?? 'blocked'),
    });
    if (existing.blocked.length > 50) existing.blocked.pop();

    this.blockCounts.set(velaTabId, existing);
    this.emitCountUpdate(velaTabId);
  }

  private emitCountUpdate(velaTabId: string): void {
    const counts = this.blockCounts.get(velaTabId);
    if (!counts) return;

    const windowId = this.ctx.tabManager.getWindowIdForTab(velaTabId);
    if (windowId === null) return;

    const win = BrowserWindow.fromId(windowId);
    if (!win || win.isDestroyed()) return;

    win.webContents.send(IPC_EVENTS.ADBLOCKER_COUNT_UPDATED, {
      tabId: velaTabId,
      counts,
    });
  }

  resetCountsForTab(tabId: string): void {
    this.blockCounts.delete(tabId);
  }

  getCountsForTab(tabId: string): AdBlockerCounts {
    return this.blockCounts.get(tabId) ?? { ads: 0, trackers: 0, other: 0, blocked: [] };
  }

  isEnabled(profileId: string): boolean {
    return this.profiles.has(profileId);
  }

  isException(profileId: string, domain: string): boolean {
    return this.profiles.get(profileId)?.exceptions.has(domain) ?? false;
  }

  listExceptions(profileId: string): string[] {
    return Array.from(this.profiles.get(profileId)?.exceptions ?? []);
  }

  async addException(profileId: string, domain: string): Promise<void> {
    const state = this.profiles.get(profileId);
    if (!state) return;
    state.exceptions.add(domain);
    state.exceptionsRepo.add(domain);
    await this.rebuildForProfile(state);
  }

  async removeException(profileId: string, domain: string): Promise<void> {
    const state = this.profiles.get(profileId);
    if (!state) return;
    state.exceptions.delete(domain);
    state.exceptionsRepo.remove(domain);
    await this.rebuildForProfile(state);
  }

  private readActiveLists(state: ProfileState): { activeLists: string[]; customLists: string[] } {
    let activeLists = DEFAULT_LISTS;
    let customLists: string[] = [];
    try {
      const r1 = state.settingsRepo.get('adblocker:active-lists');
      if (r1) activeLists = JSON.parse(r1) as string[];
      const r2 = state.settingsRepo.get('adblocker:custom-lists');
      if (r2) customLists = JSON.parse(r2) as string[];
    } catch { /* usar defaults */ }
    return { activeLists, customLists };
  }

  private async rebuildForProfile(state: ProfileState): Promise<void> {
    const { activeLists, customLists } = this.readActiveLists(state);
    await this.buildBlocker(state, activeLists, customLists);
  }

  async forceUpdateLists(profileId: string): Promise<void> {
    const state = this.profiles.get(profileId);
    if (!state) return;

    try {
      const files = await fs.readdir(state.listsDir);
      for (const f of files) {
        if (f.endsWith('.meta.json')) {
          await fs.unlink(path.join(state.listsDir, f));
        }
      }
    } catch { /* ignore */ }

    await this.rebuildForProfile(state);
  }

  getLastUpdated(profileId: string): number | null {
    return this.lastUpdated.get(profileId) ?? null;
  }

  detach(profileId: string): void {
    const state = this.profiles.get(profileId);
    if (!state) return;
    if (state.blocker) {
      try {
        state.blocker.disableBlockingInSession(state.session);
      } catch { /* ignore */ }
      state.blocker = null;
    }
    this.profiles.delete(profileId);
    this.lastUpdated.delete(profileId);
    this.ctx.logger.info(`[adblocker] arriado para perfil ${profileId}`);
  }

  async attach(
    profileId: string,
    session: Session,
    settingsRepo: ProfileSettingsRepository,
    exceptionsRepo: AdblockerExceptionsRepository,
  ): Promise<void> {
    await this.initialize(profileId, session, settingsRepo, exceptionsRepo);
  }
}
