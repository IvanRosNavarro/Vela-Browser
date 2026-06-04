import { useState, useMemo, useCallback } from 'react';
import { diffLines, type Change } from 'diff';

/** Copia solo las líneas que cambiaron, sin cabeceras ni contexto sin cambios */
function buildChangedOnlyDiff(changes: Change[]): string {
  const lines: string[] = [];
  for (const c of changes) {
    if (!c.added && !c.removed) continue;
    const prefix = c.added ? '+ ' : '- ';
    const raw = c.value.endsWith('\n') ? c.value.slice(0, -1) : c.value;
    raw.split('\n').forEach((l) => lines.push(prefix + l));
  }
  return lines.join('\n');
}

export function TextDiff() {
  const [original, setOriginal] = useState('');
  const [modified, setModified] = useState('');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [unifiedView, setUnifiedView] = useState(false);

  const prepare = useCallback((s: string) => {
    let r = s;
    if (ignoreCase) r = r.toLowerCase();
    if (ignoreWhitespace) r = r.replace(/ +/g, ' ').trim();
    return r;
  }, [ignoreCase, ignoreWhitespace]);

  const changes = useMemo(() => diffLines(prepare(original), prepare(modified)), [original, modified, prepare]);

  const stats = useMemo(() => {
    let added = 0; let removed = 0;
    changes.forEach((c) => {
      const n = c.count ?? 0;
      if (c.added) added += n;
      else if (c.removed) removed += n;
    });
    return { added, removed };
  }, [changes]);

  const copyDiff = useCallback(() => {
    void window.api.clipboard.writeText(buildChangedOnlyDiff(changes));
  }, [changes]);

  const onDropFactory = (setter: (v: string) => void) => (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const r = new FileReader(); r.onload = (ev) => setter(String(ev.target?.result ?? '')); r.readAsText(f);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="text-xs text-[var(--vela-fg-muted)]">
          <span className="text-red-400 font-medium">-{stats.removed} líneas</span>
          {' · '}
          <span className="text-green-400 font-medium">+{stats.added} líneas</span>
        </div>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={ignoreWhitespace} onChange={(e) => setIgnoreWhitespace(e.target.checked)} className="accent-[var(--vela-accent)]" />
          <span>Ignorar espacios</span>
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} className="accent-[var(--vela-accent)]" />
          <span>Ignorar mayúsculas</span>
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={unifiedView} onChange={(e) => setUnifiedView(e.target.checked)} className="accent-[var(--vela-accent)]" />
          <span>Vista unificada</span>
        </label>
        <button className="ml-auto text-xs px-2 py-1 rounded border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)]" onClick={copyDiff}>Copiar diff</button>
      </div>

      {unifiedView ? (
        /* Unified diff view */
        <div className="flex-1 min-h-0 rounded-lg border border-[var(--vela-border)] overflow-auto bg-[var(--vela-bg-app)]">
          {changes.map((c, i) => {
            const lines = c.value.split('\n').filter((_, j, a) => j < a.length - 1 || !c.value.endsWith('\n'));
            const bg = c.added ? 'bg-green-500/10' : c.removed ? 'bg-red-500/10' : '';
            const color = c.added ? 'text-green-400' : c.removed ? 'text-red-400' : 'text-[var(--vela-fg-muted)]';
            const prefix = c.added ? '+' : c.removed ? '-' : ' ';
            return lines.map((line, j) => (
              <div key={`${i}-${j}`} className={`flex font-mono text-xs px-3 py-0.5 ${bg}`}>
                <span className={`w-4 shrink-0 select-none ${color}`}>{prefix}</span>
                <span className="text-[var(--vela-fg)] whitespace-pre">{line}</span>
              </div>
            ));
          })}
        </div>
      ) : (
        /* Split view */
        <div className="flex gap-3 flex-1 min-h-0">
          {[
            { label: 'Original', value: original, set: setOriginal, drop: onDropFactory(setOriginal) },
            { label: 'Modificado', value: modified, set: setModified, drop: onDropFactory(setModified) },
          ].map(({ label, value, set, drop }) => (
            <div key={label} className="flex flex-col flex-1 min-w-0" onDrop={drop} onDragOver={(e) => e.preventDefault()}>
              <label className="text-xs text-[var(--vela-fg-muted)] mb-1">{label}</label>
              <textarea
                className="flex-1 font-mono text-xs resize-none rounded-lg border border-[var(--vela-border)] p-3 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
                placeholder={`Pega el texto ${label.toLowerCase()}…`}
                value={value}
                onChange={(e) => set(e.target.value)}
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      )}

      {/* Diff result in split view */}
      {!unifiedView && (original || modified) && (
        <div className="rounded-lg border border-[var(--vela-border)] overflow-auto max-h-48 bg-[var(--vela-bg-app)]">
          {changes.map((c, i) => {
            const lines = c.value.split('\n').filter((_, j, a) => j < a.length - 1 || !c.value.endsWith('\n'));
            const bg = c.added ? 'bg-green-500/10' : c.removed ? 'bg-red-500/10' : '';
            const color = c.added ? 'text-green-400' : c.removed ? 'text-red-400' : 'text-[var(--vela-fg-muted)]';
            const prefix = c.added ? '+' : c.removed ? '-' : ' ';
            return lines.map((line, j) => (
              <div key={`${i}-${j}`} className={`flex font-mono text-xs px-3 py-0.5 ${bg}`}>
                <span className={`w-4 shrink-0 select-none ${color}`}>{prefix}</span>
                <span className="text-[var(--vela-fg)] whitespace-pre">{line}</span>
              </div>
            ));
          })}
        </div>
      )}
    </div>
  );
}
