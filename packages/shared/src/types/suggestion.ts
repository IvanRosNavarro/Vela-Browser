export interface OpenTabSuggestion {
  type: 'open-tab';
  tabId: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  url: string;
  favicon: string | null;
}

export interface SearchSuggestion {
  type: 'search';
  query: string;
  engine: string;
}

export interface NavigateSuggestion {
  type: 'navigate';
  url: string;
}

export interface HistorySuggestion {
  type: 'history';
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
}

export type Suggestion =
  | OpenTabSuggestion
  | SearchSuggestion
  | NavigateSuggestion
  | HistorySuggestion;

export interface CommandSuggestion {
  type: 'command';
  id: string;
  title: string;
  shortcut?: string;
}

export type ExtendedSuggestion = Suggestion | CommandSuggestion;
