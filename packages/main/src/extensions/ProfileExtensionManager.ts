import fs from 'node:fs';
import path from 'node:path';
import type { Session } from 'electron';
import type { Logger } from '../logger';
import type { ProfileManager } from '../profiles/ProfileManager';
import {
  getProfileExtensionsDir,
} from '../profiles/paths';
import { ProfileNotOpenError } from '../profiles/ProfileManager';
import { extractCrx } from './crxExtractor';

export interface InstalledExtension {
  /** ID Chrome generado por Electron al cargar la extensión. */
  id: string;
  name: string;
  version: string;
  manifestVersion: number;
  /** Subdirectorio (relativo a profiles/{uuid}/extensions/) donde vive. */
  dir: string;
  /** Ruta absoluta — útil para callers que pasan a session.loadExtension. */
  path: string;
  /** Timestamp de instalación. */
  installedAt: number;
}

interface ExtensionManifest {
  name?: string;
  version?: string;
  manifest_version?: number;
}

export interface ProfileExtensionManagerCtx {
  profileManager: ProfileManager;
  logger: Logger;
}

const TMP_PREFIX = '_install_';

/**
 * Gestor de extensiones por perfil. Cada perfil tiene su propia carpeta
 * `profiles/{uuid}/extensions/{extId}/` con una subcarpeta por extensión
 * instalada (formato Chrome unpacked: manifest.json en la raíz).
 *
 * El catálogo lo levantamos siempre del filesystem en lugar de mantenerlo en
 * `settings_profile`: es la fuente de verdad y evita inconsistencias si una
 * carpeta se borra a mano. El estado en BD que sí guardamos es opcional —
 * por ahora preferimos fs-only por simplicidad.
 *
 * Las 4 extensiones bundle ("Bitwarden", "uBlock", etc., en `/extensions/`
 * del repo) se siguen cargando en `session.defaultSession` desde
 * `loadExtensions.ts`. Esa ruta queda como "extensiones globales del build";
 * lo que vive aquí son las que el usuario instale dinámicamente por perfil.
 */
export class ProfileExtensionManager {
  constructor(private readonly ctx: ProfileExtensionManagerCtx) {}

  /**
   * Lee la lista de extensiones instaladas desde el filesystem. No requiere
   * que el perfil esté abierto.
   */
  async getInstalledExtensions(
    profileId: string,
  ): Promise<InstalledExtension[]> {
    const root = getProfileExtensionsDir(profileId);
    if (!fs.existsSync(root)) return [];

    const out: InstalledExtension[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(TMP_PREFIX)) continue;
      const extPath = path.join(root, entry.name);
      const manifestPath = path.join(extPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = readManifest(manifestPath);
        const stat = fs.statSync(extPath);
        out.push({
          id: entry.name,
          dir: entry.name,
          path: extPath,
          name: manifest.name ?? entry.name,
          version: manifest.version ?? '0.0.0',
          manifestVersion: manifest.manifest_version ?? 0,
          installedAt: Math.floor(stat.birthtimeMs ?? stat.mtimeMs),
        });
      } catch (err) {
        this.ctx.logger.warn(
          `[profile-ext] manifest ilegible en ${extPath}, salto`,
          err,
        );
      }
    }
    return out;
  }

  /**
   * Instala una extensión a partir de un .crx (binario Chrome) o de un
   * directorio ya descomprimido. La detección es por extensión del path.
   *
   * Requiere que el perfil esté abierto: necesitamos su sesión Electron para
   * invocar `loadExtension` y obtener el ID Chrome canónico (nombre del
   * subdirectorio final).
   */
  async installFromCrx(
    profileId: string,
    crxPath: string,
  ): Promise<InstalledExtension> {
    const session = this.requireOpenSession(profileId);
    const root = getProfileExtensionsDir(profileId);
    fs.mkdirSync(root, { recursive: true });

    const tempDir = path.join(root, `${TMP_PREFIX}${randomSuffix()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const stat = fs.statSync(crxPath);
      if (stat.isDirectory()) {
        copyDirRecursive(crxPath, tempDir);
      } else {
        extractCrx(crxPath, tempDir);
      }
      if (!fs.existsSync(path.join(tempDir, 'manifest.json'))) {
        throw new Error(
          `[profile-ext] tras extraer ${crxPath} no hay manifest.json en raíz`,
        );
      }

      // Cargamos desde el temp para conocer el ID canónico que Electron
      // asigna a la extensión.
      const probe = await session.extensions.loadExtension(tempDir, {
        allowFileAccess: true,
      });
      const extensionId = probe.id;

      const finalDir = path.join(root, extensionId);
      // Si ya existía una versión instalada, la sustituimos: removemos de la
      // sesión y borramos la carpeta vieja antes de mover la nueva.
      if (fs.existsSync(finalDir)) {
        try {
          session.extensions.removeExtension(extensionId);
        } catch {
          // ya estaba removida o nunca cargada en esta sesión
        }
        fs.rmSync(finalDir, { recursive: true, force: true });
      } else {
        // El probe la dejó cargada apuntando a tempDir; al renombrar el path
        // dejaría de ser válido, así que la quitamos antes del rename.
        try {
          session.extensions.removeExtension(extensionId);
        } catch {
          // ya estaba removida
        }
      }
      fs.renameSync(tempDir, finalDir);

      const reloaded = await session.extensions.loadExtension(finalDir, {
        allowFileAccess: true,
      });
      const manifest = reloaded.manifest as ExtensionManifest;

      const installed: InstalledExtension = {
        id: reloaded.id,
        dir: extensionId,
        path: finalDir,
        name: reloaded.name,
        version: reloaded.version,
        manifestVersion: manifest.manifest_version ?? 0,
        installedAt: Date.now(),
      };
      this.ctx.logger.info(
        `[profile-ext] instalada ${installed.name} v${installed.version} (id=${installed.id}) en profile=${profileId}`,
      );
      return installed;
    } catch (err) {
      // Limpiamos el temp en cualquier fallo posterior a su creación.
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignorar — el temp quedará huérfano hasta el próximo barrido
      }
      throw err;
    }
  }

  /**
   * Quita una extensión de la sesión, borra su carpeta y ya no se cargará en
   * próximos `openProfile`.
   */
  async uninstall(profileId: string, extensionId: string): Promise<void> {
    const session = this.requireOpenSession(profileId);
    try {
      session.extensions.removeExtension(extensionId);
    } catch (err) {
      this.ctx.logger.warn(
        `[profile-ext] removeExtension(${extensionId}) lanzó (continúo)`,
        err,
      );
    }

    const dir = path.join(getProfileExtensionsDir(profileId), extensionId);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        this.ctx.logger.error(
          `[profile-ext] no se pudo borrar ${dir}`,
          err,
        );
        throw err;
      }
    }
    this.ctx.logger.info(
      `[profile-ext] desinstalada ${extensionId} de profile=${profileId}`,
    );
  }

  /**
   * Carga todas las extensiones instaladas del perfil en su sesión Electron.
   * Se llama desde `ProfileManager.openProfile`. Falla en silencio para
   * extensiones individuales: una rota no debe impedir abrir el perfil.
   * @param excludedIds IDs de extensiones deshabilitadas por el usuario — se omiten.
   */
  async loadExtensionsForProfile(
    profileId: string,
    session: Session,
    excludedIds: ReadonlySet<string> = new Set(),
  ): Promise<InstalledExtension[]> {
    const installed = await this.getInstalledExtensions(profileId);
    const loaded: InstalledExtension[] = [];
    for (const ext of installed) {
      if (excludedIds.has(ext.id)) {
        this.ctx.logger.info(
          `[profile-ext] omitida (deshabilitada) ${ext.name} (${ext.id}) en profile=${profileId}`,
        );
        continue;
      }
      try {
        const result = await session.extensions.loadExtension(ext.path, {
          allowFileAccess: true,
        });
        loaded.push({ ...ext, id: result.id });
      } catch (err) {
        this.ctx.logger.error(
          `[profile-ext] fallo cargando ${ext.name} (${ext.dir}) en profile=${profileId}`,
          err,
        );
      }
    }
    this.ctx.logger.info(
      `[profile-ext] cargadas ${loaded.length}/${installed.length} extensiones en profile=${profileId}`,
    );
    return loaded;
  }

  private requireOpenSession(profileId: string): Session {
    if (!this.ctx.profileManager.isOpen(profileId)) {
      throw new ProfileNotOpenError(profileId);
    }
    return this.ctx.profileManager.getSession(profileId);
  }
}

function readManifest(manifestPath: string): ExtensionManifest {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw) as ExtensionManifest;
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
    // Symlinks y demás se ignoran a propósito: Chrome unpacked extensions
    // no los usan y abren superficie de ataque innecesaria.
  }
}

function randomSuffix(): string {
  return globalThis.crypto.randomUUID();
}
