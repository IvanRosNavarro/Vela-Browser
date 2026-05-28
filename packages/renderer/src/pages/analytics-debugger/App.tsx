import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { IPC_EVENTS, type AnalyticsHit, type AnalyticsProvider } from '@vela/shared';

type DragStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' };

// ─── Metadatos de proveedores ────────────────────────────────────────────────

const PROVIDER_META: Record<AnalyticsProvider, { label: string; color: string; bg: string }> = {
  'ga4':         { label: 'GA4',         color: '#f9ab00', bg: 'rgba(249,171,0,0.15)' },
  'gtm':         { label: 'GTM',         color: '#4285f4', bg: 'rgba(66,133,244,0.15)' },
  'fb-pixel':    { label: 'FB Pixel',    color: '#1877f2', bg: 'rgba(24,119,242,0.15)' },
  'google-ads':  { label: 'Google Ads',  color: '#ea4335', bg: 'rgba(234,67,53,0.15)' },
  'tiktok':      { label: 'TikTok',      color: '#69c9d0', bg: 'rgba(105,201,208,0.15)' },
  'linkedin':    { label: 'LinkedIn',    color: '#0a66c2', bg: 'rgba(10,102,194,0.15)' },
  'pinterest':   { label: 'Pinterest',   color: '#e60023', bg: 'rgba(230,0,35,0.15)' },
  'hotjar':      { label: 'Hotjar',      color: '#ff3c00', bg: 'rgba(255,60,0,0.15)' },
  'mixpanel':    { label: 'Mixpanel',    color: '#7856ff', bg: 'rgba(120,86,255,0.15)' },
  'segment':     { label: 'Segment',     color: '#52bd94', bg: 'rgba(82,189,148,0.15)' },
  'amplitude':   { label: 'Amplitude',   color: '#1a9ef1', bg: 'rgba(26,158,241,0.15)' },
  'twitter':     { label: 'X/Twitter',   color: '#1d9bf0', bg: 'rgba(29,155,240,0.15)' },
  'datalayer':   { label: 'dataLayer',   color: '#a8edba', bg: 'rgba(168,237,186,0.15)' },
  'other':       { label: 'Other',       color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
};

// ─── GA4 item param decode (pr1, pr2 …) ─────────────────────────────────────

const GA4_ITEM_KEYS: Record<string, string> = {
  id: 'item_id', nm: 'item_name', br: 'item_brand',
  ca: 'item_category', c2: 'item_category2', c3: 'item_category3',
  c4: 'item_category4', c5: 'item_category5',
  pr: 'price', qt: 'quantity', vr: 'item_variant',
  cp: 'coupon', lo: 'location_id', af: 'affiliation',
  ds: 'discount', ln: 'item_list_name', li: 'item_list_id', lp: 'index',
};

const GA4_ITEM_ORDER = ['item_name', 'item_id', 'item_brand', 'item_category',
  'item_category2', 'price', 'quantity', 'item_variant'];

function decodeGA4Item(encoded: string): Record<string, string> | null {
  if (!encoded.includes('~')) return null;
  const parts = encoded.split('~');
  const result: Record<string, string> = {};
  const kmap: Record<string, string> = {};
  const vmap: Record<string, string> = {};
  for (const part of parts) {
    if (part.length < 3) continue;
    const prefix = part.slice(0, 2);
    let value = part.slice(2);
    try { value = decodeURIComponent(value); } catch { /* noop */ }
    const known = GA4_ITEM_KEYS[prefix];
    if (known) { result[known] = value; }
    else if (/^k\d$/.test(prefix)) { kmap[prefix[1]!] = value; }
    else if (/^v\d$/.test(prefix)) { vmap[prefix[1]!] = value; }
    else if (prefix) { result[prefix] = value; }
  }
  for (const idx of Object.keys(kmap)) {
    if (kmap[idx]) result[kmap[idx]!] = vmap[idx] ?? '';
  }
  return Object.keys(result).length > 0 ? result : null;
}

function extractGA4Items(params: Record<string, string>) {
  return Object.keys(params)
    .filter((k) => /^pr\d+$/.test(k))
    .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
    .flatMap((k) => {
      const item = decodeGA4Item(params[k]!);
      return item ? [{ index: k.slice(2), item }] : [];
    });
}

// ─── Estado acumulado de dataLayer ──────────────────────────────────────────

function computeAccState(hits: AnalyticsHit[], upToId: string): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const hit of hits) {
    if (hit.provider !== 'datalayer' || !hit.rawData || typeof hit.rawData !== 'object' || Array.isArray(hit.rawData)) {
      if (hit.id === upToId) break;
      continue;
    }
    const data = hit.rawData as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      if (k === 'event' || k.startsWith('gtm.')) continue;
      state[k] = v;
    }
    if (hit.id === upToId) break;
  }
  return state;
}

// ─── Helpers UI ──────────────────────────────────────────────────────────────

function fmt(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function renderValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ProviderBadge({ provider }: { provider: AnalyticsProvider }) {
  const meta = PROVIDER_META[provider];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
      color: meta.color, background: meta.bg, flexShrink: 0,
    }}>
      {meta.label}
    </span>
  );
}

// ─── Fila del evento ─────────────────────────────────────────────────────────

function HitRow({ hit, selected, onClick }: { hit: AnalyticsHit; selected: boolean; onClick: () => void }) {
  const isJS = hit.method === 'JS';
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
        cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: selected ? 'rgba(255,255,255,0.07)' : 'transparent',
        userSelect: 'none', minHeight: 34,
      }}
      onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace', flexShrink: 0, minWidth: 86 }}>
        {fmt(hit.timestamp)}
      </span>
      <ProviderBadge provider={hit.provider} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: selected ? '#fff' : 'rgba(255,255,255,0.85)' }}>
        {hit.label}
      </span>
      {!isJS && (
        <>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: hit.method === 'GET' ? 'rgba(255,255,255,0.3)' : 'rgba(100,180,255,0.6)', flexShrink: 0 }}>
            {hit.method}
          </span>
          {hit.statusCode !== null && (
            <span style={{ fontSize: 11, color: hit.statusCode < 400 ? 'rgba(82,189,148,0.8)' : 'rgba(234,67,53,0.8)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
              {hit.statusCode}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tabla clave-valor genérica ──────────────────────────────────────────────

function KVTable({ entries, keyColor = 'rgba(255,255,255,0.5)' }: { entries: [string, unknown][]; keyColor?: string }) {
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([key, value]) => {
        let prettyValue: string;
        let isJson = false;
        const raw = typeof value === 'string' ? value : renderValue(value);
        try {
          const parsed = JSON.parse(raw);
          if (parsed !== null && typeof parsed === 'object') { prettyValue = JSON.stringify(parsed, null, 2); isJson = true; }
          else prettyValue = raw;
        } catch { prettyValue = raw; }

        return (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, padding: '4px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12, alignItems: 'start' }}>
            <span style={{ color: keyColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', paddingTop: isJson ? 2 : 0 }} title={key}>
              {key}
            </span>
            {isJson
              ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#a8d8ea', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}>{prettyValue}</pre>
              : <span style={{ color: 'rgba(255,255,255,0.9)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{prettyValue}</span>
            }
          </div>
        );
      })}
    </>
  );
}

// ─── Tarjeta de producto GA4 ─────────────────────────────────────────────────

function ItemCard({ index, item }: { index: string; item: Record<string, string> }) {
  const priorityEntries = GA4_ITEM_ORDER.filter((k) => item[k]).map((k) => [k, item[k]!] as [string, string]);
  const otherEntries = Object.entries(item).filter(([k]) => !GA4_ITEM_ORDER.includes(k));
  const allEntries: [string, string][] = [...priorityEntries, ...otherEntries];
  return (
    <div style={{ margin: '6px 14px', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(249,171,0,0.8)', marginBottom: 6 }}>
        Item #{index}{item.item_name ? ` — ${item.item_name}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '2px 8px', fontSize: 12 }}>
        {allEntries.map(([k, v]) => (
          <span key={k + '_k'} style={{ display: 'contents' }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k}>{k}</span>
            <span style={{ color: '#a8edba', fontFamily: 'monospace', wordBreak: 'break-word' }}>{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Panel de detalle (60% arriba / 40% abajo) ───────────────────────────────

function DetailPanel({ hit, allHits }: { hit: AnalyticsHit | null; allHits: AnalyticsHit[] }) {
  if (!hit) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: 24, textAlign: 'center', userSelect: 'none' }}>
        Selecciona un evento para ver sus parámetros
      </div>
    );
  }

  const isDatalayer = hit.provider === 'datalayer';
  const ga4Items = !isDatalayer ? extractGA4Items(hit.params) : [];
  const paramEntries = Object.entries(hit.params).filter(([k]) => !/^pr\d+$/.test(k));
  const accState = isDatalayer ? computeAccState(allHits, hit.id) : null;
  const accEntries = accState ? Object.entries(accState) : [];

  // Bloque superior: contenido "bonito"
  const topContent = (() => {
    if (isDatalayer) {
      return (
        <pre style={{ margin: 0, padding: '10px 14px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace', color: '#a8edba', flex: 1, overflow: 'auto' }}>
          {JSON.stringify(hit.rawData, null, 2)}
        </pre>
      );
    }
    if (ga4Items.length > 0) {
      return (
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 4 }}>
          <div style={{ padding: '6px 14px 4px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em' }}>
            ITEMS ({ga4Items.length})
          </div>
          {ga4Items.map(({ index, item }) => (
            <ItemCard key={index} index={index} item={item} />
          ))}
        </div>
      );
    }
    // Sin items: mostrar params clave en la zona superior
    const keyParams = ['en', 'ep.value', 'cu', 'ep.currency', 'ep.count']
      .filter((k) => hit.params[k])
      .map((k) => [k, hit.params[k]!] as [string, string]);
    if (keyParams.length > 0) {
      return (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ padding: '6px 14px 4px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em' }}>EVENTO</div>
          <KVTable entries={keyParams} keyColor='rgba(249,171,0,0.6)' />
        </div>
      );
    }
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
        Sin datos destacados
      </div>
    );
  })();

  // Bloque inferior: tabla de params o estado acumulado
  const bottomContent = (() => {
    if (isDatalayer && accEntries.length > 0) {
      return (
        <>
          <div style={{ padding: '6px 14px 4px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em', flexShrink: 0 }}>
            ESTADO ACUMULADO ({accEntries.length} variables)
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <KVTable entries={accEntries as [string, unknown][]} keyColor='rgba(168,237,186,0.5)' />
          </div>
        </>
      );
    }
    if (isDatalayer) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
          Sin estado acumulado previo
        </div>
      );
    }
    // Network hit: tabla de params (sin pr{n} que ya están arriba)
    return (
      <>
        {hit.method === 'POST' && paramEntries.length === 0 && (
          <div style={{ padding: '8px 14px', color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
            Capturando cuerpo POST…
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <KVTable entries={paramEntries as [string, unknown][]} />
          {ga4Items.length > 0 && (
            <>
              <div style={{ padding: '6px 14px 4px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em' }}>PARÁMETROS pr{'{n}'} (raw)</div>
              <KVTable entries={Object.entries(hit.params).filter(([k]) => /^pr\d+$/.test(k)) as [string, unknown][]} keyColor='rgba(249,171,0,0.4)' />
            </>
          )}
        </div>
        <div style={{ padding: '4px 14px 6px', color: 'rgba(255,255,255,0.2)', fontSize: 11, flexShrink: 0 }}>
          {Object.keys(hit.params).length} parámetro{Object.keys(hit.params).length !== 1 ? 's' : ''}
          {hit.method === 'POST' ? ' (POST)' : ''}
        </div>
      </>
    );
  })();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ProviderBadge provider={hit.provider} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{hit.label}</span>
          {!isDatalayer && hit.method !== 'JS' && (
            <span style={{ fontSize: 11, color: hit.method === 'GET' ? 'rgba(255,255,255,0.3)' : 'rgba(100,180,255,0.6)', marginLeft: 'auto' }}>{hit.method}</span>
          )}
        </div>
        {hit.url && (
          <div
            title={hit.url}
            style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {(() => { try { const u = new URL(hit.url); return u.hostname + (u.pathname !== '/' ? u.pathname : ''); } catch { return hit.url; } })()}
          </div>
        )}
      </div>

      {/* Top 60% */}
      <div style={{ flex: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {topContent}
      </div>

      {/* Bottom 40% */}
      <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {bottomContent}
      </div>
    </div>
  );
}

// ─── App principal ────────────────────────────────────────────────────────────

type ProviderFilter = AnalyticsProvider | 'all';

export function App() {
  const [hits, setHits] = useState<AnalyticsHit[]>([]);
  const [selected, setSelected] = useState<AnalyticsHit | null>(null);
  const [filter, setFilter] = useState<ProviderFilter>('all');
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    void window.api.analyticsDebugger.getEvents().then((res) => {
      if (res.ok && res.data.length > 0) setHits(res.data);
    });
  }, []);

  useEffect(() => {
    const off = window.api.on(IPC_EVENTS.ANALYTICS_DEBUGGER_HIT, ({ hit }) => {
      setHits((prev) => {
        const next = [...prev, hit];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });
    return off;
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [hits, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  const handleClear = useCallback(async () => {
    await window.api.analyticsDebugger.clear();
    setHits([]);
    setSelected(null);
  }, []);

  const presentProviders = [...new Set(hits.map((h) => h.provider))];

  const visible = hits.filter((h) => {
    if (filter !== 'all' && h.provider !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return h.label.toLowerCase().includes(q) || h.url.toLowerCase().includes(q) || h.provider.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--vela-bg-surface, #1c1f26)', color: 'var(--vela-text-primary, #e8eaed)', overflow: 'hidden' }}>

      {/* Barra de título */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 44, background: 'var(--vela-bg-elevated, #22252e)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, WebkitAppRegion: 'drag', userSelect: 'none' } as DragStyle}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Analytics Debugger</span>
        <div style={{ flex: 1 }} />
        <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', gap: 6 } as DragStyle}>
          <input
            type="text" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', fontSize: 12, padding: '3px 8px', width: 160, outline: 'none' }}
          />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', minWidth: 40, textAlign: 'right' }}>{visible.length} hits</span>
          <button onClick={handleClear} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '3px 10px', cursor: 'pointer' }}>
            Limpiar
          </button>
          <button onClick={() => window.close()} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, overflowX: 'auto', alignItems: 'center' }}>
        {(['all', ...presentProviders] as ProviderFilter[]).map((p) => {
          const isAll = p === 'all';
          const meta = isAll ? null : PROVIDER_META[p as AnalyticsProvider];
          const active = filter === p;
          return (
            <button key={p} onClick={() => setFilter(p)} style={{
              background: active ? (meta ? meta.bg : 'rgba(255,255,255,0.12)') : 'transparent',
              border: active ? `1px solid ${meta ? meta.color : 'rgba(255,255,255,0.3)'}` : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, color: active ? (meta ? meta.color : 'rgba(255,255,255,0.9)') : 'rgba(255,255,255,0.5)',
              fontSize: 11, fontWeight: active ? 600 : 400, padding: '2px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {isAll ? 'Todos' : meta!.label}
            </button>
          );
        })}
      </div>

      {/* Lista + detalle */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={listRef} onScroll={handleScroll} style={{ width: 420, flexShrink: 0, overflow: 'auto', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          {visible.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.25)', userSelect: 'none' }}>
              {hits.length === 0 ? 'Capturando eventos…\nNavega por la web para ver peticiones.' : 'Sin resultados para el filtro actual.'}
            </div>
          ) : (
            visible.map((hit) => (
              <HitRow key={hit.id} hit={hit} selected={selected?.id === hit.id} onClick={() => setSelected(hit)} />
            ))
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DetailPanel hit={selected} allHits={hits} />
        </div>
      </div>

      {/* Status bar */}
      <div style={{ height: 24, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, fontSize: 11, color: 'rgba(255,255,255,0.3)', userSelect: 'none' }}>
        <span>{presentProviders.length > 0 ? `Proveedores detectados: ${presentProviders.map((p) => PROVIDER_META[p].label).join(', ')}` : 'Esperando peticiones de analytics…'}</span>
        <span>{autoScroll ? '↓ auto-scroll' : '⏸ scroll pausado'}</span>
      </div>
    </div>
  );
}
