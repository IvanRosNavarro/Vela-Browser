import { useState, useCallback } from 'react';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { nanoid, customAlphabet } from 'nanoid';
import { createId } from '@paralleldrive/cuid2';

type Format = 'uuid4' | 'uuid7' | 'nanoid' | 'cuid2';

interface GenConfig {
  format: Format;
  count: number;
  nanoLength: number;
  nanoAlphabet: string;
}

const DEFAULT_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function generate(cfg: GenConfig, n: number): string {
  switch (cfg.format) {
    case 'uuid4': return uuidv4();
    case 'uuid7': return uuidv7();
    case 'nanoid': {
      const alphabet = cfg.nanoAlphabet.trim() || DEFAULT_ALPHABET;
      const gen = alphabet === DEFAULT_ALPHABET ? nanoid : customAlphabet(alphabet, cfg.nanoLength);
      return gen(cfg.nanoLength);
    }
    case 'cuid2': return createId();
  }
}

const MAX_HISTORY = 20;

const FORMATS: Array<{ id: Format; label: string }> = [
  { id: 'uuid4', label: 'UUID v4' },
  { id: 'uuid7', label: 'UUID v7' },
  { id: 'nanoid', label: 'NanoID' },
  { id: 'cuid2', label: 'CUID2' },
];

export function UuidGen() {
  const [cfg, setCfg] = useState<GenConfig>({ format: 'uuid4', count: 1, nanoLength: 21, nanoAlphabet: DEFAULT_ALPHABET });
  const [results, setResults] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);

  const generateBatch = useCallback(() => {
    const batch = Array.from({ length: Math.min(cfg.count, 100) }, (_, i) => generate(cfg, i));
    setResults(batch);
    setHistory((prev) => [...batch, ...prev].slice(0, MAX_HISTORY));
  }, [cfg]);

  const copyAll = useCallback(() => {
    void navigator.clipboard.writeText(results.join('\n'));
  }, [results]);

  const copy = useCallback((v: string) => void navigator.clipboard.writeText(v), []);

  return (
    <div className="flex flex-col gap-4">
      {/* Format selector */}
      <div className="flex gap-1 flex-wrap">
        {FORMATS.map(({ id, label }) => (
          <button
            key={id}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${cfg.format === id ? 'bg-[var(--vela-accent)] text-white' : 'border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)]'}`}
            onClick={() => setCfg((c) => ({ ...c, format: id }))}
          >{label}</button>
        ))}
      </div>

      {/* NanoID config */}
      {cfg.format === 'nanoid' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--vela-fg-muted)] w-20 shrink-0">Longitud: {cfg.nanoLength}</label>
            <input type="range" min={6} max={64} value={cfg.nanoLength} onChange={(e) => setCfg((c) => ({ ...c, nanoLength: parseInt(e.target.value) }))} className="flex-1 accent-[var(--vela-accent)]" />
          </div>
          <input
            className="font-mono text-xs rounded-lg border border-[var(--vela-border)] px-3 py-2 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
            value={cfg.nanoAlphabet}
            onChange={(e) => setCfg((c) => ({ ...c, nanoAlphabet: e.target.value }))}
            placeholder="Alfabeto personalizado…"
          />
        </div>
      )}

      {/* Count + generate */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-[var(--vela-fg-muted)]">Cantidad:</label>
        <input
          type="number"
          min={1}
          max={100}
          value={cfg.count}
          onChange={(e) => setCfg((c) => ({ ...c, count: Math.min(100, Math.max(1, parseInt(e.target.value) || 1)) }))}
          className="w-20 font-mono text-sm rounded-lg border border-[var(--vela-border)] px-2 py-1.5 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
        />
        <button className="px-4 py-1.5 rounded-lg bg-[var(--vela-accent)] text-white text-sm hover:opacity-90 transition-opacity" onClick={generateBatch}>Generar</button>
        {results.length > 0 && (
          <button className="px-3 py-1.5 rounded-lg border border-[var(--vela-border)] text-sm hover:bg-[var(--vela-bg-hover)]" onClick={copyAll}>Copiar todos</button>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--vela-border)] p-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 hover:bg-[var(--vela-bg-hover)] rounded px-2 py-1">
              <span className="font-mono text-sm flex-1 text-[var(--vela-fg)]">{r}</span>
              <button className="text-xs shrink-0 text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]" onClick={() => copy(r)}>⎘</button>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-xs text-[var(--vela-fg-muted)] mb-1">Historial de sesión (últimos {MAX_HISTORY})</p>
          <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
            {history.map((r, i) => (
              <div key={i} className="flex items-center gap-2 hover:bg-[var(--vela-bg-hover)] rounded px-2 py-0.5">
                <span className="font-mono text-xs flex-1 text-[var(--vela-fg-muted)]">{r}</span>
                <button className="text-xs shrink-0" onClick={() => copy(r)}>⎘</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
