export interface TabResult {
  type: 'tab';
  tabId: string;
  title: string;
  url: string;
  favicon: string | null;
  workspaceId: string;
  workspaceName: string;
}

export interface HistoryResult {
  type: 'history';
  id: string;
  title: string;
  url: string;
  favicon: string | null;
  visitedAt: number;
}

export interface SearchResult {
  url: string;
  favicon: string | null;
  title: string;
}

export interface SearchEngineResult {
  type: 'engine';
  query: string;
  url: string;
  engineName: string;
}

export interface NavigateResult {
  type: 'navigate';
  url: string;
}

export type AnyResult = TabResult | HistoryResult | SearchEngineResult | NavigateResult;

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'hace 1 día';
  if (diffDays < 30) return `hace ${diffDays} días`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return 'hace 1 mes';
  if (diffMonths < 12) return `hace ${diffMonths} meses`;
  return `hace ${Math.floor(diffMonths / 12)} años`;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface Props {
  navigate: NavigateResult | null;
  tabs: TabResult[];
  history: HistoryResult[];
  engine: SearchEngineResult | null;
  selectedIndex: number;
  onSelect: (result: AnyResult) => void;
  onHover: (index: number) => void;
}

export function SearchResults({ navigate, tabs, history, engine, selectedIndex, onSelect, onHover }: Props) {
  const allResults: AnyResult[] = [
    ...(navigate ? [navigate] : []),
    ...(engine ? [engine] : []),
    ...tabs,
    ...history,
  ];

  if (allResults.length === 0) return null;

  let globalIndex = 0;

  function ResultItem({ result, index }: { result: AnyResult; index: number }) {
    const isSelected = index === selectedIndex;
    return (
      <button
        type="button"
        className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
          isSelected
            ? 'bg-[var(--vela-accent)] text-white'
            : 'hover:bg-[var(--vela-bg-surface-hover)] text-[var(--vela-fg)]'
        }`}
        onMouseEnter={() => onHover(index)}
        onClick={() => onSelect(result)}
      >
        {(result.type === 'tab' || result.type === 'history') && result.favicon ? (
          <img
            src={result.favicon}
            alt=""
            className="h-4 w-4 flex-shrink-0 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className={`h-4 w-4 flex-shrink-0 rounded-full ${isSelected ? 'bg-white/30' : 'bg-[var(--vela-bg-surface)]'}`} />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {result.type === 'engine'
              ? `Buscar "${result.query}" en ${result.engineName}`
              : result.type === 'navigate'
                ? result.url
                : (result.title || getDomain(result.url))}
          </div>
          {(result.type === 'tab' || result.type === 'history') && (
            <div className={`truncate text-xs ${isSelected ? 'text-white/70' : 'text-[var(--vela-fg-muted)]'}`}>
              {getDomain(result.url)}
            </div>
          )}
        </div>
        {result.type === 'navigate' && (
          <span className={`flex-shrink-0 text-xs ${isSelected ? 'text-white/70' : 'text-[var(--vela-fg-muted)]'}`}>
            Ir a
          </span>
        )}
        {result.type === 'tab' && (
          <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs ${isSelected ? 'bg-white/20' : 'bg-[var(--vela-accent)]/15 text-[var(--vela-accent)]'}`}>
            {result.workspaceName}
          </span>
        )}
        {result.type === 'history' && (
          <span className={`flex-shrink-0 text-xs ${isSelected ? 'text-white/70' : 'text-[var(--vela-fg-muted)]'}`}>
            {relativeTime(result.visitedAt)}
          </span>
        )}
      </button>
    );
  }

  const hasOthersBefore = (navigate || engine) !== null;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] shadow-lg">
      {navigate && (
        <section>
          {(() => {
            const idx = globalIndex++;
            return <ResultItem key="navigate" result={navigate} index={idx} />;
          })()}
        </section>
      )}
      {engine && (
        <section>
          {navigate && <div className="border-t border-[var(--vela-border)]" />}
          {(() => {
            const idx = globalIndex++;
            return <ResultItem key="engine" result={engine} index={idx} />;
          })()}
        </section>
      )}
      {tabs.length > 0 && (
        <section>
          <div className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--vela-fg-muted)] ${hasOthersBefore ? 'border-t border-[var(--vela-border)]' : ''}`}>
            Pestañas abiertas
          </div>
          {tabs.map((t) => {
            const idx = globalIndex++;
            return <ResultItem key={t.tabId} result={t} index={idx} />;
          })}
        </section>
      )}
      {history.length > 0 && (
        <section>
          <div className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--vela-fg-muted)] ${(hasOthersBefore || tabs.length > 0) ? 'border-t border-[var(--vela-border)]' : ''}`}>
            En el historial
          </div>
          {history.map((h) => {
            const idx = globalIndex++;
            return <ResultItem key={h.id} result={h} index={idx} />;
          })}
        </section>
      )}
    </div>
  );
}
