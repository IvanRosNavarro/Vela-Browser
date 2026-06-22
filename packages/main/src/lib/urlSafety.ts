/**
 * Validación de URLs para fetches realizados desde el proceso main.
 *
 * El main puede hacer peticiones de red sin las restricciones de CORS/CSP del
 * renderer, por lo que cualquier handler IPC que acepte una URL del renderer y
 * la pase a `net.fetch` es un vector de SSRF: contenido web (o un renderer
 * comprometido) podría sondear `http://localhost`, la metadata de la nube
 * (`169.254.169.254`) o servicios de la intranet. Esta función rechaza esquemas
 * no-HTTP(S) y hosts loopback / privados / link-local.
 */

const BLOCKED_HOSTNAMES = new Set<string>([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

function isBlockedIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 127) return true; // "this host" / loopback
  if (a === 10) return true; // privado
  if (a === 169 && b === 254) return true; // link-local + metadata cloud
  if (a === 172 && b >= 16 && b <= 31) return true; // privado
  if (a === 192 && b === 168) return true; // privado
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const h = host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // ULA (privado)
  if (h.startsWith('fe80')) return true; // link-local
  return false;
}

/**
 * Devuelve true solo si `raw` es una URL http(s) pública segura para que el
 * main la solicite. Rechaza file:/vela:/data:/etc, loopback, rangos privados,
 * link-local y la IP de metadata de la nube.
 */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (host === '') return false;
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (isBlockedIpv4(host)) return false;
  if (host.includes(':') && isBlockedIpv6(host)) return false;
  return true;
}
