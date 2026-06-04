import { useState, useCallback } from 'react';

interface CssBase {
  fontSize: number;
  vpWidth: number;
  vpHeight: number;
}

const DEFAULT_BASE: CssBase = { fontSize: 16, vpWidth: 1440, vpHeight: 900 };
const UNITS = ['px', 'rem', 'em', 'vw', 'vh', '%'] as const;
type CssUnit = (typeof UNITS)[number];

function toPx(value: number, from: CssUnit, base: CssBase): number {
  switch (from) {
    case 'px': return value;
    case 'rem': case 'em': return value * base.fontSize;
    case 'vw': return (value / 100) * base.vpWidth;
    case 'vh': return (value / 100) * base.vpHeight;
    case '%': return (value / 100) * base.vpWidth;
  }
}

function fromPx(px: number, to: CssUnit, base: CssBase): number {
  switch (to) {
    case 'px': return px;
    case 'rem': case 'em': return px / base.fontSize;
    case 'vw': return (px / base.vpWidth) * 100;
    case 'vh': return (px / base.vpHeight) * 100;
    case '%': return (px / base.vpWidth) * 100;
  }
}

function fmt(n: number): string {
  return parseFloat(n.toPrecision(6)).toString();
}

type ValMap = Record<CssUnit, string>;
const emptyMap: ValMap = { px: '', rem: '', em: '', vw: '', vh: '', '%': '' };

export function CssUnits() {
  const [base, setBase] = useState<CssBase>(DEFAULT_BASE);
  const [values, setValues] = useState<ValMap>(emptyMap);
  const [loading, setLoading] = useState(false);

  const handleChange = useCallback((unit: CssUnit, raw: string) => {
    const n = parseFloat(raw);
    if (raw === '' || isNaN(n)) {
      setValues({ ...emptyMap, [unit]: raw });
      return;
    }
    const px = toPx(n, unit, base);
    const next = {} as ValMap;
    for (const u of UNITS) {
      next[u] = u === unit ? raw : fmt(fromPx(px, u, base));
    }
    setValues(next);
  }, [base]);

  const readFromTab = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.api.devtoolsHelpers.getTabCssValues();
      if (res.ok) setBase(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const copyValue = useCallback((unit: CssUnit) => {
    const v = values[unit];
    if (v) void navigator.clipboard.writeText(`${v}${unit}`);
  }, [values]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[var(--vela-fg-muted)]">Base rem/em:</span>
          <input
            className="w-16 font-mono rounded border border-[var(--vela-border)] px-2 py-1 bg-[var(--vela-bg-app)] text-[var(--vela-fg)] focus:outline-none text-xs"
            value={base.fontSize}
            type="number"
            min={1}
            onChange={(e) => setBase((b) => ({ ...b, fontSize: parseFloat(e.target.value) || 16 }))}
          />
          <span className="text-[var(--vela-fg-muted)]">px</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--vela-fg-muted)]">Viewport:</span>
          <input className="w-16 font-mono rounded border border-[var(--vela-border)] px-2 py-1 bg-[var(--vela-bg-app)] text-[var(--vela-fg)] focus:outline-none text-xs" value={base.vpWidth} type="number" onChange={(e) => setBase((b) => ({ ...b, vpWidth: parseFloat(e.target.value) || 1440 }))} />
          <span className="text-[var(--vela-fg-muted)]">×</span>
          <input className="w-16 font-mono rounded border border-[var(--vela-border)] px-2 py-1 bg-[var(--vela-bg-app)] text-[var(--vela-fg)] focus:outline-none text-xs" value={base.vpHeight} type="number" onChange={(e) => setBase((b) => ({ ...b, vpHeight: parseFloat(e.target.value) || 900 }))} />
        </div>
        <button
          className="ml-auto px-2 py-1 rounded border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)] transition-colors"
          onClick={() => { void readFromTab(); }}
          disabled={loading}
        >
          {loading ? 'Leyendo…' : 'Leer de la tab activa'}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {UNITS.map((unit) => (
          <div key={unit} className="flex items-center gap-3">
            <span className="font-mono text-sm text-[var(--vela-fg-muted)] w-8 text-right shrink-0">{unit}</span>
            <input
              className="flex-1 font-mono text-sm rounded-lg border border-[var(--vela-border)] px-3 py-2 bg-[var(--vela-bg-app)] text-[var(--vela-fg)] focus:outline-none focus:border-[var(--vela-accent)]"
              value={values[unit]}
              placeholder="0"
              type="number"
              onChange={(e) => handleChange(unit, e.target.value)}
            />
            <button
              className="text-xs px-2 py-1.5 rounded border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)] shrink-0"
              onClick={() => copyValue(unit)}
            >⎘</button>
          </div>
        ))}
      </div>
    </div>
  );
}
