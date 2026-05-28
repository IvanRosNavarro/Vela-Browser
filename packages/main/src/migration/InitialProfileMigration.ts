import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import { SETTINGS_DEFAULT_SCOPE } from '@vela/shared';
import type { Logger } from '../logger';
import {
  AppMetadataRepository,
  ProfileRepository,
  ProfileSettingsRepository,
} from '../storage/repositories';
import { ProfileMigrationRunner } from '../storage/ProfileMigrationRunner';
import { ProfileKeyring } from '../profiles/ProfileKeyring';
import {
  getProfileDbPath,
  getProfileDir,
  getProfileExtensionsDir,
  getProfilesRoot,
} from '../profiles/paths';
import { transaction } from '../storage/db';

const LAST_ACTIVE_PROFILE_KEY = 'last-active-profile';
const MIGRATION_MARKER_KEY = 'initial-profile-migration';

interface AppMetadataRow {
  key: string;
  value: string;
}

interface AnyRow {
  [key: string]: string | number | null;
}

interface CountRow {
  c: number;
}

export interface InitialProfileMigrationCtx {
  mainDb: DatabaseSync;
  profileRepo: ProfileRepository;
  appMetadata: AppMetadataRepository;
  keyring: ProfileKeyring;
  logger: Logger;
  /**
   * Carpeta de la que se copian las extensiones bundle al perfil "default".
   * En dev apunta al `/extensions/` del repo; en producción la carpeta no
   * existe (electron-builder excluye `extensions/**` del asar) y la copia
   * se omite.
   */
  bundleExtensionsDir: string;
}

/**
 * Migración one-shot que adapta una instalación pre-Fase 3 (sin perfiles, con
 * workspaces/tree_nodes/auto_group_rules viviendo en `vela.db`) al modelo de
 * Fase 3 (cada perfil con su `profile.db` bajo `userData/profiles/{uuid}/`).
 *
 * Se ejecuta una sola vez al arrancar la primera versión que la incluye y es
 * destructiva al final (DROP de las tablas viejas en vela.db). Por eso:
 *   1. Hacemos backup de vela.db ANTES de cualquier modificación.
 *   2. Copiamos los datos a profile.db dentro de una transacción.
 *   3. Verificamos count + sample-check antes de DROP.
 *   4. Solo entonces hacemos los DROP, también en transacción.
 *
 * Si algo falla en cualquier paso, se hace rollback y la migración lanza. El
 * caller (main/index.ts) muestra dialog modal y aborta el arranque.
 */
export class InitialProfileMigration {
  constructor(private readonly ctx: InitialProfileMigrationCtx) {}

  /**
   * Decide si la migración debe ejecutarse: cierto solo cuando vela.db sigue
   * teniendo las tablas legacy (workspaces, tree_nodes) y no existe ningún
   * perfil en `profiles` todavía. La 004 ya tiene que estar aplicada para que
   * la tabla `profiles` exista; eso lo garantiza `applyMigrations` antes de
   * llamar aquí.
   */
  async needsMigration(): Promise<boolean> {
    if (this.ctx.appMetadata.get(MIGRATION_MARKER_KEY) !== null) return false;
    if (this.ctx.profileRepo.list().length > 0) return false;
    if (this.ctx.profileRepo.listArchived().length > 0) return false;
    return this.legacyTablesExist();
  }

  async run(): Promise<void> {
    if (!(await this.needsMigration())) {
      this.ctx.logger.info(
        '[migration] needsMigration=false — nada que hacer',
      );
      return;
    }

    const startedAt = Date.now();
    const profileId = globalThis.crypto.randomUUID();
    const profileDir = getProfileDir(profileId);
    const profileDbPath = getProfileDbPath(profileId);
    let profileRowCreated = false;
    let profileDirCreated = false;
    let profileDb: DatabaseSync | null = null;

    this.ctx.logger.info(
      `[migration] iniciando migración inicial — profileId=${profileId}`,
    );

    let backupPath: string;
    try {
      backupPath = this.backupMainDb();
      this.ctx.logger.info(`[migration] backup creado en ${backupPath}`);
    } catch (err) {
      this.ctx.logger.error('[migration] no se pudo crear el backup', err);
      throw err;
    }

    try {
      fs.mkdirSync(getProfilesRoot(), { recursive: true });
      fs.mkdirSync(profileDir, { recursive: true });
      profileDirCreated = true;

      await new ProfileMigrationRunner(profileDbPath).runMigrations();
      profileDb = new DatabaseSync(profileDbPath);
      profileDb.exec('PRAGMA journal_mode = WAL');
      profileDb.exec('PRAGMA foreign_keys = ON');

      const counts = this.copyDataIntoProfileDb(profileDb);
      this.ctx.logger.info(
        `[migration] copiado: workspaces=${counts.workspaces}, tree_nodes=${counts.treeNodes}, auto_group_rules=${counts.autoGroupRules}, settings=${counts.settings}`,
      );

      this.verifyCopy(profileDb, counts);

      const settings = new ProfileSettingsRepository(profileDb);
      await this.ctx.keyring.createKeyForProfile(profileId, settings);

      const profile = this.ctx.profileRepo.create({
        id: profileId,
        name: 'Default',
      });
      profileRowCreated = true;
      this.ctx.logger.info(
        `[migration] perfil "default" creado: id=${profile.id} partition=${profile.partitionId}`,
      );

      this.dropLegacyTablesAndSettings();

      this.ctx.appMetadata.set(LAST_ACTIVE_PROFILE_KEY, profileId);
      this.ctx.appMetadata.set(
        MIGRATION_MARKER_KEY,
        JSON.stringify({ status: 'done', at: Date.now(), profileId }),
      );

      profileDb.close();
      profileDb = null;

      try {
        this.copyBundleExtensions(profileId);
      } catch (err) {
        // Las extensiones son recuperables: no abortar la migración por una
        // copia fallida. El log queda y el usuario puede reinstalarlas.
        this.ctx.logger.error(
          '[migration] copia de extensiones falló (continúo, los datos ya están migrados)',
          err,
        );
      }

      this.ctx.logger.info(
        `[migration] completada en ${Date.now() - startedAt}ms`,
      );
    } catch (err) {
      this.ctx.logger.error(
        '[migration] fallo durante la migración — iniciando rollback',
        err,
      );
      // Cierre defensivo de profile.db.
      if (profileDb) {
        try {
          profileDb.close();
        } catch (closeErr) {
          this.ctx.logger.warn(
            '[migration] cerrando profile.db durante rollback falló',
            closeErr,
          );
        }
      }
      // Si llegamos a registrar el perfil en `profiles`, también hay que
      // borrarlo. La clave en memoria del keyring se zeriza por completitud.
      if (profileRowCreated) {
        try {
          this.ctx.profileRepo.delete(profileId);
        } catch (delErr) {
          this.ctx.logger.warn(
            `[migration] rollback de profileRepo falló para ${profileId}`,
            delErr,
          );
        }
      }
      this.ctx.keyring.lockProfile(profileId);
      // El directorio del perfil se borra en cualquier caso de fallo: si los
      // DROP en vela.db ya pasaron, el rollback de la BD está fuera de nuestro
      // alcance (lo cubre el backup); pero como mínimo no dejamos un perfil
      // huérfano apuntando a una BD inservible.
      if (profileDirCreated) {
        try {
          fs.rmSync(profileDir, { recursive: true, force: true });
        } catch (rmErr) {
          this.ctx.logger.warn(
            `[migration] rollback de fs falló para ${profileDir}`,
            rmErr,
          );
        }
      }
      throw err;
    }
  }

  private legacyTablesExist(): boolean {
    const rows = this.ctx.mainDb
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name IN ('workspaces','tree_nodes')`,
      )
      .all() as { name: string }[];
    const found = new Set(rows.map((r) => r.name));
    return found.has('workspaces') && found.has('tree_nodes');
  }

  private backupMainDb(): string {
    const userDataDir = app.getPath('userData');
    const backupsDir = path.join(userDataDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });

    // Timestamp ISO sin caracteres conflictivos en NTFS/HFS+.
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '');
    const dest = path.join(backupsDir, `vela-pre-fase3-${stamp}.db`);
    const src = path.join(userDataDir, 'vela.db');
    fs.copyFileSync(src, dest);

    // Copiamos también -wal/-shm si existen: en WAL mode la coherencia depende
    // de los tres ficheros. Si la app se cerró limpiamente normalmente no
    // existen, pero curarse en salud cuesta poco.
    for (const suffix of ['-wal', '-shm']) {
      const sidecarSrc = src + suffix;
      if (fs.existsSync(sidecarSrc)) {
        fs.copyFileSync(sidecarSrc, dest + suffix);
      }
    }
    return dest;
  }

  private copyDataIntoProfileDb(profileDb: DatabaseSync): {
    workspaces: number;
    treeNodes: number;
    autoGroupRules: number;
    settings: number;
  } {
    return transaction(profileDb, () => {
      const workspaces = this.copyTable(
        profileDb,
        'workspaces',
        ['id', 'name', 'icon', 'color', 'position', 'archived', 'created_at', 'updated_at'],
        // Ordenar por position estabiliza el resultado pero no es crítico — la
        // tabla en profile.db arranca vacía (la migración 001 NO inserta el
        // workspace 'default', a diferencia de la 002 de vela.db).
        'ORDER BY position ASC',
      );

      // tree_nodes tiene FK a sí misma vía parent_id. Insertamos en orden de
      // dependencia (padres antes que hijos) para no requerir defer:
      // hacemos una pasada con CTE recursiva ordenada por profundidad.
      const treeNodes = this.copyTreeNodes(profileDb);

      const autoGroupRules = this.copyTable(
        profileDb,
        'auto_group_rules',
        [
          'id',
          'workspace_id',
          'pattern',
          'match_type',
          'target_folder_id',
          'priority',
          'enabled',
          'created_at',
          'updated_at',
        ],
        '',
        /* allowMissing */ true,
      );

      const settings = this.copyPerProfileSettings(profileDb);

      return { workspaces, treeNodes, autoGroupRules, settings };
    });
  }

  private copyTable(
    profileDb: DatabaseSync,
    tableName: string,
    columns: readonly string[],
    extraSql: string,
    allowMissing = false,
  ): number {
    if (allowMissing) {
      const exists = this.ctx.mainDb
        .prepare(
          `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
        )
        .get(tableName);
      if (!exists) return 0;
    }
    const cols = columns.join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const select = this.ctx.mainDb.prepare(
      `SELECT ${cols} FROM ${tableName} ${extraSql}`,
    );
    const insert = profileDb.prepare(
      `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`,
    );
    const rows = select.all() as AnyRow[];
    for (const row of rows) {
      const values = columns.map((c) => row[c] ?? null);
      insert.run(...values);
    }
    return rows.length;
  }

  private copyTreeNodes(profileDb: DatabaseSync): number {
    // CTE recursiva: profundidad 0 = raíces (parent_id IS NULL); cada nivel
    // sucesivo añade los hijos del anterior. Insertamos en ese orden para que
    // la FK self-referente (parent_id → tree_nodes.id) se cumpla siempre.
    const rows = this.ctx.mainDb
      .prepare(
        `WITH RECURSIVE ordered(id, depth) AS (
           SELECT id, 0 FROM tree_nodes WHERE parent_id IS NULL
           UNION ALL
           SELECT t.id, o.depth + 1
             FROM tree_nodes t
             JOIN ordered o ON t.parent_id = o.id
         )
         SELECT t.* FROM tree_nodes t
           JOIN ordered o ON o.id = t.id
          ORDER BY o.depth ASC, t.position ASC`,
      )
      .all() as AnyRow[];

    const insert = profileDb.prepare(
      `INSERT INTO tree_nodes (
         id, workspace_id, parent_id, kind, position, name, color, icon,
         collapsed, url, original_title, favicon, pinned, discarded,
         last_active_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      insert.run(
        row['id'] ?? null,
        row['workspace_id'] ?? null,
        row['parent_id'] ?? null,
        row['kind'] ?? null,
        row['position'] ?? null,
        row['name'] ?? null,
        row['color'] ?? null,
        row['icon'] ?? null,
        row['collapsed'] ?? 0,
        row['url'] ?? null,
        row['original_title'] ?? null,
        row['favicon'] ?? null,
        row['pinned'] ?? 0,
        row['discarded'] ?? 0,
        row['last_active_at'] ?? null,
        row['created_at'] ?? null,
        row['updated_at'] ?? null,
      );
    }
    return rows.length;
  }

  private copyPerProfileSettings(profileDb: DatabaseSync): number {
    const profileScopeKeys = Object.entries(SETTINGS_DEFAULT_SCOPE)
      .filter(([, scope]) => scope === 'profile')
      .map(([key]) => key);

    const rows = this.ctx.mainDb
      .prepare(
        'SELECT key, value FROM app_metadata WHERE key IN (' +
          profileScopeKeys.map(() => '?').join(',') +
          ')',
      )
      .all(...profileScopeKeys) as AppMetadataRow[];

    const insert = profileDb.prepare(
      `INSERT INTO settings_profile (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    for (const row of rows) {
      insert.run(row.key, row.value);
    }
    return rows.length;
  }

  private verifyCopy(
    profileDb: DatabaseSync,
    counts: {
      workspaces: number;
      treeNodes: number;
      autoGroupRules: number;
      settings: number;
    },
  ): void {
    const verifyCount = (table: string, expected: number): void => {
      const row = profileDb
        .prepare(`SELECT COUNT(*) AS c FROM ${table}`)
        .get() as CountRow;
      if (row.c !== expected) {
        throw new Error(
          `[migration] verificación falló para ${table}: esperaba ${expected}, encontré ${row.c}`,
        );
      }
    };
    verifyCount('workspaces', counts.workspaces);
    verifyCount('tree_nodes', counts.treeNodes);
    verifyCount('auto_group_rules', counts.autoGroupRules);

    // Sample-check: si hay alguna fila, comprueba que la primera workspace
    // tiene los mismos campos en ambas BDs. Es barato y atrapa truncados de
    // texto, encoding raro, etc.
    if (counts.workspaces > 0) {
      const src = this.ctx.mainDb
        .prepare(
          'SELECT id, name, position FROM workspaces ORDER BY position ASC LIMIT 1',
        )
        .get() as AnyRow;
      const dst = profileDb
        .prepare(
          'SELECT id, name, position FROM workspaces ORDER BY position ASC LIMIT 1',
        )
        .get() as AnyRow;
      if (src['id'] !== dst['id'] || src['name'] !== dst['name']) {
        throw new Error(
          `[migration] sample-check de workspaces no coincide (src=${JSON.stringify(
            src,
          )}, dst=${JSON.stringify(dst)})`,
        );
      }
    }
    if (counts.treeNodes > 0) {
      const srcRow = this.ctx.mainDb
        .prepare(
          'SELECT id, kind, url FROM tree_nodes ORDER BY id ASC LIMIT 1',
        )
        .get() as AnyRow;
      const srcId = srcRow['id'];
      if (typeof srcId !== 'string') {
        throw new Error(
          `[migration] sample-check: tree_nodes.id legacy no es string (${JSON.stringify(srcRow)})`,
        );
      }
      const dstRow = profileDb
        .prepare('SELECT id, kind, url FROM tree_nodes WHERE id = ?')
        .get(srcId) as AnyRow | undefined;
      if (
        !dstRow ||
        srcRow['kind'] !== dstRow['kind'] ||
        srcRow['url'] !== dstRow['url']
      ) {
        throw new Error(
          `[migration] sample-check de tree_nodes no coincide (src=${JSON.stringify(
            srcRow,
          )}, dst=${JSON.stringify(dstRow)})`,
        );
      }
    }
  }

  private dropLegacyTablesAndSettings(): void {
    transaction(this.ctx.mainDb, () => {
      // El orden importa por las FK: auto_group_rules → tree_nodes → workspaces.
      this.ctx.mainDb.exec(`
        DROP TABLE IF EXISTS auto_group_rules;
        DROP TABLE IF EXISTS tree_nodes;
        DROP TABLE IF EXISTS workspaces;
      `);

      // Borramos en app_metadata las claves que ya viven en settings_profile
      // del nuevo perfil; las globales (app_version, futuras shortcuts:*) se
      // quedan donde están.
      const profileScopeKeys = Object.entries(SETTINGS_DEFAULT_SCOPE)
        .filter(([, scope]) => scope === 'profile')
        .map(([key]) => key);
      if (profileScopeKeys.length > 0) {
        const placeholders = profileScopeKeys.map(() => '?').join(',');
        this.ctx.mainDb
          .prepare(`DELETE FROM app_metadata WHERE key IN (${placeholders})`)
          .run(...profileScopeKeys);
      }
    });
  }

  private copyBundleExtensions(profileId: string): void {
    const sourceDir = this.ctx.bundleExtensionsDir;
    if (!fs.existsSync(sourceDir)) {
      this.ctx.logger.info(
        `[migration] sin extensiones bundle en ${sourceDir} — paso omitido`,
      );
      return;
    }
    const targetDir = getProfileExtensionsDir(profileId);
    fs.mkdirSync(targetDir, { recursive: true });

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    let copied = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const srcExt = path.join(sourceDir, entry.name);
      if (!fs.existsSync(path.join(srcExt, 'manifest.json'))) {
        continue;
      }
      const dstExt = path.join(targetDir, entry.name);
      if (fs.existsSync(dstExt)) {
        // Edge case: ya hay algo con ese nombre. Lo dejamos como está (la
        // copia local no debería sobreescribir lo que el usuario pueda haber
        // tocado). En la práctica el dir empieza vacío.
        this.ctx.logger.warn(
          `[migration] extensión ${entry.name} ya existe en el perfil — no se sobreescribe`,
        );
        continue;
      }
      copyDirRecursive(srcExt, dstExt);
      copied++;
      this.ctx.logger.info(
        `[migration] extensión copiada: ${entry.name} → ${dstExt}`,
      );
    }
    this.ctx.logger.info(
      `[migration] extensiones bundle copiadas: ${copied}/${entries.filter((e) => e.isDirectory()).length}`,
    );
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}
