import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSearchUrl, type SearchSettings } from '@vela/shared';

/**
 * Qué hacer con cada cosa que se suelta sobre la chrome de Vela desde fuera.
 *
 * Tres orígenes posibles en un mismo `drop`: enlaces (`text/uri-list`),
 * ficheros del explorador y texto suelto. Los ficheros que Chromium sabe pintar
 * se abren como `file://`; el resto se deja al sistema operativo, que es lo que
 * hace cualquier navegador con un `.docx`. El texto que no es una URL se busca
 * con el motor del perfil.
 */

export type DroppedItem =
  | { kind: 'url'; value: string }
  | { kind: 'file'; value: string }
  | { kind: 'text'; value: string };

export type DropAction =
  | { kind: 'tab'; url: string; label: string }
  | { kind: 'system'; filePath: string; label: string };

/**
 * Extensiones que Chromium muestra dentro de una pestaña. Lo que no esté aquí
 * acabaría en una descarga o en una página en blanco, así que va al sistema.
 */
const VIEWABLE_EXTENSIONS = new Set([
  // documentos y texto
  '.pdf', '.txt', '.md', '.log', '.csv', '.json', '.xml', '.yaml', '.yml',
  '.html', '.htm', '.xhtml', '.svg',
  // imágenes
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif',
  // audio y vídeo que Chromium reproduce
  '.mp4', '.webm', '.ogg', '.ogv', '.mp3', '.wav', '.m4a', '.flac', '.opus',
]);

/** Esquemas que se abren tal cual. `file:` incluido: viene de un enlace, no de un fichero. */
const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:', 'vela:', 'about:']);

export function isViewableFile(filePath: string): boolean {
  return VIEWABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * ¿Es esto una URL que podamos abrir? Deliberadamente estricto: `javascript:`,
 * `data:` y demás se quedan fuera — soltar algo no debe poder ejecutar código.
 */
export function parseDroppedUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return OPENABLE_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    // Sin esquema: solo se acepta algo con pinta clara de dominio, para no
    // convertir cualquier frase suelta en una navegación.
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed) && !trimmed.includes(' ')) {
      return `https://${trimmed}`;
    }
    return null;
  }
}

const corto = (v: string): string => (v.length > 60 ? `${v.slice(0, 57)}…` : v);

/**
 * Nombre de un fichero para los avisos. Dos cosas que parecen detalles:
 *
 * - No pasa por `new URL`: una ruta de Windows como `C:\tmp\x.docx` se parsea
 *   sin error como una URL de esquema `c:` y devuelve un pathname inservible.
 * - Corta por los dos separadores en vez de usar `path.basename`, que en Linux
 *   no reconoce `\` y devolvería la ruta entera. Importa para los tests, que
 *   corren en las tres plataformas.
 */
function labelForPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).filter(Boolean).pop();
  return corto(base ?? filePath);
}

/** Nombre corto de una URL: dominio y última parte, sin el esquema ni la query. */
function labelForUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'file:') {
      const base = decodeURIComponent(url.pathname).split('/').filter(Boolean).pop();
      return corto(base ?? value);
    }
    const ultimo = url.pathname.split('/').filter(Boolean).pop();
    return corto(ultimo ? `${url.hostname}/${ultimo}` : url.hostname);
  } catch {
    return corto(value);
  }
}

/**
 * Traduce lo soltado a acciones concretas. Las líneas vacías y los comentarios
 * de `text/uri-list` ya vienen filtrados por el renderer.
 */
export function planDrop(
  items: readonly DroppedItem[],
  search: SearchSettings,
): DropAction[] {
  const actions: DropAction[] = [];
  const vistos = new Set<string>();

  for (const item of items) {
    if (item.kind === 'file') {
      const filePath = item.value;
      if (isViewableFile(filePath)) {
        const url = pathToFileURL(filePath).toString();
        if (vistos.has(url)) continue;
        vistos.add(url);
        actions.push({ kind: 'tab', url, label: labelForPath(filePath) });
      } else {
        if (vistos.has(filePath)) continue;
        vistos.add(filePath);
        actions.push({ kind: 'system', filePath, label: labelForPath(filePath) });
      }
      continue;
    }

    if (item.kind === 'url') {
      const url = parseDroppedUrl(item.value);
      if (!url || vistos.has(url)) continue;
      vistos.add(url);
      actions.push({ kind: 'tab', url, label: labelForUrl(url) });
      continue;
    }

    // Texto: si parece una URL se navega, y si no se busca.
    const asUrl = parseDroppedUrl(item.value);
    const url = asUrl ?? buildSearchUrl(search, item.value.trim());
    if (!url || vistos.has(url)) continue;
    vistos.add(url);
    actions.push({ kind: 'tab', url, label: asUrl ? labelForUrl(url) : item.value.trim().slice(0, 40) });
  }

  return actions;
}
