import type { DatabaseSync } from 'node:sqlite';
import type { FolderNode, TabNode, TreeNode } from '@vela/shared';
import {
  positionsAtEnd,
  positionsNBetween,
  wouldCreateCycle,
} from '../../lib/tree';
import {
  CycleError,
  InvariantViolationError,
  NotFoundError,
} from '../../lib/errors';
import { syncEvents } from '../../sync/syncEvents';
import { serializers } from '../../sync/serializers';

interface TreeNodeRow {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  kind: 'folder' | 'tab';
  position: string;
  name: string | null;
  color: string | null;
  icon: string | null;
  collapsed: number;
  url: string | null;
  original_title: string | null;
  favicon: string | null;
  pinned: number;
  pinned_url: string | null;
  anchored: number;
  anchored_url: string | null;
  discarded: number;
  last_active_at: number | null;
  is_secure: number;
  created_at: number;
  updated_at: number;
}

function rowToFolder(row: TreeNodeRow): FolderNode {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    kind: 'folder',
    position: row.position,
    name: row.name,
    color: row.color,
    icon: row.icon,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    collapsed: row.collapsed !== 0,
  };
}

function rowToTab(row: TreeNodeRow): TabNode {
  if (row.url === null || row.original_title === null) {
    throw new InvariantViolationError(
      `tab ${row.id} has NULL url/original_title (DB invariant violated)`,
    );
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    kind: 'tab',
    position: row.position,
    name: row.name,
    color: row.color,
    icon: row.icon,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    collapsed: row.collapsed !== 0,
    url: row.url,
    originalTitle: row.original_title,
    favicon: row.favicon,
    pinned: row.pinned !== 0,
    pinnedUrl: row.pinned_url ?? null,
    anchored: row.anchored !== 0,
    anchoredUrl: row.anchored_url ?? null,
    discarded: row.discarded !== 0,
    lastActiveAt: row.last_active_at,
    isSecure: row.is_secure !== 0,
  };
}

function isFolderTabUrl(url: string | null): boolean {
  return url !== null && url.startsWith('vela://folder-view');
}

function rowToNode(row: TreeNodeRow): TreeNode {
  return row.kind === 'folder' ? rowToFolder(row) : rowToTab(row);
}

export interface FolderCreateInput {
  workspaceId: string;
  parentId: string | null;
  name: string;
  position?: string;
  color?: string | null;
  icon?: string | null;
  collapsed?: boolean;
}

export interface TabCreateInput {
  workspaceId: string;
  parentId: string | null;
  url: string;
  originalTitle?: string;
  favicon?: string | null;
  name?: string | null;
  position?: string;
  color?: string | null;
  icon?: string | null;
  pinned?: boolean;
  discarded?: boolean;
  lastActiveAt?: number | null;
  isSecure?: boolean;
}

export interface NodeUpdatePatch {
  name?: string | null;
  color?: string | null;
  icon?: string | null;
  url?: string;
  originalTitle?: string;
  favicon?: string | null;
  collapsed?: boolean;
  discarded?: boolean;
  lastActiveAt?: number | null;
}

export type DeleteMode = 'subtree' | 'promote-children';

export interface MoveResult {
  node: TreeNode;
  pinnedDeactivated: boolean;
}

// TODO(deuda): migrar a UUID v7 cuando esté disponible nativamente.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

export class TreeNodeRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly profileId?: string,
  ) {}

  getById(id: string): TreeNode | null {
    const row = this.db
      .prepare('SELECT * FROM tree_nodes WHERE id = ?')
      .get(id) as TreeNodeRow | undefined;
    return row ? rowToNode(row) : null;
  }

  getByWorkspace(workspaceId: string): TreeNode[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM tree_nodes WHERE workspace_id = ? ORDER BY position',
      )
      .all(workspaceId) as TreeNodeRow[];
    return rows.map(rowToNode);
  }

  getAllTabIds(): string[] {
    const rows = this.db
      .prepare("SELECT id FROM tree_nodes WHERE kind = 'tab'")
      .all() as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /**
   * Búsqueda case-insensitive de tabs por subcadena en url o título
   * (custom_title si existe; si no, original_title). Devuelve solo nodos
   * tab, junto con el nombre del workspace al que pertenecen, ordenados
   * por last_active_at desc (las más recientes primero, NULLs al final).
   * Limit acotado por el caller; el handler IPC fija el techo razonable.
   */
  searchTabs(
    query: string,
    limit: number,
  ): Array<{ tab: TabNode; workspaceName: string }> {
    if (query.length === 0 || limit <= 0) return [];
    const rows = this.db
      .prepare(
        `SELECT t.*, w.name as workspace_name
         FROM tree_nodes t
         JOIN workspaces w ON w.id = t.workspace_id
         WHERE t.kind = 'tab'
           AND (
             LOWER(t.url) LIKE '%' || LOWER(?) || '%'
             OR LOWER(COALESCE(t.name, t.original_title)) LIKE '%' || LOWER(?) || '%'
           )
         ORDER BY t.last_active_at DESC NULLS LAST
         LIMIT ?`,
      )
      .all(query, query, limit) as Array<TreeNodeRow & { workspace_name: string }>;
    const result: Array<{ tab: TabNode; workspaceName: string }> = [];
    for (const row of rows) {
      if (row.kind !== 'tab') continue;
      try {
        result.push({ tab: rowToTab(row), workspaceName: row.workspace_name });
      } catch {
        // Filas con invariantes rotas (url/original_title null) se ignoran.
      }
    }
    return result;
  }

  getDescendants(id: string): TreeNode[] {
    const rows = this.db
      .prepare(
        `WITH RECURSIVE descendants(id) AS (
           SELECT id FROM tree_nodes WHERE parent_id = ?
           UNION ALL
           SELECT t.id FROM tree_nodes t
           JOIN descendants d ON t.parent_id = d.id
         )
         SELECT t.* FROM tree_nodes t
         WHERE t.id IN (SELECT id FROM descendants)
         ORDER BY t.position`,
      )
      .all(id) as TreeNodeRow[];
    return rows.map(rowToNode);
  }

  getAncestors(id: string): TreeNode[] {
    const node = this.getById(id);
    if (!node) return [];
    const result: TreeNode[] = [];
    let cursor = node.parentId;
    const seen = new Set<string>();
    while (cursor !== null) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const parent = this.getById(cursor);
      if (!parent) break;
      result.push(parent);
      cursor = parent.parentId;
    }
    return result;
  }

  createFolder(input: FolderCreateInput): FolderNode {
    this.assertParent(input.workspaceId, input.parentId);
    const id = newId();
    const now = Date.now();
    const position =
      input.position ?? this.computeEndPosition(input.workspaceId, input.parentId);
    this.db
      .prepare(
        `INSERT INTO tree_nodes (
           id, workspace_id, parent_id, kind, position, name, color, icon,
           collapsed, url, original_title, favicon, pinned, discarded,
           last_active_at, created_at, updated_at
         ) VALUES (?, ?, ?, 'folder', ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 0,
           NULL, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId,
        input.parentId,
        position,
        input.name,
        input.color ?? null,
        input.icon ?? null,
        input.collapsed ? 1 : 0,
        now,
        now,
      );
    const created = this.getById(id);
    if (!created || created.kind !== 'folder') {
      throw new InvariantViolationError(`createFolder: failed to read back ${id}`);
    }
    this.emitSyncChange(created);
    return created;
  }

  createFolderTab(input: FolderCreateInput): TabNode {
    this.assertParent(input.workspaceId, input.parentId);
    const id = newId();
    const now = Date.now();
    const position =
      input.position ?? this.computeEndPosition(input.workspaceId, input.parentId);
    const url = `vela://folder-view?folderId=${id}&workspaceId=${input.workspaceId}`;
    this.db
      .prepare(
        `INSERT INTO tree_nodes (
           id, workspace_id, parent_id, kind, position, name, color, icon,
           collapsed, url, original_title, favicon, pinned, discarded,
           last_active_at, is_secure, created_at, updated_at
         ) VALUES (?, ?, ?, 'tab', ?, ?, ?, ?, ?, ?, '', NULL, 0, 0, NULL, 0, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId,
        input.parentId,
        position,
        input.name,
        input.color ?? null,
        input.icon ?? null,
        input.collapsed ? 1 : 0,
        url,
        now,
        now,
      );
    const created = this.getById(id);
    if (!created || created.kind !== 'tab') {
      throw new InvariantViolationError(`createFolderTab: failed to read back ${id}`);
    }
    this.emitSyncChange(created);
    return created;
  }

  createTab(input: TabCreateInput): TabNode {
    if (input.pinned && input.parentId !== null) {
      throw new InvariantViolationError(
        'createTab: pinned tabs must live at workspace root (parentId === null)',
      );
    }
    this.assertParent(input.workspaceId, input.parentId);
    const id = newId();
    const now = Date.now();
    const position =
      input.position ?? this.computeEndPosition(input.workspaceId, input.parentId);
    this.db
      .prepare(
        `INSERT INTO tree_nodes (
           id, workspace_id, parent_id, kind, position, name, color, icon,
           collapsed, url, original_title, favicon, pinned, discarded,
           last_active_at, is_secure, created_at, updated_at
         ) VALUES (?, ?, ?, 'tab', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId,
        input.parentId,
        position,
        input.name ?? null,
        input.color ?? null,
        input.icon ?? null,
        input.url,
        input.originalTitle ?? '',
        input.favicon ?? null,
        input.pinned ? 1 : 0,
        input.discarded ? 1 : 0,
        input.lastActiveAt ?? null,
        input.isSecure ? 1 : 0,
        now,
        now,
      );
    const created = this.getById(id);
    if (!created || created.kind !== 'tab') {
      throw new InvariantViolationError(`createTab: failed to read back ${id}`);
    }
    this.emitSyncChange(created);
    return created;
  }

  update(id: string, patch: NodeUpdatePatch): TreeNode {
    const node = this.getById(id);
    if (!node) throw new NotFoundError('Node', id);

    if (node.kind === 'folder') {
      if (
        patch.url !== undefined ||
        patch.originalTitle !== undefined ||
        patch.favicon !== undefined ||
        patch.discarded !== undefined ||
        patch.lastActiveAt !== undefined
      ) {
        throw new InvariantViolationError(
          `update: tab-only fields not allowed on folder ${id}`,
        );
      }
    }

    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(patch.name);
    }
    if (patch.color !== undefined) {
      sets.push('color = ?');
      params.push(patch.color);
    }
    if (patch.icon !== undefined) {
      sets.push('icon = ?');
      params.push(patch.icon);
    }
    if (patch.url !== undefined) {
      sets.push('url = ?');
      params.push(patch.url);
    }
    if (patch.originalTitle !== undefined) {
      sets.push('original_title = ?');
      params.push(patch.originalTitle);
    }
    if (patch.favicon !== undefined) {
      sets.push('favicon = ?');
      params.push(patch.favicon);
    }
    if (patch.collapsed !== undefined) {
      sets.push('collapsed = ?');
      params.push(patch.collapsed ? 1 : 0);
    }
    if (patch.discarded !== undefined) {
      sets.push('discarded = ?');
      params.push(patch.discarded ? 1 : 0);
    }
    if (patch.lastActiveAt !== undefined) {
      sets.push('last_active_at = ?');
      params.push(patch.lastActiveAt);
    }

    if (sets.length === 0) return node;

    sets.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    this.db
      .prepare(`UPDATE tree_nodes SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params);

    const updated = this.getById(id);
    if (!updated) throw new NotFoundError('Node', id);
    this.emitSyncChange(updated);
    return updated;
  }

  delete(id: string, mode: DeleteMode): void {
    const node = this.getById(id);
    if (!node) throw new NotFoundError('Node', id);

    if (mode === 'subtree') {
      this.db.prepare('DELETE FROM tree_nodes WHERE id = ?').run(id);
      this.emitSyncDelete(id);
      return;
    }

    if (node.kind !== 'folder' && !isFolderTabUrl(node.kind === 'tab' ? node.url : null)) {
      throw new InvariantViolationError(
        `delete(promote-children): only valid for folders, got ${node.kind}`,
      );
    }

    this.db.exec('BEGIN');
    try {
      const children = this.db
        .prepare(
          'SELECT id FROM tree_nodes WHERE parent_id = ? ORDER BY position',
        )
        .all(id) as { id: string }[];

      if (children.length > 0) {
        const prevRow = (
          node.parentId === null
            ? this.db
                .prepare(
                  `SELECT position FROM tree_nodes
                   WHERE workspace_id = ? AND parent_id IS NULL
                     AND position < ? AND id != ?
                   ORDER BY position DESC LIMIT 1`,
                )
                .get(node.workspaceId, node.position, id)
            : this.db
                .prepare(
                  `SELECT position FROM tree_nodes
                   WHERE parent_id = ? AND position < ? AND id != ?
                   ORDER BY position DESC LIMIT 1`,
                )
                .get(node.parentId, node.position, id)
        ) as { position: string } | undefined;

        const nextRow = (
          node.parentId === null
            ? this.db
                .prepare(
                  `SELECT position FROM tree_nodes
                   WHERE workspace_id = ? AND parent_id IS NULL
                     AND position > ? AND id != ?
                   ORDER BY position ASC LIMIT 1`,
                )
                .get(node.workspaceId, node.position, id)
            : this.db
                .prepare(
                  `SELECT position FROM tree_nodes
                   WHERE parent_id = ? AND position > ? AND id != ?
                   ORDER BY position ASC LIMIT 1`,
                )
                .get(node.parentId, node.position, id)
        ) as { position: string } | undefined;

        const newPositions = positionsNBetween(
          prevRow?.position ?? null,
          nextRow?.position ?? null,
          children.length,
        );
        const now = Date.now();
        const upd = this.db.prepare(
          'UPDATE tree_nodes SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?',
        );
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const pos = newPositions[i];
          if (!child || pos === undefined) continue;
          upd.run(node.parentId, pos, now, child.id);
        }
      }

      this.db.prepare('DELETE FROM tree_nodes WHERE id = ?').run(id);
      this.db.exec('COMMIT');
      this.emitSyncDelete(id);
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // dejar que se propague el error original
      }
      throw err;
    }
  }

  move(
    id: string,
    newParentId: string | null,
    newPosition: string,
    newWorkspaceIdOverride?: string,
  ): MoveResult {
    const node = this.getById(id);
    if (!node) throw new NotFoundError('Node', id);

    if (
      wouldCreateCycle(id, newParentId, (nid) => {
        const n = this.getById(nid);
        return n ? { id: n.id, parentId: n.parentId } : null;
      })
    ) {
      throw new CycleError(
        `move: would create cycle (id=${id} -> parent=${newParentId})`,
      );
    }

    let newWorkspaceId = node.workspaceId;
    if (newParentId !== null) {
      const parent = this.getById(newParentId);
      if (!parent) throw new NotFoundError('Node', newParentId);
      if (parent.kind !== 'folder' && !isFolderTabUrl(parent.kind === 'tab' ? parent.url : null)) {
        throw new InvariantViolationError(
          `move: parent ${newParentId} is not a folder`,
        );
      }
      newWorkspaceId = parent.workspaceId;
    } else if (newWorkspaceIdOverride) {
      newWorkspaceId = newWorkspaceIdOverride;
    }

    let pinnedDeactivated = false;
    let pinnedAfter = node.kind === 'tab' ? node.pinned : false;
    if (node.kind === 'tab' && node.pinned && newParentId !== null) {
      pinnedDeactivated = true;
      pinnedAfter = false;
    }

    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `UPDATE tree_nodes
             SET parent_id = ?, position = ?, workspace_id = ?,
                 pinned = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          newParentId,
          newPosition,
          newWorkspaceId,
          pinnedAfter ? 1 : 0,
          now,
          id,
        );

      if (newWorkspaceId !== node.workspaceId) {
        const descRows = this.db
          .prepare(
            `WITH RECURSIVE d(id) AS (
               SELECT id FROM tree_nodes WHERE parent_id = ?
               UNION ALL
               SELECT t.id FROM tree_nodes t JOIN d ON t.parent_id = d.id
             )
             SELECT id FROM d`,
          )
          .all(id) as { id: string }[];
        if (descRows.length > 0) {
          const placeholders = descRows.map(() => '?').join(',');
          const params: (string | number)[] = [newWorkspaceId, now];
          for (const r of descRows) params.push(r.id);
          this.db
            .prepare(
              `UPDATE tree_nodes SET workspace_id = ?, updated_at = ?
               WHERE id IN (${placeholders})`,
            )
            .run(...params);
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // dejar que se propague el error original
      }
      throw err;
    }

    const updated = this.getById(id);
    if (!updated) throw new NotFoundError('Node', id);
    this.emitSyncChange(updated);
    return { node: updated, pinnedDeactivated };
  }

  reorder(id: string, newPosition: string): TreeNode {
    const result = this.db
      .prepare(
        'UPDATE tree_nodes SET position = ?, updated_at = ? WHERE id = ?',
      )
      .run(newPosition, Date.now(), id);
    if (result.changes === 0) {
      throw new NotFoundError('Node', id);
    }
    const updated = this.getById(id);
    if (!updated) throw new NotFoundError('Node', id);
    this.emitSyncChange(updated);
    return updated;
  }

  setPinned(id: string, pinned: boolean, pinnedUrl?: string | null): TabNode {
    const node = this.getById(id);
    if (!node) throw new NotFoundError('Node', id);
    if (node.kind !== 'tab') {
      throw new InvariantViolationError(`setPinned: ${id} is not a tab`);
    }
    if (pinned && node.parentId !== null) {
      // Código estable usado por el renderer para traducir a un toast
      // amigable ("La pestaña no se puede fijar dentro de una carpeta").
      throw new InvariantViolationError('CANNOT_PIN_NESTED_TAB');
    }
    const newPinnedUrl = pinned ? (pinnedUrl ?? null) : null;
    this.db
      .prepare(
        'UPDATE tree_nodes SET pinned = ?, pinned_url = ?, updated_at = ? WHERE id = ?',
      )
      .run(pinned ? 1 : 0, newPinnedUrl, Date.now(), id);
    const updated = this.getById(id);
    if (!updated || updated.kind !== 'tab') {
      throw new InvariantViolationError(
        `Node ${id} disappeared after setPinned`,
      );
    }
    return updated;
  }

  setPinnedUrl(id: string, pinnedUrl: string | null): TabNode {
    const node = this.getById(id);
    if (!node) throw new NotFoundError('Node', id);
    if (node.kind !== 'tab') throw new InvariantViolationError(`setPinnedUrl: ${id} is not a tab`);
    this.db
      .prepare('UPDATE tree_nodes SET pinned_url = ?, updated_at = ? WHERE id = ?')
      .run(pinnedUrl, Date.now(), id);
    const updated = this.getById(id);
    if (!updated || updated.kind !== 'tab') {
      throw new InvariantViolationError(`Node ${id} disappeared after setPinnedUrl`);
    }
    return updated;
  }

  setAnchored(id: string, anchored: boolean, anchoredUrl?: string | null): TabNode {
    const node = this.getById(id);
    if (!node) throw new NotFoundError('Node', id);
    if (node.kind !== 'tab') {
      throw new InvariantViolationError(`setAnchored: ${id} is not a tab`);
    }
    const newAnchoredUrl = anchored ? (anchoredUrl ?? null) : null;
    this.db
      .prepare(
        'UPDATE tree_nodes SET anchored = ?, anchored_url = ?, updated_at = ? WHERE id = ?',
      )
      .run(anchored ? 1 : 0, newAnchoredUrl, Date.now(), id);
    const updated = this.getById(id);
    if (!updated || updated.kind !== 'tab') {
      throw new InvariantViolationError(`Node ${id} disappeared after setAnchored`);
    }
    return updated;
  }

  setAnchoredUrl(id: string, anchoredUrl: string | null): TabNode {
    const node = this.getById(id);
    if (!node) throw new NotFoundError('Node', id);
    if (node.kind !== 'tab') throw new InvariantViolationError(`setAnchoredUrl: ${id} is not a tab`);
    this.db
      .prepare('UPDATE tree_nodes SET anchored_url = ?, updated_at = ? WHERE id = ?')
      .run(anchoredUrl, Date.now(), id);
    const updated = this.getById(id);
    if (!updated || updated.kind !== 'tab') {
      throw new InvariantViolationError(`Node ${id} disappeared after setAnchoredUrl`);
    }
    return updated;
  }

  listAnchored(): TabNode[] {
    const rows = this.db
      .prepare("SELECT * FROM tree_nodes WHERE anchored = 1 AND kind = 'tab'")
      .all() as TreeNodeRow[];
    const result: TabNode[] = [];
    for (const row of rows) {
      try {
        result.push(rowToTab(row));
      } catch {
        // Ignorar filas con invariantes rotas
      }
    }
    return result;
  }

  toggleCollapse(id: string): TreeNode {
    const node = this.getById(id);
    if (!node) throw new NotFoundError('Node', id);
    if (node.kind !== 'folder' && !isFolderTabUrl(node.kind === 'tab' ? node.url : null)) {
      throw new InvariantViolationError(
        `toggleCollapse: ${id} is not a folder`,
      );
    }
    const currentCollapsed = node.kind === 'folder' ? node.collapsed : (node as TabNode).collapsed;
    this.db
      .prepare(
        'UPDATE tree_nodes SET collapsed = ?, updated_at = ? WHERE id = ?',
      )
      .run(currentCollapsed ? 0 : 1, Date.now(), id);
    const updated = this.getById(id);
    if (!updated) {
      throw new InvariantViolationError(
        `Node ${id} disappeared after toggleCollapse`,
      );
    }
    return updated;
  }

  /** Upsert desde sync remoto — no emite syncEvents. */
  syncUpsert(data: {
    id: string;
    kind: 'folder' | 'tab';
    parentId: string | null;
    workspaceId: string;
    url?: string | null;
    title?: string | null;
    name?: string | null;
    favicon?: string | null;
    position: string;
    pinned?: number;
    color?: string | null;
    icon?: string | null;
    updatedAt: number;
  }): void {
    if (data.kind === 'tab') {
      this.db
        .prepare(
          `INSERT INTO tree_nodes
             (id, workspace_id, parent_id, kind, position, name, color, icon,
              collapsed, url, original_title, favicon, pinned, discarded,
              last_active_at, created_at, updated_at)
           VALUES (?, ?, ?, 'tab', ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, NULL, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             workspace_id   = excluded.workspace_id,
             parent_id      = excluded.parent_id,
             position       = excluded.position,
             name           = excluded.name,
             color          = excluded.color,
             icon           = excluded.icon,
             url            = excluded.url,
             original_title = excluded.original_title,
             favicon        = excluded.favicon,
             pinned         = excluded.pinned,
             updated_at     = excluded.updated_at
           WHERE excluded.updated_at > tree_nodes.updated_at`,
        )
        .run(
          data.id,
          data.workspaceId,
          data.parentId,
          data.position,
          data.name ?? null,
          data.color ?? null,
          data.icon ?? null,
          data.url ?? '',
          data.title ?? '',
          data.favicon ?? null,
          data.pinned ?? 0,
          data.updatedAt,
          data.updatedAt,
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO tree_nodes
             (id, workspace_id, parent_id, kind, position, name, color, icon,
              collapsed, url, original_title, favicon, pinned, discarded,
              last_active_at, created_at, updated_at)
           VALUES (?, ?, ?, 'folder', ?, ?, ?, ?, 0, NULL, NULL, NULL, 0, 0, NULL, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             workspace_id = excluded.workspace_id,
             parent_id    = excluded.parent_id,
             position     = excluded.position,
             name         = excluded.name,
             color        = excluded.color,
             icon         = excluded.icon,
             updated_at   = excluded.updated_at
           WHERE excluded.updated_at > tree_nodes.updated_at`,
        )
        .run(
          data.id,
          data.workspaceId,
          data.parentId,
          data.position,
          data.name ?? null,
          data.color ?? null,
          data.icon ?? null,
          data.updatedAt,
          data.updatedAt,
        );
    }
  }

  /** Elimina desde sync remoto — silencioso si no existe. */
  syncDelete(id: string): void {
    this.db.prepare('DELETE FROM tree_nodes WHERE id = ?').run(id);
  }

  private emitSyncChange(node: TreeNode): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'treenode',
      id: node.id,
      data: serializers['treenode']!.toSync(node),
      updatedAt: node.updatedAt,
    });
  }

  private emitSyncDelete(id: string): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'treenode',
      id,
      data: null,
      updatedAt: Date.now(),
    });
  }

  private assertParent(workspaceId: string, parentId: string | null): void {
    if (parentId === null) return;
    const parent = this.getById(parentId);
    if (!parent) throw new NotFoundError('Node', parentId);
    if (parent.kind !== 'folder' && !isFolderTabUrl(parent.kind === 'tab' ? parent.url : null)) {
      throw new InvariantViolationError(
        `Parent ${parentId} is not a folder`,
      );
    }
    if (parent.workspaceId !== workspaceId) {
      throw new InvariantViolationError(
        `Parent ${parentId} belongs to a different workspace (${parent.workspaceId})`,
      );
    }
  }

  private computeEndPosition(
    workspaceId: string,
    parentId: string | null,
  ): string {
    const row =
      parentId === null
        ? (this.db
            .prepare(
              `SELECT position FROM tree_nodes
               WHERE workspace_id = ? AND parent_id IS NULL
               ORDER BY position DESC LIMIT 1`,
            )
            .get(workspaceId) as { position: string } | undefined)
        : (this.db
            .prepare(
              `SELECT position FROM tree_nodes
               WHERE parent_id = ?
               ORDER BY position DESC LIMIT 1`,
            )
            .get(parentId) as { position: string } | undefined);
    return positionsAtEnd(row?.position ?? null);
  }
}
