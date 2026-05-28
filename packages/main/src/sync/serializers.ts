import type { ProfileRepositories } from '../profiles/ProfileManager';

export interface EntitySerializer {
  toSync: (entity: unknown) => object;
  applyUpsert: (data: unknown, repos: ProfileRepositories) => Promise<void>;
  applyDelete: (id: string, repos: ProfileRepositories) => Promise<void>;
  getUpdatedAt: (id: string, repos: ProfileRepositories) => Promise<number | null>;
}

export const serializers: Record<string, EntitySerializer> = {

  workspace: {
    toSync: (ws: any) => ({
      id: ws.id,
      name: ws.name,
      icon: ws.icon ?? null,
      color: ws.color ?? null,
      position: ws.position,
      archived: ws.archived ? 1 : 0,
      updatedAt: ws.updatedAt ?? Date.now(),
    }),
    applyUpsert: async (data: any, repos) => {
      repos.workspaces.syncUpsert(data);
    },
    applyDelete: async (id, repos) => {
      repos.workspaces.syncDelete(id);
    },
    getUpdatedAt: async (id, repos) => {
      return repos.workspaces.getById(id)?.updatedAt ?? null;
    },
  },

  treenode: {
    toSync: (node: any) => ({
      id: node.id,
      kind: node.kind,
      parentId: node.parentId ?? null,
      workspaceId: node.workspaceId,
      url: node.url ?? null,
      title: node.originalTitle ?? null,
      name: node.name ?? null,
      favicon: node.favicon ?? null,
      position: node.position,
      pinned: node.pinned ? 1 : 0,
      color: node.color ?? null,
      icon: node.icon ?? null,
      updatedAt: node.updatedAt ?? Date.now(),
    }),
    applyUpsert: async (data: any, repos) => {
      repos.treeNodes.syncUpsert(data);
    },
    applyDelete: async (id, repos) => {
      repos.treeNodes.syncDelete(id);
    },
    getUpdatedAt: async (id, repos) => {
      return repos.treeNodes.getById(id)?.updatedAt ?? null;
    },
  },

  favorite: {
    toSync: (fav: any) => ({
      id: fav.id,
      url: fav.url ?? null,
      title: fav.title,
      favicon: fav.favicon ?? null,
      position: fav.position,
      updatedAt: fav.updatedAt ?? Date.now(),
      type: fav.type ?? 'bookmark',
      parentId: fav.parentId ?? null,
    }),
    applyUpsert: async (data: any, repos) => {
      repos.favorites.syncUpsert(data);
    },
    applyDelete: async (id, repos) => {
      repos.favorites.remove(id);
    },
    getUpdatedAt: async (id, repos) => {
      return repos.favorites.getById(id)?.updatedAt ?? null;
    },
  },

  user_script: {
    toSync: (s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      type: s.type,
      code: s.code,
      matchPatterns: s.matchPatterns,
      enabled: s.enabled ? 1 : 0,
      runAt: s.runAt,
      updatedAt: s.updatedAt ?? Date.now(),
    }),
    applyUpsert: async (data: any, repos) => {
      repos.userScripts.syncUpsert(data);
    },
    applyDelete: async (id, repos) => {
      repos.userScripts.delete(id);
    },
    getUpdatedAt: async (id, repos) => {
      return repos.userScripts.getUpdatedAt(id);
    },
  },

  adblocker_exception: {
    toSync: (e: any) => ({
      id: e.id,
      domain: e.domain,
      updatedAt: e.updatedAt ?? e.createdAt ?? Date.now(),
    }),
    applyUpsert: async (data: any, repos) => {
      repos.adBlockerExceptions.syncUpsert(data);
    },
    applyDelete: async (id, repos) => {
      repos.adBlockerExceptions.deleteById(id);
    },
    getUpdatedAt: async (id, repos) => {
      return repos.adBlockerExceptions.getUpdatedAt(id);
    },
  },

  setting: {
    toSync: (s: any) => ({
      id: s.key,
      key: s.key,
      value: s.value,
      updatedAt: s.updatedAt ?? Date.now(),
    }),
    applyUpsert: async (data: any, repos) => {
      repos.settings.syncSet(data.key, data.value);
    },
    applyDelete: async (_id, _repos) => {
      // Settings no se eliminan — solo se actualizan.
    },
    getUpdatedAt: async (id, repos) => {
      return repos.settings.getUpdatedAt(id);
    },
  },
};
