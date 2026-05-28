import type { DatabaseSync, SupportedValueType } from 'node:sqlite';
import type { UserScript } from '@vela/shared';
import { syncEvents } from '../../sync/syncEvents';
import { serializers } from '../../sync/serializers';

interface UserScriptRow {
  id: string;
  name: string;
  description: string;
  type: 'js' | 'css';
  code: string;
  match_patterns: string;
  enabled: number;
  run_at: 'document-start' | 'document-end' | 'document-idle';
  created_at: number;
  updated_at: number;
}

function rowToScript(row: UserScriptRow): UserScript {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    code: row.code,
    matchPatterns: JSON.parse(row.match_patterns) as string[],
    enabled: row.enabled === 1,
    runAt: row.run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function matchesPattern(url: string, pattern: string): boolean {
  if (pattern === '<all_urls>') return true;

  try {
    const schemeEnd = pattern.indexOf('://');
    if (schemeEnd === -1) return false;
    const scheme = pattern.slice(0, schemeEnd);
    const rest = pattern.slice(schemeEnd + 3);
    const slashIndex = rest.indexOf('/');
    const host = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
    const path = slashIndex === -1 ? '/' : '/' + rest.slice(slashIndex + 1);

    const parsed = new URL(url);
    const schemeOk =
      scheme === '*' || parsed.protocol === scheme + ':';
    const hostOk =
      host === '*' ||
      (host.startsWith('*.') &&
        parsed.hostname.endsWith(host.slice(1))) ||
      parsed.hostname === host;
    const pathPattern =
      '^' +
      path
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '.*') +
      '$';
    const pathOk = new RegExp(pathPattern).test(parsed.pathname);

    return schemeOk && hostOk && pathOk;
  } catch {
    return false;
  }
}

export class UserScriptsRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly profileId?: string,
  ) {}

  list(): UserScript[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, description, type, code, match_patterns, enabled, run_at, created_at, updated_at FROM user_scripts ORDER BY created_at ASC',
      )
      .all() as UserScriptRow[];
    return rows.map(rowToScript);
  }

  getEnabled(): UserScript[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, description, type, code, match_patterns, enabled, run_at, created_at, updated_at FROM user_scripts WHERE enabled = 1 ORDER BY created_at ASC',
      )
      .all() as UserScriptRow[];
    return rows.map(rowToScript);
  }

  getMatchingUrl(url: string): UserScript[] {
    return this.getEnabled().filter((s) =>
      s.matchPatterns.some((p) => matchesPattern(url, p)),
    );
  }

  add(data: Omit<UserScript, 'id' | 'createdAt' | 'updatedAt'>): UserScript {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO user_scripts (id, name, description, type, code, match_patterns, enabled, run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.name,
        data.description,
        data.type,
        data.code,
        JSON.stringify(data.matchPatterns),
        data.enabled ? 1 : 0,
        data.runAt,
        now,
        now,
      );
    const script: UserScript = {
      id,
      name: data.name,
      description: data.description,
      type: data.type,
      code: data.code,
      matchPatterns: data.matchPatterns,
      enabled: data.enabled,
      runAt: data.runAt,
      createdAt: now,
      updatedAt: now,
    };
    this.emitSyncChange(script);
    return script;
  }

  update(id: string, data: Partial<Omit<UserScript, 'id' | 'createdAt' | 'updatedAt'>>): void {
    const now = Date.now();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code); }
    if (data.matchPatterns !== undefined) { fields.push('match_patterns = ?'); values.push(JSON.stringify(data.matchPatterns)); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }
    if (data.runAt !== undefined) { fields.push('run_at = ?'); values.push(data.runAt); }

    values.push(id);
    this.db
      .prepare(`UPDATE user_scripts SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as SupportedValueType[]));

    const script = this.getById(id);
    if (script) this.emitSyncChange(script);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM user_scripts WHERE id = ?').run(id);
    this.emitSyncDelete(id);
  }

  toggle(id: string, enabled: boolean): void {
    this.db
      .prepare('UPDATE user_scripts SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, Date.now(), id);
    const script = this.getById(id);
    if (script) this.emitSyncChange(script);
  }

  getById(id: string): UserScript | null {
    const row = this.db
      .prepare(
        'SELECT id, name, description, type, code, match_patterns, enabled, run_at, created_at, updated_at FROM user_scripts WHERE id = ?',
      )
      .get(id) as UserScriptRow | undefined;
    return row ? rowToScript(row) : null;
  }

  getUpdatedAt(id: string): number | null {
    const row = this.db
      .prepare('SELECT updated_at FROM user_scripts WHERE id = ?')
      .get(id) as { updated_at: number } | undefined;
    return row?.updated_at ?? null;
  }

  /** Upsert desde sync remoto — no emite syncEvents. */
  syncUpsert(data: {
    id: string;
    name: string;
    description?: string;
    type: 'js' | 'css';
    code: string;
    matchPatterns: string[];
    enabled: number;
    runAt: 'document-start' | 'document-end' | 'document-idle';
    updatedAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO user_scripts (id, name, description, type, code, match_patterns, enabled, run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name           = excluded.name,
           description    = excluded.description,
           type           = excluded.type,
           code           = excluded.code,
           match_patterns = excluded.match_patterns,
           enabled        = excluded.enabled,
           run_at         = excluded.run_at,
           updated_at     = excluded.updated_at
         WHERE excluded.updated_at > user_scripts.updated_at`,
      )
      .run(
        data.id,
        data.name,
        data.description ?? '',
        data.type,
        data.code,
        JSON.stringify(data.matchPatterns),
        data.enabled,
        data.runAt,
        data.updatedAt,
        data.updatedAt,
      );
  }

  private emitSyncChange(script: UserScript): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'user_script',
      id: script.id,
      data: serializers['user_script']!.toSync(script),
      updatedAt: script.updatedAt,
    });
  }

  private emitSyncDelete(id: string): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'user_script',
      id,
      data: null,
      updatedAt: Date.now(),
    });
  }
}
