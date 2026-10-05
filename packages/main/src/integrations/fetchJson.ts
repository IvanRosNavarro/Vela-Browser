import { net } from 'electron';

/** Tope por respuesta: la API de GitHub devuelve páginas pequeñas; un cuerpo
 *  mayor que esto significa que algo no es lo que esperamos. */
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export interface JsonResponse<T> {
  status: number;
  headers: Headers;
  body: T | null;
}

/**
 * GET/POST contra un host fijo de GitHub. No hay riesgo de SSRF (la URL nunca
 * viene del renderer), pero se mantienen las mismas cautelas que en el resto
 * de fetches de main: sin redirecciones, con tope de tamaño y comprobando el
 * `content-type` antes de parsear.
 */
export async function fetchJson<T>(
  url: string,
  init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await net.fetch(url, {
      method: init.method ?? 'GET',
      headers: { Accept: 'application/json', ...init.headers },
      body: init.body,
      redirect: 'error',
      signal: controller.signal,
    });

    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) return { status: res.status, headers: res.headers, body: null };

    const text = await res.text();
    if (text.length > MAX_BYTES) {
      throw new Error('Respuesta demasiado grande');
    }
    return { status: res.status, headers: res.headers, body: JSON.parse(text) as T };
  } finally {
    clearTimeout(timer);
  }
}
