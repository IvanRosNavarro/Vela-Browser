import { create } from 'zustand';
import type {
  AutoGroupRule,
  RuleCreateInput,
  RuleUpdateInput,
} from '@vela/shared';
import { call } from '../lib/ipc';

export interface RulesState {
  rulesByWorkspace: Record<string, AutoGroupRule[]>;
  loadedWorkspaces: Set<string>;

  hydrate: (workspaceId: string) => Promise<void>;
  invalidate: (workspaceId: string) => Promise<void>;

  create: (input: RuleCreateInput) => Promise<AutoGroupRule>;
  update: (input: RuleUpdateInput) => Promise<AutoGroupRule>;
  delete: (id: string) => Promise<void>;
  reorderPriority: (
    workspaceId: string,
    ids: readonly string[],
  ) => Promise<AutoGroupRule[]>;
}

async function fetchRules(workspaceId: string): Promise<AutoGroupRule[]> {
  return call(() => window.api.rule.list({ workspaceId }));
}

export const useRulesStore = create<RulesState>((set, get) => ({
  rulesByWorkspace: {},
  loadedWorkspaces: new Set<string>(),

  async hydrate(workspaceId) {
    const rules = await fetchRules(workspaceId);
    set((state) => {
      const next = new Set(state.loadedWorkspaces);
      next.add(workspaceId);
      return {
        rulesByWorkspace: {
          ...state.rulesByWorkspace,
          [workspaceId]: rules,
        },
        loadedWorkspaces: next,
      };
    });
  },

  async invalidate(workspaceId) {
    if (!get().loadedWorkspaces.has(workspaceId)) return;
    const rules = await fetchRules(workspaceId);
    set((state) => ({
      rulesByWorkspace: {
        ...state.rulesByWorkspace,
        [workspaceId]: rules,
      },
    }));
  },

  async create(input) {
    return call(() => window.api.rule.create(input));
  },

  async update(input) {
    return call(() => window.api.rule.update(input));
  },

  async delete(id) {
    await call(() => window.api.rule.delete({ id }));
  },

  async reorderPriority(workspaceId, ids) {
    return call(() =>
      window.api.rule.reorderPriority({ workspaceId, ids: [...ids] }),
    );
  },
}));
