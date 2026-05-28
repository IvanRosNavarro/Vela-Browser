export type UrlScheme = 'https' | 'http' | 'file' | 'vela' | 'other' | null;

export interface ParsedScheme {
  scheme: UrlScheme;
  isSecure: boolean;
}

export interface FormattedUrl {
  domain: string;
  rest: string;
  raw: string;
}

export interface ResolvedQuery {
  type: 'url' | 'search';
  value: string;
}

// Lista corta y deliberada de TLDs habituales. Si una URL no está aquí (ni
// es localhost ni host:port) caemos a búsqueda. La alternativa "validar con
// HEAD remoto" es overkill para esta heurística inline. Cuando exista panel
// de settings (Fase 4) podríamos exponer una lista editable.
const COMMON_TLDS: ReadonlySet<string> = new Set([
  'com', 'org', 'net', 'io', 'dev', 'app', 'es', 'co', 'uk', 'de', 'fr',
  'it', 'eu', 'ai', 'tv', 'me', 'cloud', 'xyz', 'info', 'biz', 'tech',
  'blog', 'gov', 'edu', 'mil', 'int', 'pt', 'br', 'mx', 'ar', 'cl', 'ru',
  'jp', 'cn', 'kr', 'in', 'au', 'nz', 'ca', 'ch', 'at', 'be', 'nl', 'se',
  'no', 'fi', 'dk', 'pl', 'cz', 'gr', 'tr', 'sg', 'hk', 'tw', 'za', 'ie',
]);

const HOST_PORT_REGEX = /^[a-zA-Z0-9.-]+:[0-9]+(\/.*)?$/;
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function parseScheme(url: string): ParsedScheme {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { scheme: null, isSecure: false };
  }
  switch (parsed.protocol) {
    case 'https:':
      return { scheme: 'https', isSecure: true };
    case 'http:':
      return { scheme: 'http', isSecure: false };
    case 'file:':
      return { scheme: 'file', isSecure: false };
    case 'vela:':
      return { scheme: 'vela', isSecure: true };
    default:
      return { scheme: 'other', isSecure: false };
  }
}

/**
 * Decide si la entrada del usuario es una URL navegable o una búsqueda.
 * Reglas en orden:
 * 1) URL absoluta válida (scheme:).
 * 2) "vela://".
 * 3) host:puerto (con o sin path).
 * 4) host con TLD común y sin espacios → https://...
 * 5) localhost.
 * 6) cualquier otra cosa → búsqueda.
 */
export function resolveQueryToUrl(input: string): ResolvedQuery {
  const q = input.trim();
  if (q.length === 0) return { type: 'search', value: '' };

  if (q.startsWith('vela://')) {
    return { type: 'url', value: q };
  }
  if (SCHEME_REGEX.test(q)) {
    try {
      new URL(q);
      return { type: 'url', value: q };
    } catch {
      // No URL válida: continúa con las heurísticas.
    }
  }
  if (HOST_PORT_REGEX.test(q)) {
    return { type: 'url', value: `http://${q}` };
  }
  if (!q.includes(' ') && q.includes('.')) {
    const host = (q.split('/')[0] ?? '').split('?')[0] ?? '';
    if (host === 'localhost') {
      return { type: 'url', value: `http://${q}` };
    }
    const parts = host.split('.');
    const tld = parts[parts.length - 1]?.toLowerCase();
    if (tld && COMMON_TLDS.has(tld)) {
      return { type: 'url', value: `https://${q}` };
    }
  }
  return { type: 'search', value: q };
}

/**
 * Devuelve {domain, rest, raw} para pintar la URL en modo display: dominio
 * destacado, resto atenuado, y la URL completa cruda como tooltip o para
 * acessibilidad. Esquemas locales/file/vela conservan formato completo.
 */
export function formatUrlForDisplay(url: string): FormattedUrl {
  if (url.length === 0) return { domain: '', rest: '', raw: '' };
  // about:blank, about:newtab, etc. — pestaña en blanco. Sin contenido visible
  // en la barra: que el placeholder ("Buscar o escribir una dirección") tome
  // el sitio.
  if (url === 'about:blank' || url.startsWith('about:')) {
    return { domain: '', rest: '', raw: url };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { domain: '', rest: url, raw: url };
  }
  if (parsed.protocol === 'file:') {
    return { domain: '', rest: url, raw: url };
  }
  if (parsed.protocol === 'vela:') {
    return { domain: url, rest: '', raw: url };
  }
  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname.endsWith('.localhost');
  const portSuffix = parsed.port ? `:${parsed.port}` : '';
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  if (isLocal) {
    return {
      domain: `${parsed.hostname}${portSuffix}`,
      rest: path,
      raw: url,
    };
  }
  return { domain: parsed.hostname, rest: path, raw: url };
}
