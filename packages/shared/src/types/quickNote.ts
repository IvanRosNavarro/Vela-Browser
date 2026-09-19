export interface QuickNote {
  workspaceId: string;
  content: string;
  updatedAt: number;
}

export interface HistorySearchEntry {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
  workspaceId: string;
  sessionId: string;
}

export interface HistorySession {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  entryCount: number;
  workspaceIds: string[];
}

export interface DomainStat {
  domain: string;
  visitCount: number;
  lastVisitedAt: number;
  favicon: string | null;
}

/**
 * Compleción inline de la barra de direcciones (`history:autocomplete`).
 * `text` es la forma visible, que empieza por lo escrito sin distinguir
 * mayúsculas: el renderer muestra lo escrito seguido de
 * `text.slice(escrito.length)` seleccionado. `url` es el destino real al
 * pulsar Enter (conserva el esquema y el `www.` que `text` puede omitir).
 */
export interface HistoryAutocompleteMatch {
  text: string;
  url: string;
}
