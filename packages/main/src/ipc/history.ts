import { ipcMain } from 'electron';
import { IPC_CHANNELS, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame } from './helpers';
import type { HistorySearchEntry, HistorySession, DomainStat } from '@vela/shared';
import { z } from '@vela/shared';

const historySearchSchema = z.object({
  query: z.string(),
  workspaceId: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().min(0).optional(),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
});

const historyRecentSchema = z.object({
  limit: z.number().int().positive().max(50).optional(),
});

const historySessionsSchema = z.object({
  workspaceId: z.string().optional(),
});

const historyDomainStatsSchema = z.object({
  workspaceId: z.string().optional(),
});

const historyDeleteSchema = z.object({
  id: z.string(),
});

const historyDeleteDomainSchema = z.object({
  domain: z.string(),
});

const historyDeleteAllSchema = z.object({
  workspaceId: z.string().optional(),
});

const historyForPeriodSchema = z.object({
  from: z.number().int(),
  to: z.number().int(),
  workspaceId: z.string().optional(),
});

function entryToSearchEntry(e: { id: string; url: string; title: string; favicon: string | null; visitedAt: number; workspaceId: string; sessionId: string }): HistorySearchEntry {
  return {
    id: e.id,
    url: e.url,
    title: e.title,
    favicon: e.favicon,
    visitedAt: e.visitedAt,
    workspaceId: e.workspaceId,
    sessionId: e.sessionId,
  };
}

export function registerHistoryHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.HISTORY_SEARCH,
    async (event, payload): Promise<IpcResponse<HistorySearchEntry[]>> => {
      try {
        const { query, workspaceId, limit, offset, from, to } = historySearchSchema.parse(payload);
        const repos = getReposForFrame(event, ctx);
        const entries = repos.history.search(query, { workspaceId, limit: limit ?? 50, offset, from, to });
        return { ok: true, data: entries.map(entryToSearchEntry) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.HISTORY_SEARCH);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HISTORY_GET_RECENT,
    async (event, payload): Promise<IpcResponse<HistorySearchEntry[]>> => {
      try {
        const { limit } = historyRecentSchema.parse(payload ?? {});
        const repos = getReposForFrame(event, ctx);
        const entries = repos.history.getRecent(limit ?? 10);
        return { ok: true, data: entries.map(entryToSearchEntry) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.HISTORY_GET_RECENT);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HISTORY_GET_SESSIONS,
    async (event, payload): Promise<IpcResponse<HistorySession[]>> => {
      try {
        const { workspaceId } = historySessionsSchema.parse(payload ?? {});
        const repos = getReposForFrame(event, ctx);
        const sessions = repos.history.getSessions(workspaceId);
        return { ok: true, data: sessions };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.HISTORY_GET_SESSIONS);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HISTORY_GET_DOMAIN_STATS,
    async (event, payload): Promise<IpcResponse<DomainStat[]>> => {
      try {
        const { workspaceId } = historyDomainStatsSchema.parse(payload ?? {});
        const repos = getReposForFrame(event, ctx);
        const stats = repos.history.getDomainStats(workspaceId);
        return { ok: true, data: stats };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.HISTORY_GET_DOMAIN_STATS);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HISTORY_DELETE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id } = historyDeleteSchema.parse(payload);
        const repos = getReposForFrame(event, ctx);
        repos.history.delete(id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.HISTORY_DELETE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HISTORY_DELETE_DOMAIN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { domain } = historyDeleteDomainSchema.parse(payload);
        const repos = getReposForFrame(event, ctx);
        repos.history.deleteByDomain(domain);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.HISTORY_DELETE_DOMAIN);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HISTORY_DELETE_ALL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { workspaceId } = historyDeleteAllSchema.parse(payload ?? {});
        const repos = getReposForFrame(event, ctx);
        repos.history.deleteAll(workspaceId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.HISTORY_DELETE_ALL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.HISTORY_GET_FOR_PERIOD,
    async (event, payload): Promise<IpcResponse<HistorySearchEntry[]>> => {
      try {
        const { from, to, workspaceId } = historyForPeriodSchema.parse(payload);
        const repos = getReposForFrame(event, ctx);
        const entries = repos.history.getForPeriod(from, to, workspaceId);
        return { ok: true, data: entries.map(entryToSearchEntry) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.HISTORY_GET_FOR_PERIOD);
      }
    },
  );
}
