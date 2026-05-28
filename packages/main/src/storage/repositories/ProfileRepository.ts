import type { DatabaseSync } from 'node:sqlite';
import type { Profile } from '@vela/shared';
import { positionsAtEnd } from '../../lib/tree';
import { InvariantViolationError } from '../../lib/errors';

interface ProfileRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: string;
  partition_id: string;
  has_master_password: number;
  password_hint: string | null;
  archived: number;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    position: row.position,
    partitionId: row.partition_id,
    hasMasterPassword: row.has_master_password !== 0,
    passwordHint: row.password_hint,
    archived: row.archived !== 0,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateProfileInput {
  id?: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  position?: string;
  hasMasterPassword?: boolean;
  passwordHint?: string | null;
}

export interface UpdateProfileInput {
  name?: string;
  icon?: string | null;
  color?: string | null;
  passwordHint?: string | null;
}

export class ProfileNotFoundError extends Error {
  readonly profileId: string;
  constructor(profileId: string) {
    super(`Profile ${profileId} not found`);
    this.name = 'ProfileNotFoundError';
    this.profileId = profileId;
  }
}

export class DuplicateProfileNameError extends Error {
  readonly name_: string;
  constructor(name: string) {
    super(`Profile name "${name}" already exists`);
    this.name = 'DuplicateProfileNameError';
    this.name_ = name;
  }
}

// TODO(deuda): UUID v7 cuando esté disponible nativamente en el runtime.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

function partitionIdFor(id: string): string {
  return `persist:profile-${id}`;
}

export class ProfileRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(): Profile[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM profiles WHERE archived = 0 ORDER BY position ASC',
      )
      .all() as ProfileRow[];
    return rows.map(rowToProfile);
  }

  listArchived(): Profile[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM profiles WHERE archived = 1 ORDER BY position ASC',
      )
      .all() as ProfileRow[];
    return rows.map(rowToProfile);
  }

  listAll(): Profile[] {
    const rows = this.db
      .prepare('SELECT * FROM profiles ORDER BY position ASC')
      .all() as ProfileRow[];
    return rows.map(rowToProfile);
  }

  getById(id: string): Profile | null {
    const row = this.db
      .prepare('SELECT * FROM profiles WHERE id = ?')
      .get(id) as ProfileRow | undefined;
    return row ? rowToProfile(row) : null;
  }

  getByPartitionId(partitionId: string): Profile | null {
    const row = this.db
      .prepare('SELECT * FROM profiles WHERE partition_id = ?')
      .get(partitionId) as ProfileRow | undefined;
    return row ? rowToProfile(row) : null;
  }

  create(input: CreateProfileInput): Profile {
    if (this.existsByName(input.name)) {
      throw new DuplicateProfileNameError(input.name);
    }
    const id = input.id ?? newId();
    const now = Date.now();
    const position = input.position ?? this.computeEndPosition();
    const partitionId = partitionIdFor(id);
    this.db
      .prepare(
        `INSERT INTO profiles (
           id, name, icon, color, position, partition_id,
           has_master_password, password_hint,
           archived, last_used_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.icon ?? null,
        input.color ?? null,
        position,
        partitionId,
        input.hasMasterPassword ? 1 : 0,
        input.passwordHint ?? null,
        now,
        now,
      );
    const created = this.getById(id);
    if (!created) {
      throw new ProfileNotFoundError(id);
    }
    return created;
  }

  update(id: string, patch: UpdateProfileInput): Profile {
    if ('partitionId' in (patch as Record<string, unknown>)) {
      throw new InvariantViolationError(
        `partition_id es estable de por vida; no puede modificarse (profile=${id})`,
      );
    }
    const existing = this.getById(id);
    if (!existing) throw new ProfileNotFoundError(id);

    if (patch.name !== undefined && patch.name !== existing.name) {
      if (this.existsByName(patch.name, id)) {
        throw new DuplicateProfileNameError(patch.name);
      }
    }

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
    if (patch.passwordHint !== undefined) {
      sets.push('password_hint = ?');
      params.push(patch.passwordHint);
    }
    if (sets.length === 0) return existing;

    sets.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    this.db
      .prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params);
    const updated = this.getById(id);
    if (!updated) throw new ProfileNotFoundError(id);
    return updated;
  }

  delete(id: string): void {
    const result = this.db
      .prepare('DELETE FROM profiles WHERE id = ?')
      .run(id);
    if (result.changes === 0) {
      throw new ProfileNotFoundError(id);
    }
  }

  archive(id: string, archived: boolean): Profile {
    const result = this.db
      .prepare(
        'UPDATE profiles SET archived = ?, updated_at = ? WHERE id = ?',
      )
      .run(archived ? 1 : 0, Date.now(), id);
    if (result.changes === 0) {
      throw new ProfileNotFoundError(id);
    }
    const updated = this.getById(id);
    if (!updated) throw new ProfileNotFoundError(id);
    return updated;
  }

  reorder(id: string, newPosition: string): Profile {
    const result = this.db
      .prepare(
        'UPDATE profiles SET position = ?, updated_at = ? WHERE id = ?',
      )
      .run(newPosition, Date.now(), id);
    if (result.changes === 0) {
      throw new ProfileNotFoundError(id);
    }
    const updated = this.getById(id);
    if (!updated) throw new ProfileNotFoundError(id);
    return updated;
  }

  setLastUsedAt(id: string, ts: number): void {
    const result = this.db
      .prepare('UPDATE profiles SET last_used_at = ? WHERE id = ?')
      .run(ts, id);
    if (result.changes === 0) {
      throw new ProfileNotFoundError(id);
    }
  }

  setMasterPasswordEnabled(
    id: string,
    enabled: boolean,
    hint: string | null,
  ): void {
    const result = this.db
      .prepare(
        'UPDATE profiles SET has_master_password = ?, password_hint = ?, updated_at = ? WHERE id = ?',
      )
      .run(enabled ? 1 : 0, hint, Date.now(), id);
    if (result.changes === 0) {
      throw new ProfileNotFoundError(id);
    }
  }

  private existsByName(name: string, excludeId?: string): boolean {
    const row = excludeId
      ? this.db
          .prepare('SELECT 1 FROM profiles WHERE name = ? AND id != ? LIMIT 1')
          .get(name, excludeId)
      : this.db
          .prepare('SELECT 1 FROM profiles WHERE name = ? LIMIT 1')
          .get(name);
    return row !== undefined;
  }

  private computeEndPosition(): string {
    const row = this.db
      .prepare(
        'SELECT position FROM profiles ORDER BY position DESC LIMIT 1',
      )
      .get() as { position: string } | undefined;
    return positionsAtEnd(row?.position ?? null);
  }
}
