import type { DatabaseSync } from 'node:sqlite';
import type { AutoGroupRule, AutoGroupRuleMatchType } from '@vela/shared';
import { InvariantViolationError, NotFoundError } from '../../lib/errors';

interface AutoGroupRuleRow {
  id: string;
  workspace_id: string;
  pattern: string;
  match_type: AutoGroupRuleMatchType;
  target_folder_id: string;
  priority: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function rowToRule(row: AutoGroupRuleRow): AutoGroupRule {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    pattern: row.pattern,
    matchType: row.match_type,
    targetFolderId: row.target_folder_id,
    priority: row.priority,
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface RuleCreateInput {
  workspaceId: string;
  pattern: string;
  matchType: AutoGroupRuleMatchType;
  targetFolderId: string;
  enabled?: boolean;
}

export interface RuleUpdatePatch {
  pattern?: string;
  matchType?: AutoGroupRuleMatchType;
  targetFolderId?: string;
  enabled?: boolean;
}

// TODO(deuda): UUID v7 cuando esté disponible nativamente.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

export class AutoGroupRuleRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(workspaceId: string): AutoGroupRule[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM auto_group_rules WHERE workspace_id = ? ORDER BY priority ASC, created_at ASC',
      )
      .all(workspaceId) as AutoGroupRuleRow[];
    return rows.map(rowToRule);
  }

  getById(id: string): AutoGroupRule | null {
    const row = this.db
      .prepare('SELECT * FROM auto_group_rules WHERE id = ?')
      .get(id) as AutoGroupRuleRow | undefined;
    return row ? rowToRule(row) : null;
  }

  create(input: RuleCreateInput): AutoGroupRule {
    this.assertTargetFolder(input.workspaceId, input.targetFolderId);
    if (input.matchType === 'regex') {
      assertValidRegex(input.pattern);
    }
    const id = newId();
    const now = Date.now();
    const priority = this.computeNextPriority(input.workspaceId);
    this.db
      .prepare(
        `INSERT INTO auto_group_rules (
           id, workspace_id, pattern, match_type, target_folder_id,
           priority, enabled, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId,
        input.pattern,
        input.matchType,
        input.targetFolderId,
        priority,
        input.enabled === false ? 0 : 1,
        now,
        now,
      );
    const created = this.getById(id);
    if (!created) {
      throw new NotFoundError('AutoGroupRule', id);
    }
    return created;
  }

  update(id: string, patch: RuleUpdatePatch): AutoGroupRule {
    const existing = this.getById(id);
    if (!existing) throw new NotFoundError('AutoGroupRule', id);

    if (patch.targetFolderId !== undefined) {
      this.assertTargetFolder(existing.workspaceId, patch.targetFolderId);
    }
    if (
      patch.matchType === 'regex' ||
      (patch.matchType === undefined &&
        patch.pattern !== undefined &&
        existing.matchType === 'regex')
    ) {
      const pattern = patch.pattern ?? existing.pattern;
      assertValidRegex(pattern);
    }

    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.pattern !== undefined) {
      sets.push('pattern = ?');
      params.push(patch.pattern);
    }
    if (patch.matchType !== undefined) {
      sets.push('match_type = ?');
      params.push(patch.matchType);
    }
    if (patch.targetFolderId !== undefined) {
      sets.push('target_folder_id = ?');
      params.push(patch.targetFolderId);
    }
    if (patch.enabled !== undefined) {
      sets.push('enabled = ?');
      params.push(patch.enabled ? 1 : 0);
    }
    if (sets.length === 0) return existing;

    sets.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    this.db
      .prepare(`UPDATE auto_group_rules SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params);
    const updated = this.getById(id);
    if (!updated) throw new NotFoundError('AutoGroupRule', id);
    return updated;
  }

  delete(id: string): void {
    const result = this.db
      .prepare('DELETE FROM auto_group_rules WHERE id = ?')
      .run(id);
    if (result.changes === 0) {
      throw new NotFoundError('AutoGroupRule', id);
    }
  }

  /**
   * Reasigna la `priority` (0..N-1) según el orden de `ids`. La lista debe
   * contener exactamente las reglas del workspace; ignoramos huérfanos y
   * lanzamos si falta alguna.
   */
  reorderPriority(workspaceId: string, ids: readonly string[]): AutoGroupRule[] {
    const existing = this.list(workspaceId);
    const existingIds = new Set(existing.map((r) => r.id));
    const incomingIds = new Set(ids);
    if (existingIds.size !== incomingIds.size) {
      throw new InvariantViolationError(
        `reorderPriority: lista incompleta (esperaban ${existingIds.size}, recibí ${incomingIds.size})`,
      );
    }
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        throw new InvariantViolationError(
          `reorderPriority: regla ${id} falta en la lista`,
        );
      }
    }

    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      const upd = this.db.prepare(
        'UPDATE auto_group_rules SET priority = ?, updated_at = ? WHERE id = ?',
      );
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id === undefined) continue;
        upd.run(i, now, id);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignorar
      }
      throw err;
    }
    return this.list(workspaceId);
  }

  private computeNextPriority(workspaceId: string): number {
    const row = this.db
      .prepare(
        'SELECT MAX(priority) as max FROM auto_group_rules WHERE workspace_id = ?',
      )
      .get(workspaceId) as { max: number | null } | undefined;
    return (row?.max ?? -1) + 1;
  }

  private assertTargetFolder(workspaceId: string, folderId: string): void {
    const row = this.db
      .prepare(
        'SELECT kind, workspace_id FROM tree_nodes WHERE id = ?',
      )
      .get(folderId) as
      | { kind: string; workspace_id: string }
      | undefined;
    if (!row) throw new NotFoundError('Node', folderId);
    if (row.kind !== 'folder') {
      throw new InvariantViolationError(
        `target_folder_id debe ser un folder (id=${folderId})`,
      );
    }
    if (row.workspace_id !== workspaceId) {
      throw new InvariantViolationError(
        `target_folder_id ${folderId} pertenece a otro workspace (${row.workspace_id})`,
      );
    }
  }
}

function assertValidRegex(pattern: string): void {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern, 'i');
  } catch (err) {
    throw new InvariantViolationError(
      `pattern regex inválido: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
