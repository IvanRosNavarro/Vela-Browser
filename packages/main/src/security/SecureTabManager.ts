import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { session } from 'electron';
import type { Logger } from '../logger';

const SECURE_DIR_PREFIX = 'vela-secure-';

export class SecureTabManager {
  private readonly secureDirs = new Map<string, string>();

  constructor(private readonly logger: Logger) {}

  /**
   * Crea el directorio temporal (marcador de crash) y la sesión Electron
   * en memoria para la tab blindada. Devuelve la sesión creada.
   * La sesión usa una partición sin prefijo `persist:`, por lo que es
   * completamente en memoria y no escribe nada a disco.
   */
  async setupTab(tabId: string): Promise<Electron.Session> {
    const secureDir = path.join(os.tmpdir(), `${SECURE_DIR_PREFIX}${tabId}`);
    await fs.mkdir(secureDir, { recursive: true });
    this.secureDirs.set(tabId, secureDir);

    const secureSession = session.fromPartition(`secure-${tabId}`, {
      cache: false,
    });
    return secureSession;
  }

  /**
   * Limpia la sesión y elimina el directorio temporal de la tab blindada.
   */
  async closeTab(tabId: string): Promise<void> {
    const secureDir = this.secureDirs.get(tabId);
    if (!secureDir) return;

    try {
      const secureSession = session.fromPartition(`secure-${tabId}`);
      await secureSession.clearStorageData();
    } catch (err) {
      this.logger.warn(`[secure] clearStorageData falló (tab=${tabId})`, err);
    }

    try {
      await fs.rm(secureDir, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(`[secure] rm dir falló (${secureDir})`, err);
    }

    this.secureDirs.delete(tabId);
    this.logger.info(`[secure] tab ${tabId}: directorio eliminado.`);
  }

  /**
   * Escanea el directorio temporal del SO y elimina directorios residuales
   * de sesiones anteriores que no se cerraron limpiamente (p.ej. kill -9).
   */
  async cleanupResidualDirs(): Promise<void> {
    const tmpDir = os.tmpdir();
    let entries: string[];
    try {
      entries = await fs.readdir(tmpDir);
    } catch {
      return;
    }
    const residual = entries.filter((e) => e.startsWith(SECURE_DIR_PREFIX));
    for (const dir of residual) {
      const fullPath = path.join(tmpDir, dir);
      try {
        await fs.rm(fullPath, { recursive: true, force: true });
        this.logger.info(`[secure] limpiado directorio residual: ${fullPath}`);
      } catch (err) {
        this.logger.warn(`[secure] no se pudo limpiar ${fullPath}`, err);
      }
    }
  }

  /** Extrae el tabId del nombre de un directorio residual, o null si no aplica. */
  static tabIdFromDirName(dirName: string): string | null {
    if (!dirName.startsWith(SECURE_DIR_PREFIX)) return null;
    return dirName.slice(SECURE_DIR_PREFIX.length) || null;
  }
}
