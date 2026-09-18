import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** El navegador de origen tiene el fichero bloqueado o no se pudo copiar. */
export class SourceDatabaseLockedError extends Error {
  constructor(readonly file: string, cause: unknown) {
    super(`No se pudo leer ${path.basename(file)}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'SourceDatabaseLockedError';
  }
}

/**
 * Abre una copia temporal de una base SQLite de otro navegador y la borra al
 * terminar. El navegador en marcha mantiene el original bloqueado (y Firefox
 * deja lo último en el `-wal`), así que se copian el fichero y su WAL a un
 * directorio propio antes de abrirlos: nunca se toca el original.
 */
export function withSqliteCopy<T>(file: string, fn: (db: DatabaseSync) => T): T {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-import-'));
  const copy = path.join(tmpDir, 'source.sqlite');
  try {
    try {
      fs.copyFileSync(file, copy);
      if (fs.existsSync(`${file}-wal`)) fs.copyFileSync(`${file}-wal`, `${copy}-wal`);
    } catch (err) {
      throw new SourceDatabaseLockedError(file, err);
    }
    const db = new DatabaseSync(copy);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
