import { useState, useCallback } from 'react';

function detectUnit(ts: string): 'ms' | 's' {
  const n = parseInt(ts, 10);
  if (isNaN(n)) return 's';
  return ts.length >= 13 ? 'ms' : 's';
}

function formatRelative(ms: number): string {
  const now = Date.now();
  const diff = Math.abs(now - ms);
  const past = ms < now;
  const s = Math.floor(diff / 1000);
  if (s < 60) return past ? `hace ${s} segundos` : `en ${s} segundos`;
  const m = Math.floor(s / 60);
  if (m < 60) return past ? `hace ${m} minutos` : `en ${m} minutos`;
  const h = Math.floor(m / 60);
  if (h < 24) return past ? `hace ${h} horas` : `en ${h} horas`;
  const d = Math.floor(h / 24);
  if (d < 30) return past ? `hace ${d} días` : `en ${d} días`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return past ? `hace ${mo} meses` : `en ${mo} meses`;
  const y = Math.floor(d / 365);
  return past ? `hace ${y} años` : `en ${y} años`;
}

function copyText(v: string) { void navigator.clipboard.writeText(v); }

interface Row { label: string; value: string }

export function Timestamps() {
  const [tsInput, setTsInput] = useState('');
  const [forceUnit, setForceUnit] = useState<'auto' | 'ms' | 's'>('auto');
  const [dateInput, setDateInput] = useState('');

  const unit = forceUnit === 'auto' ? detectUnit(tsInput) : forceUnit;
  const tsNumber = parseInt(tsInput, 10);
  const msTimestamp = !isNaN(tsNumber) ? (unit === 'ms' ? tsNumber : tsNumber * 1000) : null;

  const rows: Row[] = msTimestamp !== null
    ? [
        { label: 'UTC ISO 8601', value: new Date(msTimestamp).toISOString() },
        { label: 'Local', value: new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(new Date(msTimestamp)) },
        { label: 'Relativo', value: formatRelative(msTimestamp) },
        { label: 'Unix (s)', value: String(Math.floor(msTimestamp / 1000)) },
        { label: 'Unix (ms)', value: String(msTimestamp) },
      ]
    : [];

  const dateToTs = useCallback(() => {
    if (!dateInput) return;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return;
    const ms = d.getTime();
    setTsInput(forceUnit === 'ms' ? String(ms) : String(Math.floor(ms / 1000)));
  }, [dateInput, forceUnit]);

  const setNow = useCallback(() => {
    const ms = Date.now();
    setTsInput(forceUnit === 'ms' ? String(ms) : String(Math.floor(ms / 1000)));
  }, [forceUnit]);

  return (
    <div className="flex flex-col gap-4">
      {/* Timestamp input */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-[var(--vela-fg-muted)]">Timestamp Unix</label>
        <div className="flex gap-2 items-center">
          <input
            className="flex-1 font-mono text-sm rounded-lg border border-[var(--vela-border)] px-3 py-2 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
            placeholder="Timestamp Unix (s o ms)…"
            value={tsInput}
            onChange={(e) => setTsInput(e.target.value)}
          />
          <button className="text-xs px-2 py-2 rounded-lg border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)] shrink-0" onClick={setNow}>Ahora</button>
        </div>
        <div className="flex gap-1 text-xs">
          <span className="text-[var(--vela-fg-muted)]">Unidad:</span>
          {(['auto', 's', 'ms'] as const).map((u) => (
            <button
              key={u}
              className={`px-2 py-0.5 rounded border text-xs ${forceUnit === u ? 'bg-[var(--vela-accent)] text-white border-[var(--vela-accent)]' : 'border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)]'}`}
              onClick={() => setForceUnit(u)}
            >{u === 'auto' ? 'Auto' : u}</button>
          ))}
          {tsInput && (
            <span className="text-[var(--vela-fg-muted)] ml-1">
              (detectado: {unit})
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-[var(--vela-border)] overflow-hidden">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--vela-bg-hover)] transition-colors">
              <span className="text-xs text-[var(--vela-fg-muted)] w-24 shrink-0">{label}</span>
              <span className="font-mono text-sm flex-1 truncate text-[var(--vela-fg)]">{value}</span>
              <button className="text-xs shrink-0 text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]" onClick={() => copyText(value)}>⎘</button>
            </div>
          ))}
        </div>
      )}

      {tsInput && rows.length === 0 && (
        <p className="text-xs text-red-400">Timestamp inválido.</p>
      )}

      {/* Date → timestamp */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-[var(--vela-fg-muted)]">Fecha → timestamp</label>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            className="flex-1 font-mono text-sm rounded-lg border border-[var(--vela-border)] px-3 py-2 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
          />
          <button className="px-3 py-2 text-xs rounded-lg border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)] shrink-0" onClick={dateToTs}>Convertir</button>
        </div>
        <input
          type="text"
          placeholder="O escribe una fecha ISO (ej. 2024-01-15T12:00:00Z)…"
          className="font-mono text-sm rounded-lg border border-[var(--vela-border)] px-3 py-2 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
        />
      </div>
    </div>
  );
}
