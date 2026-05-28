import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  ruleCreateInputSchema,
  ruleDeleteInputSchema,
  ruleListInputSchema,
  ruleReorderPriorityInputSchema,
  ruleUpdateInputSchema,
  type AutoGroupRule,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame } from './helpers';
import { NotFoundError } from '../lib/errors';

export function registerRuleHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.RULE_LIST,
    async (event, payload): Promise<IpcResponse<AutoGroupRule[]>> => {
      const parsed = ruleListInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const rules = repos.autoGroupRules.list(parsed.data.workspaceId);
        return { ok: true, data: rules };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RULE_LIST);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULE_CREATE,
    async (event, payload): Promise<IpcResponse<AutoGroupRule>> => {
      const parsed = ruleCreateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const rule = repos.autoGroupRules.create(parsed.data);
        ctx.events.emit(IPC_EVENTS.RULES_CHANGED, {
          workspaceId: rule.workspaceId,
        });
        return { ok: true, data: rule };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RULE_CREATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULE_UPDATE,
    async (event, payload): Promise<IpcResponse<AutoGroupRule>> => {
      const parsed = ruleUpdateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const { id, ...patch } = parsed.data;
        const rule = repos.autoGroupRules.update(id, patch);
        ctx.events.emit(IPC_EVENTS.RULES_CHANGED, {
          workspaceId: rule.workspaceId,
        });
        return { ok: true, data: rule };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RULE_UPDATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULE_DELETE,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      const parsed = ruleDeleteInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const before = repos.autoGroupRules.getById(parsed.data.id);
        if (!before) throw new NotFoundError('AutoGroupRule', parsed.data.id);
        repos.autoGroupRules.delete(parsed.data.id);
        ctx.events.emit(IPC_EVENTS.RULES_CHANGED, {
          workspaceId: before.workspaceId,
        });
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RULE_DELETE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULE_REORDER_PRIORITY,
    async (event, payload): Promise<IpcResponse<AutoGroupRule[]>> => {
      const parsed = ruleReorderPriorityInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const rules = repos.autoGroupRules.reorderPriority(
          parsed.data.workspaceId,
          parsed.data.ids,
        );
        ctx.events.emit(IPC_EVENTS.RULES_CHANGED, {
          workspaceId: parsed.data.workspaceId,
        });
        return { ok: true, data: rules };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RULE_REORDER_PRIORITY);
      }
    },
  );
}
