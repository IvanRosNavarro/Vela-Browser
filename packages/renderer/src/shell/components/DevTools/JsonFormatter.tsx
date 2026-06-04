import { useState, useCallback, useRef, useMemo } from 'react';

type Indent = 2 | 4;

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'color:var(--vela-accent)';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'color:#a8c7f0' : 'color:#98c97a';
      } else if (/true|false/.test(match)) {
        cls = 'color:#f09d5e';
      } else if (/null/.test(match)) {
        cls = 'color:var(--vela-fg-muted)';
      }
      return `<span style="${cls}">${match}</span>`;
    },
  );
}

export function JsonFormatter() {
  const [input, setInput] = useState('');
  const [indent, setIndent] = useState<Indent>(2);
  const [minify, setMinify] = useState(false);
  const [sortKeys, setSortKeys] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sortReplacer = useMemo(() => {
    if (!sortKeys) return undefined;
    return (_key: string, val: unknown) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort());
      }
      return val;
    };
  }, [sortKeys]);

  const { result, error } = useMemo(() => {
    if (!input.trim()) return { result: null, error: null };
    try {
      const parsed = JSON.parse(input) as unknown;
      const formatted = minify
        ? JSON.stringify(parsed, sortReplacer)
        : JSON.stringify(parsed, sortReplacer, indent);
      return { result: formatted, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, indent, minify, sortReplacer]);

  const copyResult = useCallback(() => {
    if (result) void window.api.clipboard.writeText(result);
  }, [result]);

  const pasteInput = useCallback(async () => {
    try { setInput(await navigator.clipboard.readText()); } catch { /* ignore */ }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setInput(String(ev.target?.result ?? ''));
    reader.readAsText(file);
  }, []);

  return (
    <div className="flex flex-col gap-3" style={{ height: '100%' }}>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-[var(--vela-fg-muted)]">Sangría:</span>
          {([2, 4] as const).map((n) => (
            <button
              key={n}
              className={`px-2 py-0.5 rounded border text-xs transition-colors ${indent === n && !minify ? 'bg-[var(--vela-accent)] text-white border-[var(--vela-accent)]' : 'border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)]'}`}
              onClick={() => { setIndent(n); setMinify(false); }}
            >{n}</button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={minify} onChange={(e) => setMinify(e.target.checked)} className="accent-[var(--vela-accent)]" />
          <span>Minificar</span>
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={sortKeys} onChange={(e) => setSortKeys(e.target.checked)} className="accent-[var(--vela-accent)]" />
          <span>Ordenar claves</span>
        </label>
        <div className="flex gap-1 ml-auto">
          <button className="px-2 py-1 rounded border border-[var(--vela-border)] text-xs hover:bg-[var(--vela-bg-hover)]" onClick={pasteInput}>Pegar</button>
          {result && <button className="px-2 py-1 rounded border border-[var(--vela-border)] text-xs hover:bg-[var(--vela-bg-hover)]" onClick={copyResult}>Copiar resultado</button>}
        </div>
      </div>

      {/* Two-panel layout — fills remaining height */}
      <div className="flex gap-3 min-h-0" style={{ flex: 1 }}>
        <div className="flex flex-col min-w-0" style={{ flex: 1 }} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <label className="text-xs text-[var(--vela-fg-muted)] mb-1 shrink-0">Entrada</label>
          <textarea
            className="font-mono text-xs resize-none rounded-lg border border-[var(--vela-border)] p-3 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
            style={{ flex: 1 }}
            placeholder='{"ejemplo": "pega aquí tu JSON…"}'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const r = new FileReader(); r.onload = (ev) => setInput(String(ev.target?.result ?? '')); r.readAsText(f);
          }} />
        </div>

        <div className="flex flex-col min-w-0" style={{ flex: 1 }}>
          <label className="text-xs text-[var(--vela-fg-muted)] mb-1 shrink-0">Resultado</label>
          {error ? (
            <div className="rounded-lg border border-red-500/50 p-3 text-xs font-mono text-red-400 bg-red-500/5 overflow-auto" style={{ flex: 1 }}>
              {error}
            </div>
          ) : result ? (
            <pre
              className="font-mono text-xs rounded-lg border border-[var(--vela-border)] p-3 overflow-auto bg-[var(--vela-bg-app)]"
              style={{ flex: 1 }}
              dangerouslySetInnerHTML={{ __html: syntaxHighlight(result) }}
            />
          ) : (
            <div className="rounded-lg border border-[var(--vela-border)] p-3 flex items-center justify-center text-xs text-[var(--vela-fg-muted)]" style={{ flex: 1 }}>
              El resultado aparecerá aquí
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
