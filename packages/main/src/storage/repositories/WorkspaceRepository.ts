import type { DatabaseSync } from 'node:sqlite';
import type { Workspace, WindowLayout } from '@vela/shared';
import { positionsAtEnd } from '../../lib/tree';
import { NotFoundError } from '../../lib/errors';
import { syncEvents } from '../../sync/syncEvents';
import { serializers } from '../../sync/serializers';

interface WorkspaceRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: string;
  archived: number;
  created_at: number;
  updated_at: number;
  layout_config: string | null;
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  let layoutConfig: WindowLayout | null = null;
  if (row.layout_config) {
    try {
      layoutConfig = JSON.parse(row.layout_config) as WindowLayout;
    } catch {
      layoutConfig = null;
    }
  }
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    position: row.position,
    archived: row.archived !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    layoutConfig,
  };
}

export interface WorkspaceCreateInput {
  id?: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  position?: string;
}

export interface WorkspaceUpdatePatch {
  name?: string;
  icon?: string | null;
  color?: string | null;
}

// TODO(deuda): migrar a UUID v7 cuando esté disponible nativamente.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

export class WorkspaceRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly profileId?: string,
  ) {}

  list(): Workspace[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM workspaces WHERE archived = 0 ORDER BY position ASC',
        )
        .all() as WorkspaceRow[]
    ).map(rowToWorkspace);
  }

  listAll(): Workspace[] {
    return (
      this.db
        .prepare('SELECT * FROM workspaces ORDER BY position ASC')
        .all() as WorkspaceRow[]
    ).map(rowToWorkspace);
  }

  getById(id: string): Workspace | null {
    const row = this.db
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(id) as WorkspaceRow | undefined;
    return row ? rowToWorkspace(row) : null;
  }

  create(input: WorkspaceCreateInput): Workspace {
    const id = input.id ?? newId();
    const now = Date.now();
    const position = input.position ?? this.computeEndPosition();
    this.db
      .prepare(
        `INSERT INTO workspaces (
           id, name, icon, color, position, archived, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.icon ?? null,
        input.color ?? null,
        position,
        now,
        now,
      );
    const created = this.getById(id);
    if (!created) {
      throw new NotFoundError('Workspace', id);
    }
    this.emitSyncChange(created);
    return created;
  }

  update(id: string, patch: WorkspaceUpdatePatch): Workspace {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(patch.name);
    }
    if (patch.icon !== undefined) {
      sets.push('icon = ?');
      params.push(patch.icon);
    }
    if (patch.color !== undefined) {
      sets.push('color = ?');
      params.push(patch.color);
    }
    if (sets.length === 0) {
      const current = this.getById(id);
      if (!current) throw new NotFoundError('Workspace', id);
      return current;
    }
    sets.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);
    const result = this.db
      .prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params);
    if (result.changes === 0) {
      throw new NotFoundError('Workspace', id);
    }
    const updated = this.getById(id);
    if (!updated) throw new NotFoundError('Workspace', id);
    this.emitSyncChange(updated);
    return updated;
  }

  delete(id: string): void {
    const result = this.db
      .prepare('DELETE FROM workspaces WHERE id = ?')
      .run(id);
    if (result.changes === 0) {
      throw new NotFoundError('Workspace', id);
    }
    this.emitSyncDelete(id);
  }

  archive(id: string, archived: boolean): Workspace {
    const result = this.db
      .prepare(
        'UPDATE workspaces SET archived = ?, updated_at = ? WHERE id = ?',
      )
      .run(archived ? 1 : 0, Date.now(), id);
    if (result.changes === 0) {
      throw new NotFoundError('Workspace', id);
    }
    const updated = this.getById(id);
    if (!updated) throw new NotFoundError('Workspace', id);
    this.emitSyncChange(updated);
    return updated;
  }

  reorder(id: string, newPosition: string): Workspace {
    const result = this.db
      .prepare(
        'UPDATE workspaces SET position = ?, updated_at = ? WHERE id = ?',
      )
      .run(newPosition, Date.now(), id);
    if (result.changes === 0) {
      throw new NotFoundError('Workspace', id);
    }
    const updated = this.getById(id);
    if (!updated) throw new NotFoundError('Workspace', id);
    this.emitSyncChange(updated);
    return updated;
  }

  setLayoutConfig(id: string, config: WindowLayout | null): void {
    const result = this.db
      .prepare('UPDATE workspaces SET layout_config = ?, updated_at = ? WHERE id = ?')
      .run(config !== null ? JSON.stringify(config) : null, Date.now(), id);
    if (result.changes === 0) {
      throw new NotFoundError('Workspace', id);
    }
    // layout_config no se sincroniza (es estado de ventana, específico del dispositivo)
  }

  /** Upsert desde sync remoto — no emite syncEvents para evitar eco. */
  syncUpsert(data: {
    id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    position: string;
    archived?: number;
    updatedAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO workspaces (id, name, icon, color, position, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name       = excluded.name,
           icon       = excluded.icon,
           color      = excluded.color,
           position   = excluded.position,
           archived   = excluded.archived,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at > workspaces.updated_at`,
      )
      .run(
        data.id,
        data.name,
        data.icon ?? null,
        data.color ?? null,
        data.position,
        data.archived ?? 0,
        data.updatedAt,
        data.updatedAt,
      );
  }

  /** Elimina desde sync remoto — silencioso si no existe. */
  syncDelete(id: string): void {
    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  }

  private computeEndPosition(): string {
    const row = this.db
      .prepare(
        'SELECT position FROM workspaces ORDER BY position DESC LIMIT 1',
      )
      .get() as { position: string } | undefined;
    return positionsAtEnd(row?.position ?? null);
  }

  private emitSyncChange(ws: Workspace): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'workspace',
      id: ws.id,
      data: serializers['workspace']!.toSync(ws),
      updatedAt: ws.updatedAt,
    });
  }

  private emitSyncDelete(id: string): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'workspace',
      id,
      data: null,
      updatedAt: Date.now(),
    });
  }
}
