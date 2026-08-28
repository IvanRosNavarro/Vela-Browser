import fs from 'node:fs';
import path from 'node:path';
import type { Session, Extension } from 'electron';
import crypto from 'node:crypto';
import { logger } from '../logger';

export interface ExtensionLoadOk {
  status: 'ok';
  id: string;
  name: string;
  version: string;
  manifestVersion: number;
  path: string;
}

export interface ExtensionLoadFail {
  status: 'fail';
  path: string;
  error: string;
}

export type ExtensionLoadResult = ExtensionLoadOk | ExtensionLoadFail;

export const EXTENSIONS_DIR = path.join(__dirname, '..', '..', '..', 'extensions');

// Extensiones retiradas del bundle — cada usuario las instala desde vela://extensions:
// - cookie-editor: reemplazado por Cookie Manager nativo.
// - analytics-debugger: reemplazado por el debugger integrado.
// - bitwarden: no carga correctamente en producción; instalar manualmente via CRX.
const BUNDLED_SKIP = new Set(['cookie-editor', 'analytics-debugger', 'bitwarden']);

export async function loadExtensions(
  targetSession: Session,
  removedByUser?: Set<string>,
): Promise<ExtensionLoadResult[]> {
  if (!fs.existsSync(EXTENSIONS_DIR)) {
    logger.warn(`[ext] Directorio no encontrado: ${EXTENSIONS_DIR}`);
    return [];
  }

  const entries = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true });
  const results: ExtensionLoadResult[] = [];

  // Las extensiones del perfil (`profiles/{uuid}/extensions/`) se cargan antes
  // que estas, y la migración inicial copió ahí las bundle. Cargar las dos
  // copias da a Electron DOS extensiones con IDs distintos: dos service
  // workers, dos juegos de content scripts y dos backgrounds compitiendo por
  // los mismos mensajes. Para las que llevan estado (Bitwarden) eso rompe el
  // autofill de forma intermitente. Nos quedamos con la del perfil.
  const yaCargadas = new Set(
    targetSession.extensions
      .getAllExtensions()
      .map((e) => manifestFingerprint(path.join(e.path, 'manifest.json')))
      .filter((k): k is string => k !== null),
  );

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (BUNDLED_SKIP.has(entry.name)) {
      logger.info(`[ext] SKIP ${entry.name} (retirado como bundle)`);
      continue;
    }
    if (removedByUser?.has(entry.name)) {
      logger.info(`[ext] SKIP ${entry.name} (eliminada por usuario)`);
      continue;
    }
    const extPath = path.join(EXTENSIONS_DIR, entry.name);
    const manifestPath = path.join(extPath, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      logger.warn(`[ext] ${entry.name}: sin manifest.json en raíz, salto`);
      continue;
    }

    try {
      const key = manifestFingerprint(manifestPath);
      if (key && yaCargadas.has(key)) {
        logger.info(`[ext] SKIP ${entry.name} (ya cargada desde el perfil)`);
        continue;
      }
      const ext: Extension = await targetSession.extensions.loadExtension(extPath, {
        allowFileAccess: true,
      });
      const manifest = ext.manifest as { manifest_version?: number };
      const result: ExtensionLoadOk = {
        status: 'ok',
        id: ext.id,
        name: ext.name,
        version: ext.version,
        manifestVersion: manifest.manifest_version ?? 0,
        path: extPath,
      };
      results.push(result);
      logger.info(
        `[ext] OK   ${result.name} v${result.version} (mv${result.manifestVersion}, id=${result.id})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ status: 'fail', path: extPath, error: message });
      logger.error(`[ext] FAIL ${entry.name}: ${message}`);
    }
  }

  const okCount = results.filter((r) => r.status === 'ok').length;
  const failCount = results.length - okCount;
  logger.info(`[ext] Total: ${okCount} cargadas, ${failCount} fallidas`);

  return results;
}

/**
 * Identidad de una extensión independiente de dónde viva en disco: el hash de
 * su `manifest.json`. No sirve el ID de Chrome (en extensiones desempaquetadas
 * se deriva de la ruta, así que dos copias tienen dos IDs) ni el nombre, que
 * Electron y nosotros podríamos resolver con locales distintos si es un
 * `__MSG_*__`. Dos copias de la misma extensión tienen el mismo manifest.
 */
function manifestFingerprint(manifestPath: string): string | null {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  } catch {
    return null;
  }
}
