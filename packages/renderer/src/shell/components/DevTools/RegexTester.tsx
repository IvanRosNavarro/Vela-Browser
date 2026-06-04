import { useState, useCallback, useMemo } from 'react';

interface FlagDef { id: string; title: string }
const ALL_FLAGS: FlagDef[] = [
  { id: 'g', title: 'global — buscar todas las coincidencias' },
  { id: 'i', title: 'insensible a mayúsculas' },
  { id: 'm', title: 'multilínea — ^ y $ por línea' },
  { id: 's', title: 'dotAll — el punto incluye saltos de línea' },
  { id: 'u', title: 'Unicode completo' },
  { id: 'd', title: 'índices — añade .indices a cada match' },
];
const MATCH_COLORS = ['#a8c7f0', '#98c97a', '#f09d5e', '#e87d7d', '#c7a8f0', '#f0e3a8'];
const MAX_HISTORY = 10;

export function RegexTester() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<Set<string>>(new Set(['g']));
  const [testText, setTestText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceMode, setReplaceMode] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const toggleFlag = useCallback((f: string) => {
    setFlags((prev) => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });
  }, []);

  const { regex, regexError } = useMemo(() => {
    if (!pattern) return { regex: null, regexError: null };
    try {
      return { regex: new RegExp(pattern, [...flags].join('')), regexError: null };
    } catch (e) {
      return { regex: null, regexError: e instanceof Error ? e.message : String(e) };
    }
  }, [pattern, flags]);

  const globalFlags = useMemo(() => {
    const f = new Set(flags); f.add('g'); return [...f].join('');
  }, [flags]);

  const matches = useMemo(() => {
    if (!regex || !testText) return [];
    const result: Array<{ start: number; end: number; full: string; groups: Record<string, string>; colorIdx: number }> = [];
    let ci = 0;
    try {
      for (const m of testText.matchAll(new RegExp(regex.source, globalFlags))) {
        result.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, full: m[0], groups: m.groups ?? {}, colorIdx: ci++ % MATCH_COLORS.length });
      }
    } catch { /* ignore */ }
    return result;
  }, [regex, testText, globalFlags]);

  const highlightedText = useMemo(() => {
    if (!matches.length || !testText) return null;
    const parts: React.ReactNode[] = [];
    let last = 0;
    matches.forEach((m, i) => {
      if (m.start > last) parts.push(<span key={`t${i}`}>{testText.slice(last, m.start)}</span>);
      parts.push(
        <mark key={`m${i}`} style={{ background: MATCH_COLORS[m.colorIdx] + '30', color: 'inherit', borderBottom: `2px solid ${MATCH_COLORS[m.colorIdx]}`, borderRadius: 2 }}>
          {testText.slice(m.start, m.end)}
        </mark>
      );
      last = m.end;
    });
    if (last < testText.length) parts.push(<span key="tail">{testText.slice(last)}</span>);
    return parts;
  }, [matches, testText]);

  const replaceResult = useMemo(() => {
    if (!replaceMode || !regex || !testText) return null;
    try { return testText.replace(regex, replaceText); } catch { return null; }
  }, [replaceMode, regex, testText, replaceText]);

  const saveToHistory = useCallback(() => {
    if (!pattern) return;
    setHistory((prev) => [pattern, ...prev.filter((p) => p !== pattern)].slice(0, MAX_HISTORY));
  }, [pattern]);

  return (
    <div className="flex flex-col gap-4">
      {/* Regex input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-[var(--vela-fg-muted)]">Expresión regular</label>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--vela-border)] px-3 py-2 bg-[var(--vela-bg-app)] focus-within:border-[var(--vela-accent)]">
          <span className="text-[var(--vela-fg-muted)] font-mono select-none">/</span>
          <input
            className="flex-1 font-mono text-sm bg-transparent focus:outline-none text-[var(--vela-fg)]"
            placeholder="patrón…"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            onBlur={saveToHistory}
            spellCheck={false}
            autoFocus
          />
          <span className="text-[var(--vela-fg-muted)] font-mono select-none">/</span>
          <div className="flex gap-1 ml-1">
            {ALL_FLAGS.map(({ id, title }) => (
              <button
                key={id}
                className={`px-1.5 py-0.5 rounded font-mono text-xs transition-colors ${flags.has(id) ? 'bg-[var(--vela-accent)] text-white' : 'border border-[var(--vela-border)] text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-hover)]'}`}
                onClick={() => toggleFlag(id)}
                title={`/${id} — ${title}`}
              >{id}</button>
            ))}
          </div>
        </div>
        {regexError && (
          <p className="text-xs text-red-400 font-mono bg-red-500/10 px-2 py-1 rounded">{regexError}</p>
        )}
      </div>

      {/* History pills */}
      {history.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-xs text-[var(--vela-fg-muted)]">Recientes:</span>
          {history.slice(0, 5).map((h) => (
            <button key={h} className="text-xs font-mono px-2 py-0.5 rounded-full border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)] truncate max-w-[140px]" onClick={() => setPattern(h)} title={h}>{h}</button>
          ))}
        </div>
      )}

      {/* Test text */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--vela-fg-muted)]">Texto de prueba</label>
          {pattern && (
            <span className={`text-xs font-medium ${matches.length ? 'text-[var(--vela-accent)]' : 'text-[var(--vela-fg-muted)]'}`}>
              {matches.length} coincidencia{matches.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="relative" style={{ minHeight: 120 }}>
          <textarea
            className="w-full font-mono text-sm resize-y rounded-lg border border-[var(--vela-border)] p-3 focus:outline-none focus:border-[var(--vela-accent)] bg-transparent text-transparent caret-[var(--vela-fg)] relative z-10"
            style={{ minHeight: 120 }}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            spellCheck={false}
            placeholder="Pega aquí el texto a analizar…"
          />
          <div
            className="w-full font-mono text-sm rounded-lg p-3 overflow-auto absolute inset-0 whitespace-pre-wrap break-words text-[var(--vela-fg)] bg-[var(--vela-bg-app)] pointer-events-none border border-transparent"
            aria-hidden
          >
            {highlightedText ?? <span className="text-[var(--vela-fg-muted)]">{testText || ''}</span>}
          </div>
        </div>
      </div>

      {/* Matches list */}
      {matches.length > 0 && (
        <div className="rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-app)] overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--vela-border)] text-xs text-[var(--vela-fg-muted)] font-medium">
            Coincidencias
          </div>
          <div className="max-h-36 overflow-y-auto divide-y divide-[var(--vela-border)]">
            {matches.map((m, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono hover:bg-[var(--vela-bg-hover)]">
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-sans" style={{ background: MATCH_COLORS[m.colorIdx] + '30', color: MATCH_COLORS[m.colorIdx] }}>{i + 1}</span>
                <span className="text-[var(--vela-fg-muted)] shrink-0">[{m.start}…{m.end}]</span>
                <span className="text-[var(--vela-fg)] truncate flex-1">«{m.full}»</span>
                {Object.keys(m.groups).length > 0 && (
                  <span className="text-[var(--vela-fg-muted)] truncate max-w-[140px]">{JSON.stringify(m.groups)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Replace mode */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
          <input type="checkbox" checked={replaceMode} onChange={(e) => setReplaceMode(e.target.checked)} className="accent-[var(--vela-accent)] w-4 h-4" />
          <span className="text-[var(--vela-fg)]">Modo reemplazar</span>
        </label>
        {replaceMode && (
          <>
            <input
              className="font-mono text-sm rounded-lg border border-[var(--vela-border)] px-3 py-2 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
              placeholder="Reemplazo (usa $1, $2 para grupos de captura)…"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
            />
            {replaceResult !== null && (
              <div className="rounded-lg border border-[var(--vela-border)] p-3 font-mono text-sm text-[var(--vela-fg)] bg-[var(--vela-bg-app)] whitespace-pre-wrap max-h-32 overflow-auto">
                {replaceResult}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
