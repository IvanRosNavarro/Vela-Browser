import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import {
  IPC_EVENTS,
  SEARCH_ENGINE_IDS,
  SEARCH_SETTINGS_DEFAULTS,
  buildSearchUrl,
  buildAliasSearchUrl,
  resolveEngineAlias,
  searchEngineLabel,
  type CustomEngineAlias,
  type SearchEngineId,
  type SearchSettings,
  type ShortcutCommandInfo,
  type Suggestion,
} from '@vela/shared';
import { call } from '../../lib/ipc';
import { useAddressBarStore } from '../../stores/addressBarStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { selectNodeById, useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { useTabSwitcherStore } from '../../stores/tabSwitcherStore';
import {
  formatUrlForDisplay,
  parseScheme,
  resolveQueryToUrl,
  type FormattedUrl,
  type ParsedScheme,
} from './url';
import {
  INLINE_AUTOCOMPLETE_SETTING,
  inlineDisplayValue,
  useInlineAutocomplete,
  type InlineCompletion,
} from './useInlineAutocomplete';

export type AddressBarMode = 'url' | 'search' | 'command' | 'history' | 'tabs' | 'engine';

export interface ModeInfo {
  mode: AddressBarMode;
  query: string;
  engineAlias?: string;
  engineName?: string;
  engineObj?: CustomEngineAlias;
}

export interface CommandSuggestion {
  type: 'command';
  id: string;
  title: string;
  shortcut?: string;
}

export type ExtendedSuggestion = Suggestion | CommandSuggestion;

export interface HoverUrlState {
  url: string | null;
  isExternal: boolean;
}

export interface AddressBarController {
  displayUrl: FormattedUrl;
  security: ParsedScheme;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  activeTabId: string | null;
  editing: boolean;
  /** Valor que pinta el input: lo escrito más la compleción inline, si la hay. */
  inputValue: string;
  enterEditing: () => void;
  cancelEditing: () => void;
  /**
   * `allowComplete` (de `canInlineComplete`) indica si el cambio puede
   * disparar la compleción inline: solo al teclear con el cursor al final.
   */
  setInputValue: (value: string, allowComplete?: boolean) => void;
  inlineCompletion: InlineCompletion | null;
  /** Teclas de la compleción inline; true si la tecla la aceptó. */
  handleInlineCompletionKey: (e: KeyboardEvent<HTMLInputElement>) => boolean;
  /** Escape: quita el texto completado. True si había algo que quitar. */
  dismissInlineCompletion: () => boolean;
  inputCompositionHandlers: {
    onCompositionStart: () => void;
    onCompositionEnd: () => void;
  };
  suggestions: ExtendedSuggestion[];
  selectedSuggestionIndex: number;
  moveSuggestionCursor: (delta: 1 | -1) => void;
  setSelectedSuggestionIndex: (index: number) => void;
  submit: (opts: { newTab?: boolean; suggestion?: ExtendedSuggestion }) => Promise<void>;
  navigate: {
    back: () => void;
    forward: () => void;
    reload: () => void;
    stop: () => void;
  };
  focusRequestId: number;
  modeInfo: ModeInfo;
  clearPrefix: () => void;
  hoverUrl: HoverUrlState;
}

const DEBOUNCE_MS = 80;
const SUGGEST_LIMIT = 8;
const MODE_PREFIXES: Record<string, AddressBarMode> = {
  '>': 'command',
  '#': 'history',
  '@': 'tabs',
};

function coerceEngine(raw: unknown): SearchEngineId {
  if (typeof raw !== 'string') return SEARCH_SETTINGS_DEFAULTS.engine;
  return (SEARCH_ENGINE_IDS as readonly string[]).includes(raw)
    ? (raw as SearchEngineId)
    : SEARCH_SETTINGS_DEFAULTS.engine;
}

function detectMode(
  input: string,
  customEngines: CustomEngineAlias[],
): ModeInfo {
  if (input.length === 0) return { mode: 'search', query: '' };

  const prefix = input[0] ?? '';

  if (prefix === '>' || prefix === '#' || prefix === '@') {
    const mode = MODE_PREFIXES[prefix] ?? 'search';
    return { mode, query: input.slice(1) };
  }

  if (prefix === '!') {
    const parts = input.slice(1).split(' ');
    const alias = `!${parts[0] ?? ''}`;
    const query = parts.slice(1).join(' ');
    if (alias === '!') {
      return { mode: 'engine', query: '', engineAlias: '!' };
    }
    const engine = resolveEngineAlias(alias, customEngines);
    return {
      mode: 'engine',
      query,
      engineAlias: alias,
      engineName: engine?.name ?? alias,
      engineObj: engine ?? undefined,
    };
  }

  return { mode: 'search', query: input };
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  return t.includes(q);
}

export function useAddressBar(
  inputRef: RefObject<HTMLInputElement | null>,
): AddressBarController {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null
      ? (s.activeTabIdByWindow[currentWindowId] ?? null)
      : null,
  );
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

  const activeTabUrl = useTreeStore((s) => {
    if (!activeTabId) return '';
    if (activeWorkspaceId) {
      const node = selectNodeById(s, activeWorkspaceId, activeTabId);
      if (node && node.kind === 'tab') return node.url;
    }
    // El tab activo puede ser un ancla de otro workspace (las anclas se activan
    // sin cambiar el workspace activo). Buscamos en anchoredTabs como fallback.
    const anchor = s.anchoredTabs.find((t) => t.id === activeTabId);
    return anchor ? anchor.url : '';
  });

  const focusRequestId = useAddressBarStore((s) => s.focusRequestId);
  const prefixOnFocus = useAddressBarStore((s) => s.prefixOnFocus);

  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValueState] = useState('');
  const [suggestions, setSuggestions] = useState<ExtendedSuggestion[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [navState, setNavState] = useState({
    canGoBack: false,
    canGoForward: false,
    loading: false,
  });
  const [searchSettings, setSearchSettings] = useState<SearchSettings>(
    SEARCH_SETTINGS_DEFAULTS,
  );
  const [customEngines, setCustomEngines] = useState<CustomEngineAlias[]>([]);
  const [allCommands, setAllCommands] = useState<ShortcutCommandInfo[]>([]);
  const [hoverUrl, setHoverUrl] = useState<HoverUrlState>({ url: null, isExternal: false });
  const [inlineEnabled, setInlineEnabled] = useState(true);
  const inline = useInlineAutocomplete(inputRef, inlineEnabled);
  const {
    onTyped: onInlineTyped,
    acceptOnKey: acceptInlineOnKey,
    dismiss: dismissInline,
    reset: resetInline,
  } = inline;

  const activeTabRef = useRef<string | null>(null);
  activeTabRef.current = activeTabId;
  const editingRef = useRef(false);
  editingRef.current = editing;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const customEnginesRef = useRef<CustomEngineAlias[]>([]);
  customEnginesRef.current = customEngines;

  // Load search settings + custom engines + commands once at mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [allSettings, enginesRes, cmdsRes] = await Promise.all([
          call(() => window.api.settings.getAll()),
          call(() => window.api.searchEngines.getCustomEngines()),
          call(() => window.api.shortcuts.getAll()),
        ]);
        if (cancelled) return;
        const customRaw = allSettings['search:customUrl'];
        setSearchSettings({
          engine: coerceEngine(allSettings['search:engine']),
          customUrl: typeof customRaw === 'string' ? customRaw : null,
        });
        if (enginesRes) setCustomEngines(enginesRes);
        if (cmdsRes) setAllCommands(cmdsRes);
      } catch {
        // keep defaults
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // El ajuste de compleción inline se relee al empezar cada edición, así un
  // cambio en vela://settings surte efecto sin recargar la shell.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    void call(() => window.api.settings.get({ key: INLINE_AUTOCOMPLETE_SETTING }))
      .then((res) => {
        if (!cancelled) setInlineEnabled(res.value !== false);
      })
      .catch(() => { /* mantener activo */ });
    return () => { cancelled = true; };
  }, [editing]);

  // Hydrate nav state when active tab changes
  useEffect(() => {
    if (!activeTabId) {
      setNavState({ canGoBack: false, canGoForward: false, loading: false });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const runtime = await call(() =>
          window.api.runtime.getTabNavState({ tabId: activeTabId }),
        );
        if (cancelled || !runtime) return;
        setNavState({
          canGoBack: runtime.canGoBack,
          canGoForward: runtime.canGoForward,
          loading: runtime.loading,
        });
      } catch {
        // default state
      }
    })();
    return () => { cancelled = true; };
  }, [activeTabId]);

  useEffect(() => {
    const offNav = window.api.on(IPC_EVENTS.TAB_NAVIGATED, (payload) => {
      if (payload.tabId !== activeTabRef.current) return;
      setNavState((prev) => ({
        ...prev,
        canGoBack: payload.canGoBack,
        canGoForward: payload.canGoForward,
      }));
    });
    const offLoading = window.api.on(IPC_EVENTS.TAB_LOADING_CHANGED, (payload) => {
      if (payload.tabId !== activeTabRef.current) return;
      setNavState((prev) => ({ ...prev, loading: payload.loading }));
    });
    const offHover = window.api.on(IPC_EVENTS.HOVER_URL_CHANGED, (payload) => {
      if (payload.tabId !== activeTabRef.current) return;
      if (editingRef.current) return;
      setHoverUrl({ url: payload.url, isExternal: payload.isExternal });
    });
    return () => { offNav(); offLoading(); offHover(); };
  }, []);

  // Reset editing and hover state when active tab changes
  const lastSeenTabRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSeenTabRef.current !== activeTabId) {
      lastSeenTabRef.current = activeTabId;
      setEditing(false);
      setInputValueState('');
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
      setHoverUrl({ url: null, isExternal: false });
    }
  }, [activeTabId]);

  // Clear hover URL when editing starts
  useEffect(() => {
    if (editing) setHoverUrl({ url: null, isExternal: false });
  }, [editing]);

  // Al salir de edición (Escape, navegar, cambio de pestaña) no queda compleción.
  useEffect(() => {
    if (!editing) resetInline();
  }, [editing, resetInline]);

  const displayUrl = useMemo(() => formatUrlForDisplay(activeTabUrl), [activeTabUrl]);
  const security = useMemo(() => parseScheme(activeTabUrl), [activeTabUrl]);

  const modeInfo = useMemo(
    () => detectMode(inputValue, customEngines),
    [inputValue, customEngines],
  );

  const enterEditing = useCallback(() => {
    setEditing(true);
    setInputValueState(activeTabUrl);
    setSelectedSuggestionIndex(-1);
    resetInline();
  }, [activeTabUrl, resetInline]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setInputValueState('');
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const clearPrefix = useCallback(() => {
    setInputValueState('');
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
  }, []);

  const buildCommandSuggestions = useCallback(
    (query: string): CommandSuggestion[] => {
      const q = query.trim();
      return allCommands
        .filter((c) => fuzzyMatch(q, c.title) || fuzzyMatch(q, c.id))
        .slice(0, SUGGEST_LIMIT)
        .map((c) => ({
          type: 'command' as const,
          id: c.id,
          title: c.title,
          shortcut: c.customShortcut ?? c.defaultShortcut,
        }));
    },
    [allCommands],
  );

  const fetchSuggestions = useCallback(
    async (value: string): Promise<void> => {
      const seq = ++requestSeqRef.current;
      try {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          setSuggestions([]);
          return;
        }
        const mode = detectMode(trimmed, customEnginesRef.current);

        if (mode.mode === 'command') {
          const cmds = buildCommandSuggestions(mode.query);
          if (seq !== requestSeqRef.current) return;
          setSuggestions(cmds);
          return;
        }

        if (mode.mode === 'history') {
          const histQuery = mode.query.trim();
          if (!histQuery) {
            if (seq !== requestSeqRef.current) return;
            setSuggestions([]);
            return;
          }
          const histRes = await call(() =>
            window.api.history.search({ query: histQuery, limit: SUGGEST_LIMIT }),
          );
          if (seq !== requestSeqRef.current) return;
          setSuggestions(
            histRes.map((e) => ({
              type: 'history' as const,
              id: e.id,
              url: e.url,
              title: e.title,
              favicon: e.favicon,
              visitedAt: e.visitedAt,
            })),
          );
          return;
        }

        if (mode.mode === 'tabs') {
          const openTabs = await call(() =>
            window.api.suggest.query({ query: mode.query.trim() || trimmed.slice(1), limit: SUGGEST_LIMIT }),
          );
          if (seq !== requestSeqRef.current) return;
          setSuggestions(openTabs.filter((s) => s.type === 'open-tab'));
          return;
        }

        if (mode.mode === 'engine') {
          if (seq !== requestSeqRef.current) return;
          if (mode.engineObj && mode.query.trim()) {
            setSuggestions([
              {
                type: 'search',
                query: mode.query.trim(),
                engine: mode.engineName ?? mode.engineAlias ?? '',
              },
            ]);
          } else {
            setSuggestions([]);
          }
          return;
        }

        // Normal url/search mode
        const resolved = resolveQueryToUrl(trimmed);
        const tailSuggestion: Suggestion =
          resolved.type === 'url'
            ? { type: 'navigate', url: resolved.value }
            : {
                type: 'search',
                query: resolved.value,
                engine: searchEngineLabel(searchSettings),
              };

        const [openTabs, histEntries] = await Promise.all([
          call(() => window.api.suggest.query({ query: trimmed, limit: 3 })),
          call(() => window.api.history.search({ query: trimmed, limit: 5 })),
        ]);
        if (seq !== requestSeqRef.current) return;

        const tabs = openTabs.filter((s) => s.type === 'open-tab');
        const histSuggestions: Suggestion[] = histEntries.map((e) => ({
          type: 'history' as const,
          id: e.id,
          url: e.url,
          title: e.title,
          favicon: e.favicon,
          visitedAt: e.visitedAt,
        }));
        setSuggestions([tailSuggestion, ...tabs, ...histSuggestions]);
      } catch {
        if (seq === requestSeqRef.current) setSuggestions([]);
      }
    },
    [searchSettings, buildCommandSuggestions],
  );

  const setInputValue = useCallback(
    (value: string, allowComplete = false) => {
      onInlineTyped(value, allowComplete);
      // @ mode → show chip 150ms then open Tab Switcher
      if (value === '@') {
        setInputValueState('@');
        setSelectedSuggestionIndex(-1);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setTimeout(() => {
          setEditing(false);
          setInputValueState('');
          setSuggestions([]);
          void useTabSwitcherStore.getState().open();
        }, 150);
        return;
      }
      setInputValueState(value);
      setSelectedSuggestionIndex(-1);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim().length === 0) {
        setSuggestions([]);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void fetchSuggestions(value);
      }, DEBOUNCE_MS);
    },
    [fetchSuggestions, onInlineTyped],
  );

  // Compleción vigente solo si corresponde a lo escrito y al modo normal.
  const activeCompletion =
    inline.completion &&
    inline.completion.typed === inputValue &&
    modeInfo.mode === 'search'
      ? inline.completion
      : null;

  // La compleción encabeza la lista y queda resaltada por defecto, para que
  // lo que se ve en el input y lo que hace Enter coincidan.
  const visibleSuggestions = useMemo((): ExtendedSuggestion[] => {
    if (!activeCompletion) return suggestions;
    const url = activeCompletion.url;
    const rest = suggestions.filter(
      (s) => !((s.type === 'navigate' || s.type === 'history') && s.url === url),
    );
    return [{ type: 'navigate', url }, ...rest];
  }, [activeCompletion, suggestions]);

  const effectiveSelectedIndex =
    selectedSuggestionIndex === -1 && activeCompletion ? 0 : selectedSuggestionIndex;

  const moveSuggestionCursor = useCallback(
    (delta: 1 | -1) => {
      const count = visibleSuggestions.length;
      if (count === 0) {
        setSelectedSuggestionIndex(-1);
        return;
      }
      const prev = effectiveSelectedIndex;
      if (prev === -1) {
        setSelectedSuggestionIndex(delta === 1 ? 0 : count - 1);
        return;
      }
      const next = prev + delta;
      setSelectedSuggestionIndex(next < 0 ? count - 1 : next >= count ? 0 : next);
    },
    [visibleSuggestions.length, effectiveSelectedIndex],
  );

  const handleInlineCompletionKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): boolean => {
      const accepted = acceptInlineOnKey(e);
      if (accepted === null) return false;
      // Aceptar convierte el texto completado en texto escrito; la compleción
      // se conserva (sin resto) para que Enter siga yendo a su URL.
      setInputValueState(accepted);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchSuggestions(accepted);
      }, DEBOUNCE_MS);
      return true;
    },
    [acceptInlineOnKey, fetchSuggestions],
  );

  const performNavigate = useCallback(
    async (url: string, newTab: boolean): Promise<void> => {
      if (newTab) {
        await call(() => window.api.window.openUrlInNewTab({ url, activate: true }));
        return;
      }
      const tabId = activeTabRef.current;
      if (tabId) {
        await call(() => window.api.nav.goto({ id: tabId, url }));
        return;
      }
      await call(() => window.api.window.openUrlInNewTab({ url, activate: true }));
    },
    [],
  );

  const submit = useCallback(
    async ({
      newTab = false,
      suggestion,
    }: { newTab?: boolean; suggestion?: ExtendedSuggestion } = {}): Promise<void> => {
      const target =
        suggestion ??
        (effectiveSelectedIndex >= 0
          ? visibleSuggestions[effectiveSelectedIndex]
          : visibleSuggestions[0]);

      const close = (): void => {
        setEditing(false);
        setInputValueState('');
        setSuggestions([]);
        setSelectedSuggestionIndex(-1);
      };

      // --- Command mode ---
      if (!target && modeInfo.mode === 'command') {
        const first = buildCommandSuggestions(modeInfo.query)[0];
        if (first) {
          try { await call(() => window.api.commands.execute(first.id)); } catch { /* ignore */ }
        }
        close();
        return;
      }

      if (target?.type === 'command') {
        try { await call(() => window.api.commands.execute(target.id)); } catch { /* ignore */ }
        close();
        return;
      }

      // --- Engine alias mode (! prefix) ---
      if (!target && modeInfo.mode === 'engine' && modeInfo.engineObj && modeInfo.query.trim()) {
        const url = buildAliasSearchUrl(modeInfo.engineObj, modeInfo.query.trim());
        await performNavigate(url, newTab);
        close();
        return;
      }

      // --- Fallback: no suggestions yet (Enter before debounce) ---
      if (!target) {
        const trimmed = inputValue.trim();
        if (!trimmed) { close(); return; }

        // Handle prefixed modes without suggestions
        if (modeInfo.mode === 'tabs' || modeInfo.mode === 'history') {
          // Do normal search with the query part
          const resolved = resolveQueryToUrl(modeInfo.query || trimmed);
          const url =
            resolved.type === 'url'
              ? resolved.value
              : buildSearchUrl(searchSettings, resolved.value);
          await performNavigate(url, newTab);
          close();
          return;
        }

        const resolved = resolveQueryToUrl(trimmed);
        const url =
          resolved.type === 'url'
            ? resolved.value
            : buildSearchUrl(searchSettings, resolved.value);
        await performNavigate(url, newTab);
        close();
        return;
      }

      try {
        if (target.type === 'open-tab') {
          if (target.workspaceId !== activeWorkspaceId) {
            await useWorkspacesStore.getState().setActive(target.workspaceId);
          }
          await useRuntimeStore.getState().activateTab(target.tabId);
        } else if (target.type === 'history') {
          await performNavigate(target.url, newTab);
        } else if (target.type === 'navigate') {
          await performNavigate(target.url, newTab);
        } else if (target.type === 'search') {
          // Engine alias search
          if (modeInfo.mode === 'engine' && modeInfo.engineObj) {
            const url = buildAliasSearchUrl(modeInfo.engineObj, target.query);
            await performNavigate(url, newTab);
          } else {
            const url = buildSearchUrl(searchSettings, target.query);
            await performNavigate(url, newTab);
          }
        }
      } finally {
        close();
      }
    },
    [
      activeWorkspaceId,
      performNavigate,
      searchSettings,
      effectiveSelectedIndex,
      visibleSuggestions,
      modeInfo,
      inputValue,
      buildCommandSuggestions,
    ],
  );

  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    const unsub = window.api.on(IPC_EVENTS.SUGGESTIONS_POPUP_SELECTED, (payload) => {
      void submitRef.current({ newTab: payload.newTab, suggestion: payload.suggestion as ExtendedSuggestion });
    });
    return unsub;
  }, []);

  const navigate = useMemo(
    () => ({
      back(): void {
        const tabId = activeTabRef.current;
        if (!tabId) return;
        void call(() => window.api.nav.back({ id: tabId }));
      },
      forward(): void {
        const tabId = activeTabRef.current;
        if (!tabId) return;
        void call(() => window.api.nav.forward({ id: tabId }));
      },
      reload(): void {
        const tabId = activeTabRef.current;
        if (!tabId) return;
        void call(() => window.api.nav.reload({ id: tabId }));
      },
      stop(): void {
        const tabId = activeTabRef.current;
        if (!tabId) return;
        void call(() => window.api.nav.stop({ id: tabId }));
      },
    }),
    [],
  );

  // Handle prefixOnFocus from commands (Ctrl+Shift+H, >, etc.)
  // When prefix is '@', redirect to the Tab Switcher Modal instead of inline suggestions.
  const lastFocusReqRef = useRef(0);
  useEffect(() => {
    if (focusRequestId === 0) return;
    if (focusRequestId === lastFocusReqRef.current) return;
    lastFocusReqRef.current = focusRequestId;

    const prefix = prefixOnFocus ?? '';

    if (prefix === '@') {
      // Show @ chip briefly (150ms) then open the tab switcher and clear the URL bar.
      setEditing(true);
      setInputValueState('@');
      setSelectedSuggestionIndex(-1);
      setTimeout(() => {
        setEditing(false);
        setInputValueState('');
        setSuggestions([]);
        void useTabSwitcherStore.getState().open();
      }, 150);
      return;
    }

    setEditing(true);
    setInputValueState(prefix);
    setSelectedSuggestionIndex(-1);
    resetInline();
    if (prefix) {
      void fetchSuggestions(prefix);
    }
  }, [focusRequestId, prefixOnFocus, fetchSuggestions, resetInline]);

  return {
    displayUrl,
    security,
    loading: navState.loading,
    canGoBack: navState.canGoBack,
    canGoForward: navState.canGoForward,
    activeTabId,
    editing,
    inputValue: inlineDisplayValue(inputValue, activeCompletion),
    enterEditing,
    cancelEditing,
    setInputValue,
    inlineCompletion: activeCompletion,
    handleInlineCompletionKey,
    dismissInlineCompletion: dismissInline,
    inputCompositionHandlers: inline.compositionHandlers,
    suggestions: visibleSuggestions,
    selectedSuggestionIndex: effectiveSelectedIndex,
    moveSuggestionCursor,
    setSelectedSuggestionIndex,
    submit,
    navigate,
    focusRequestId,
    modeInfo,
    clearPrefix,
    hoverUrl,
  };
}
