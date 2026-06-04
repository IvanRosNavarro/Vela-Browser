export const SEARCH_ENGINE_IDS = [
  'duckduckgo',
  'google',
  'startpage',
  'kagi',
  'custom',
] as const;

export type SearchEngineId = (typeof SEARCH_ENGINE_IDS)[number];

export interface SearchEngineDefinition {
  id: SearchEngineId;
  label: string;
  urlTemplate: string;
}

// El registro incluye 'custom' como entrada placeholder (urlTemplate vacío)
// para que el indexado por `SearchEngineId` siempre tipechequee. La lógica
// de `buildSearchUrl` reemplaza el template vacío por el motor por defecto
// cuando el usuario no ha configurado un customUrl válido.
export const BUILTIN_SEARCH_ENGINES: Readonly<
  Record<SearchEngineId, SearchEngineDefinition>
> = {
  duckduckgo: {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    urlTemplate: 'https://duckduckgo.com/?q=%s',
  },
  google: {
    id: 'google',
    label: 'Google',
    urlTemplate: 'https://www.google.com/search?q=%s',
  },
  startpage: {
    id: 'startpage',
    label: 'Startpage',
    urlTemplate: 'https://www.startpage.com/do/search?q=%s',
  },
  kagi: {
    id: 'kagi',
    label: 'Kagi',
    urlTemplate: 'https://kagi.com/search?q=%s',
  },
  custom: {
    id: 'custom',
    label: 'Búsqueda personalizada',
    urlTemplate: '',
  },
};

export const SEARCH_ENGINE_DEFAULT: SearchEngineId = 'duckduckgo';

export interface SearchSettings {
  engine: SearchEngineId;
  customUrl: string | null;
}

export const SEARCH_SETTINGS_DEFAULTS: SearchSettings = {
  engine: SEARCH_ENGINE_DEFAULT,
  customUrl: null,
};

/**
 * Devuelve la URL del motor seleccionado, sustituyendo `%s` por la query
 * codificada. Si el id es `custom` y `customUrl` es null o no contiene `%s`,
 * cae al motor por defecto para no romper la búsqueda.
 */
export function buildSearchUrl(settings: SearchSettings, query: string): string {
  const encoded = encodeURIComponent(query);
  let template: string;
  if (settings.engine === 'custom') {
    template =
      settings.customUrl && settings.customUrl.includes('%s')
        ? settings.customUrl
        : BUILTIN_SEARCH_ENGINES[SEARCH_ENGINE_DEFAULT].urlTemplate;
  } else {
    template = (BUILTIN_SEARCH_ENGINES[settings.engine] ?? BUILTIN_SEARCH_ENGINES[SEARCH_ENGINE_DEFAULT]).urlTemplate;
  }
  return template.replace('%s', encoded);
}

export function searchEngineLabel(settings: SearchSettings): string {
  return BUILTIN_SEARCH_ENGINES[settings.engine]?.label ?? 'Google';
}

// --- Alias engines (! prefix) ---

export interface CustomEngineAlias {
  alias: string;
  name: string;
  url: string;
}

export const BUILTIN_ENGINE_ALIASES: readonly CustomEngineAlias[] = [
  { alias: '!ddg',  name: 'DuckDuckGo',        url: 'https://duckduckgo.com/?q=%s' },
  { alias: '!g',    name: 'Google',             url: 'https://www.google.com/search?q=%s' },
  { alias: '!gh',   name: 'GitHub',             url: 'https://github.com/search?q=%s' },
  { alias: '!mdn',  name: 'MDN Web Docs',       url: 'https://developer.mozilla.org/search?q=%s' },
  { alias: '!yt',   name: 'YouTube',            url: 'https://www.youtube.com/results?search_query=%s' },
  { alias: '!maps', name: 'Google Maps',        url: 'https://www.google.com/maps/search/%s' },
  { alias: '!w',    name: 'Wikipedia',          url: 'https://en.wikipedia.org/wiki/Special:Search?search=%s' },
];

export function resolveEngineAlias(
  alias: string,
  customEngines: CustomEngineAlias[],
): CustomEngineAlias | null {
  const lower = alias.toLowerCase();
  const custom = customEngines.find((e) => e.alias.toLowerCase() === lower);
  if (custom) return custom;
  return BUILTIN_ENGINE_ALIASES.find((e) => e.alias.toLowerCase() === lower) ?? null;
}

export function buildAliasSearchUrl(engine: CustomEngineAlias, query: string): string {
  return engine.url.replace('%s', encodeURIComponent(query));
}
