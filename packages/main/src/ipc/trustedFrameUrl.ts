function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Devuelve true si la URL es de una página interna vela://, del renderer
 * empaquetado (file://) o, solo en desarrollo, del dev server.
 *
 * El dev server se compara por origen exacto: un prefijo `http://localhost`
 * aceptaría también `http://localhost.evil.com` o cualquier otro puerto local.
 */
export function isTrustedFrameUrl(url: string, devServerOrigin: string | null): boolean {
  if (url.startsWith('vela://') || url.startsWith('file://')) return true;
  return devServerOrigin !== null && originOf(url) === devServerOrigin;
}

export { originOf };
