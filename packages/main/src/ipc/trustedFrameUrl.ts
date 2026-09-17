import { createFrameGuard } from 'vela-kit/ipc';

/** Prefijos de URL de los frames de confianza: páginas internas y renderer empaquetado. */
export const TRUSTED_FRAME_PREFIXES: readonly string[] = ['vela://', 'file://'];

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const silentLogger = { warn: () => {} };

/**
 * Devuelve true si la URL es de una página interna vela://, del renderer
 * empaquetado (file://) o, solo en desarrollo, del dev server.
 *
 * El dev server se compara por origen exacto: un prefijo `http://localhost`
 * aceptaría también `http://localhost.evil.com` o cualquier otro puerto local.
 * Usa el mismo guard de vela-kit que `ipc/validate.ts`, con la misma
 * configuración, para que el test cubra la decisión real.
 */
export function isTrustedFrameUrl(url: string, devServerOrigin: string | null): boolean {
  return createFrameGuard({
    trustedPrefixes: TRUSTED_FRAME_PREFIXES,
    devServerOrigin,
    logger: silentLogger,
  }).isTrustedFrame({ senderFrame: { url } });
}
