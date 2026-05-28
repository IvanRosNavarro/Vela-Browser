import fs from 'node:fs';
import path from 'node:path';
import type { Session, Extension } from 'electron';
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
