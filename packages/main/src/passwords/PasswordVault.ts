import sodium from 'libsodium-wrappers-sumo';
import type { DatabaseSync } from 'node:sqlite';
import type { ProfileKeyring } from '../profiles/ProfileKeyring';
import type { Logger } from '../logger';
import { NotFoundError } from '../lib/errors';

export interface PasswordEntry {
  id: string;
  domain: string;
  loginUrl: string | null;
  username: string;
  password: string;
  notes: string | null;
  folder: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface PasswordEntrySummary {
  id: string;
  domain: string;
  loginUrl: string | null;
  username: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface CreatePasswordEntryInput {
  domain: string;
  loginUrl?: string | null;
  username: string;
  password: string;
  notes?: string | null;
  folder?: string;
}

export interface UpdatePasswordEntryInput {
  domain?: string;
  loginUrl?: string | null;
  username?: string;
  password?: string;
  notes?: string | null;
  folder?: string;
}

interface PasswordRow {
  id: string;
  domain: string;
  login_url: string | null;
  username: string;
  encrypted_password: Uint8Array;
  notes_encrypted: Uint8Array | null;
  folder: string;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
}

const NONCE_LEN = 24; // crypto_aead_xchacha20poly1305_ietf_NPUBBYTES

// TODO(deuda): UUID v7 cuando esté disponible nativamente en el runtime.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Repositorio de credenciales cifradas atado a un perfil concreto. Cada
 * `PasswordVault` se construye con la profile.db abierta del perfil y un
 * `ProfileKeyring` que custodia la clave en memoria (debe estar desbloqueada
 * para que store/retrieve funcionen — getKey lanza ProfileLockedError si no).
 *
 * Formato de los BLOB en BD: `nonce(24) || ciphertext+tag`. No guardamos
 * versión de algoritmo: si en el futuro hay que rotar, una migración SQL
 * lee, descifra con la versión vieja, recifra con la nueva y reescribe.
 */
export class PasswordVault {
  constructor(
    private readonly ctx: {
      db: DatabaseSync;
      keyring: ProfileKeyring;
      profileId: string;
      logger: Logger;
    },
  ) {}

  store(input: CreatePasswordEntryInput): string {
    const key = this.ctx.keyring.getKey(this.ctx.profileId);
    const id = newId();
    const now = Date.now();
    const encryptedPassword = this.encrypt(input.password, key);
    const encryptedNotes =
      input.notes != null && input.notes.length > 0
        ? this.encrypt(input.notes, key)
        : null;

    this.ctx.db
      .prepare(
        `INSERT INTO password_vault (
           id, domain, login_url, username, encrypted_password,
           notes_encrypted, folder, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.domain,
        input.loginUrl ?? null,
        input.username,
        encryptedPassword,
        encryptedNotes,
        input.folder ?? 'General',
        now,
        now,
      );

    return id;
  }

  retrieve(id: string): PasswordEntry | null {
    const key = this.ctx.keyring.getKey(this.ctx.profileId);
    const row = this.ctx.db
      .prepare(
        `SELECT id, domain, login_url, username, encrypted_password, notes_encrypted,
                folder, created_at, updated_at, last_used_at
         FROM password_vault WHERE id = ?`,
      )
      .get(id) as PasswordRow | undefined;
    if (!row) return null;
    return this.rowToEntry(row, key);
  }

  /**
   * Devuelve solo metadatos sin descifrar. Útil para autocompletar la lista
   * de cuentas para un dominio antes de que el usuario decida cuál usar.
   */
  listForDomain(domain: string): PasswordEntrySummary[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT id, domain, login_url, username, folder, created_at, updated_at, last_used_at
         FROM password_vault WHERE domain = ?
         ORDER BY last_used_at DESC NULLS LAST, updated_at DESC`,
      )
      .all(domain) as Array<Omit<PasswordRow, 'encrypted_password' | 'notes_encrypted'>>;
    return rows.map((r) => ({
      id: r.id,
      domain: r.domain,
      loginUrl: r.login_url,
      username: r.username,
      folder: r.folder,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastUsedAt: r.last_used_at,
    }));
  }

  listAll(): PasswordEntrySummary[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT id, domain, login_url, username, folder, created_at, updated_at, last_used_at
         FROM password_vault ORDER BY domain ASC, username ASC`,
      )
      .all() as Array<Omit<PasswordRow, 'encrypted_password' | 'notes_encrypted'>>;
    return rows.map((r) => ({
      id: r.id,
      domain: r.domain,
      loginUrl: r.login_url,
      username: r.username,
      folder: r.folder,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastUsedAt: r.last_used_at,
    }));
  }

  search(query: string): PasswordEntrySummary[] {
    const like = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const rows = this.ctx.db
      .prepare(
        `SELECT id, domain, login_url, username, folder, created_at, updated_at, last_used_at
         FROM password_vault
         WHERE domain LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\'
         ORDER BY domain ASC, username ASC`,
      )
      .all(like, like) as Array<Omit<PasswordRow, 'encrypted_password' | 'notes_encrypted'>>;
    return rows.map((r) => ({
      id: r.id,
      domain: r.domain,
      loginUrl: r.login_url,
      username: r.username,
      folder: r.folder,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastUsedAt: r.last_used_at,
    }));
  }

  listFolders(): string[] {
    const rows = this.ctx.db
      .prepare(`SELECT DISTINCT folder FROM password_vault ORDER BY folder ASC`)
      .all() as Array<{ folder: string }>;
    return rows.map((r) => r.folder);
  }

  /** Devuelve todas las entradas descifradas de un dominio (para autofill). */
  retrieveForDomain(domain: string): PasswordEntry[] {
    const key = this.ctx.keyring.getKey(this.ctx.profileId);
    const rows = this.ctx.db
      .prepare(
        `SELECT id, domain, login_url, username, encrypted_password, notes_encrypted,
                folder, created_at, updated_at, last_used_at
         FROM password_vault WHERE domain = ?
         ORDER BY last_used_at DESC NULLS LAST, updated_at DESC`,
      )
      .all(domain) as PasswordRow[];
    return rows.map((r) => this.rowToEntry(r, key));
  }

  update(id: string, patch: UpdatePasswordEntryInput): PasswordEntry {
    const key = this.ctx.keyring.getKey(this.ctx.profileId);
    const existing = this.ctx.db
      .prepare(
        `SELECT id, domain, login_url, username, encrypted_password, notes_encrypted,
                folder, created_at, updated_at, last_used_at
         FROM password_vault WHERE id = ?`,
      )
      .get(id) as PasswordRow | undefined;
    if (!existing) throw new NotFoundError('PasswordEntry', id);

    const sets: string[] = [];
    const params: Array<string | number | Uint8Array | null> = [];
    if (patch.domain !== undefined) {
      sets.push('domain = ?');
      params.push(patch.domain);
    }
    if (patch.loginUrl !== undefined) {
      sets.push('login_url = ?');
      params.push(patch.loginUrl ?? null);
    }
    if (patch.username !== undefined) {
      sets.push('username = ?');
      params.push(patch.username);
    }
    if (patch.password !== undefined) {
      sets.push('encrypted_password = ?');
      params.push(this.encrypt(patch.password, key));
    }
    if (patch.notes !== undefined) {
      sets.push('notes_encrypted = ?');
      params.push(
        patch.notes != null && patch.notes.length > 0
          ? this.encrypt(patch.notes, key)
          : null,
      );
    }
    if (patch.folder !== undefined) {
      sets.push('folder = ?');
      params.push(patch.folder);
    }
    if (sets.length === 0) {
      const reread = this.retrieve(id);
      if (!reread) throw new NotFoundError('PasswordEntry', id);
      return reread;
    }
    sets.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    this.ctx.db
      .prepare(`UPDATE password_vault SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params);

    const updated = this.retrieve(id);
    if (!updated) throw new NotFoundError('PasswordEntry', id);
    return updated;
  }

  markUsed(id: string): void {
    this.ctx.db
      .prepare('UPDATE password_vault SET last_used_at = ? WHERE id = ?')
      .run(Date.now(), id);
  }

  delete(id: string): void {
    const result = this.ctx.db
      .prepare('DELETE FROM password_vault WHERE id = ?')
      .run(id);
    if (result.changes === 0) {
      throw new NotFoundError('PasswordEntry', id);
    }
  }

  /** Exporta todas las entradas descifradas (para exportación protegida con contraseña). */
  exportAll(): PasswordEntry[] {
    const key = this.ctx.keyring.getKey(this.ctx.profileId);
    const rows = this.ctx.db
      .prepare(
        `SELECT id, domain, login_url, username, encrypted_password, notes_encrypted,
                folder, created_at, updated_at, last_used_at
         FROM password_vault ORDER BY domain ASC, username ASC`,
      )
      .all() as PasswordRow[];
    return rows.map((r) => this.rowToEntry(r, key));
  }

  // ---- helpers de cifrado --------------------------------------------------

  private rowToEntry(row: PasswordRow, key: Uint8Array): PasswordEntry {
    return {
      id: row.id,
      domain: row.domain,
      loginUrl: row.login_url,
      username: row.username,
      password: this.decrypt(row.encrypted_password, key),
      notes: row.notes_encrypted
        ? this.decrypt(row.notes_encrypted, key)
        : null,
      folder: row.folder,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
    };
  }

  private encrypt(plaintext: string, key: Uint8Array): Uint8Array {
    const nonce = sodium.randombytes_buf(NONCE_LEN);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      sodium.from_string(plaintext),
      null,
      null,
      nonce,
      key,
    );
    const out = new Uint8Array(nonce.length + ciphertext.length);
    out.set(nonce, 0);
    out.set(ciphertext, nonce.length);
    return out;
  }

  private decrypt(blob: Uint8Array, key: Uint8Array): string {
    if (blob.length < NONCE_LEN) {
      throw new Error('[password-vault] blob inválido (demasiado corto)');
    }
    const nonce = blob.subarray(0, NONCE_LEN);
    const ciphertext = blob.subarray(NONCE_LEN);
    const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      key,
    );
    return sodium.to_string(plain);
  }
}
