import { ProviderAuthError, ProviderRateLimitError, type ProviderCredential } from '../types';

/**
 * Los API tokens de Atlassian van en Basic auth con el email de la cuenta. El
 * OAuth de Atlassian no es una alternativa en una app de escritorio de código
 * abierto: exige client secret, no admite PKCE sin él y no tiene device grant.
 */
export function basicAuthHeaders(credential: ProviderCredential): Record<string, string> {
  if (!credential.email) {
    throw new ProviderAuthError('Falta el email de la cuenta de Atlassian.');
  }
  const encoded = Buffer.from(`${credential.email}:${credential.token}`, 'utf8').toString('base64');
  return { Authorization: `Basic ${encoded}`, 'User-Agent': 'Vela-Browser' };
}

/** Sitios de Jira Cloud: `<nombre>.atlassian.net` y los antiguos `<nombre>.jira.com`. */
const JIRA_HOST = /^[a-z0-9][a-z0-9-]{0,62}\.(?:atlassian\.net|jira\.com)$/;

/**
 * Normaliza lo que escriba el usuario (`acme`, `acme.atlassian.net`,
 * `https://acme.atlassian.net/jira/your-work`) a un host de Jira Cloud.
 *
 * El host acaba en peticiones desde main con la credencial del usuario, así que
 * no se acepta nada que no sea de Atlassian: ni otro dominio, ni puerto, ni
 * usuario en la URL, ni http en claro. Sin esto, el campo serviría para que
 * main enviase el token a donde se le indicara.
 */
export function normalizeJiraSite(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) throw invalidSite();

  let host: string;
  if (raw.includes('://')) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw invalidSite();
    }
    if (url.protocol !== 'https:' || url.port || url.username || url.password) {
      throw invalidSite();
    }
    host = url.hostname;
  } else {
    if (/[:@?#\s]/.test(raw)) throw invalidSite();
    const bare = raw.split('/')[0] ?? '';
    host = bare.includes('.') ? bare : `${bare}.atlassian.net`;
  }

  if (!JIRA_HOST.test(host)) throw invalidSite();
  return host;
}

function invalidSite(): ProviderAuthError {
  return new ProviderAuthError(
    'Indica tu sitio de Jira Cloud, por ejemplo «acme» o «acme.atlassian.net».',
    false,
  );
}

const CLOUD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Base de la pasarela de Atlassian para un sitio, a partir de su cloudId. */
export function jiraGatewayBase(cloudId: string): string {
  if (!CLOUD_ID.test(cloudId)) {
    throw new ProviderAuthError('Atlassian devolvió un identificador de sitio no válido.', false);
  }
  return `https://api.atlassian.com/ex/jira/${cloudId}`;
}

/** Atlassian responde 429 con `Retry-After` en segundos. */
export function rateLimitFrom(headers: Headers): ProviderRateLimitError {
  const seconds = Number.parseInt(headers.get('retry-after') ?? '', 10);
  return new ProviderRateLimitError(Number.isFinite(seconds) ? seconds * 1000 : 60_000);
}
