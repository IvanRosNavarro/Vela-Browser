import { useCallback, useEffect, useRef, useState } from 'react';
import { IPC_EVENTS, type AdBlockerCounts } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const TAB_ID = params.get('tabId') ?? '';
const WINDOW_ID = parseInt(params.get('windowId') ?? '0', 10);

interface Status {
  globalEnabled: boolean;
  isException: boolean;
  domain: string | null;
  counts: AdBlockerCounts;
  lastUpdated: number | null;
}

function CountChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      flex: 1,
      padding: '8px 4px',
      borderRadius: 6,
      background: 'var(--vela-bg-elevated)',
    }}>
      <span style={{ fontSize: 18, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)' }}>{label}</span>
    </div>
  );
}

function BlockedRow({ url, rule }: { url: string; rule: string }) {
  const short = url.length > 60 ? url.slice(0, 57) + '…' : url;
  return (
    <div
      title={`${url}\nRegla: ${rule}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: '4px 8px',
        borderBottom: '1px solid var(--vela-border)',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--vela-fg)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {short}
      </span>
      <span style={{ fontSize: 10, color: 'var(--vela-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {rule}
      </span>
    </div>
  );
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [loading, setLoading] = useState(true);

  const statusRef = useRef<Status | null>(null);
  statusRef.current = status;

  const fetchStatus = useCallback(async () => {
    if (!TAB_ID) return;
    const res = await window.api.adblocker.getStatus({ tabId: TAB_ID });
    if (res.ok) {
      setStatus(res.data);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Live count updates
  useEffect(() => {
    const unsub = window.api.on(IPC_EVENTS.ADBLOCKER_COUNT_UPDATED, (payload) => {
      if (payload.tabId === TAB_ID) {
        setStatus((prev) => prev ? { ...prev, counts: payload.counts } : prev);
      }
    });
    return unsub;
  }, []);

  const handleToggle = useCallback(async () => {
    if (!status?.domain) return;
    setLoading(true);
    const res = await window.api.adblocker.toggleSite({ domain: status.domain });
    if (res.ok) {
      setStatus((prev) => prev ? { ...prev, isException: res.data.isException } : prev);
      setToggled(true);
    }
    setLoading(false);
  }, [status]);

  const handleReload = useCallback(async () => {
    await window.api.adblocker.reloadTab({ tabId: TAB_ID });
    window.api.adblocker.closePanel({ windowId: WINDOW_ID });
  }, []);

  const openSettings = useCallback(() => {
    void window.api.nav.goto({ id: TAB_ID, url: 'vela://settings#adblocker' });
    window.api.adblocker.closePanel({ windowId: WINDOW_ID });
  }, []);

  if (loading && !status) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--vela-fg-muted)', fontSize: 12 }}>
        Cargando…
      </div>
    );
  }

  if (!status) return null;

  const { domain, globalEnabled, isException, counts } = status;
  const total = counts.ads + counts.trackers + counts.other;
  const blocked10 = counts.blocked.slice(0, 10);

  const toggleLabel = isException
    ? `Activar para ${domain ?? 'este sitio'}`
    : `Desactivar para ${domain ?? 'este sitio'}`;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--vela-bg-surface)',
      borderRadius: 10,
      border: '1px solid var(--vela-border)',
      overflow: 'hidden',
      ...getGlassStyle(),
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--vela-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={globalEnabled && !isException ? 'var(--vela-accent)' : 'none'} stroke={globalEnabled && !isException ? 'var(--vela-accent)' : 'var(--vela-fg-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--vela-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {domain ?? 'Bloqueador de anuncios'}
          </span>
        </div>

        {/* Toggle site exception */}
        {globalEnabled && domain && (
          <button
            onClick={() => void handleToggle()}
            disabled={loading}
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: 6,
              border: `1px solid ${isException ? 'var(--vela-border)' : 'var(--vela-accent)'}`,
              background: isException ? 'var(--vela-bg-elevated)' : 'var(--vela-accent)',
              color: isException ? 'var(--vela-fg)' : 'var(--vela-accent-fg)',
              fontWeight: 500,
              fontSize: 12,
              textAlign: 'center',
              opacity: loading ? 0.6 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {isException ? '✓ Activar bloqueador' : toggleLabel}
          </button>
        )}

        {!globalEnabled && (
          <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', textAlign: 'center', padding: '4px 0' }}>
            Bloqueador desactivado globalmente
          </div>
        )}
      </div>

      {/* Contadores */}
      {globalEnabled && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--vela-border)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: total > 0 ? 8 : 0 }}>
            <CountChip label="Anuncios" value={counts.ads} color="var(--vela-accent)" />
            <CountChip label="Trackers" value={counts.trackers} color="#e07b7b" />
            <CountChip label="Otros" value={counts.other} color="var(--vela-fg-muted)" />
          </div>
          {total === 0 && !isException && (
            <p style={{ fontSize: 11, color: 'var(--vela-fg-muted)', textAlign: 'center' }}>
              Ningún elemento bloqueado aún
            </p>
          )}
          {isException && (
            <p style={{ fontSize: 11, color: 'var(--vela-fg-muted)', textAlign: 'center' }}>
              Bloqueador desactivado para este sitio
            </p>
          )}
        </div>
      )}

      {/* Lista colapsable */}
      {blocked10.length > 0 && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <button
            onClick={() => setListOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 14px',
              border: 'none',
              background: 'none',
              color: 'var(--vela-fg-muted)',
              fontSize: 11,
              fontWeight: 500,
              width: '100%',
              borderBottom: '1px solid var(--vela-border)',
              cursor: 'pointer',
            }}
          >
            <span>Últimas bloqueadas ({Math.min(total, 10)})</span>
            <span>{listOpen ? '▲' : '▼'}</span>
          </button>
          {listOpen && (
            <div style={{ overflow: 'auto', flex: 1 }}>
              {blocked10.map((b, i) => (
                <BlockedRow key={i} url={b.url} rule={b.rule} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderTop: '1px solid var(--vela-border)',
        gap: 8,
      }}>
        <button
          onClick={openSettings}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--vela-fg-muted)',
            fontSize: 11,
            padding: 0,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Configuración →
        </button>
        <button
          onClick={() => void handleReload()}
          disabled={!toggled}
          style={{
            padding: '5px 10px',
            borderRadius: 5,
            border: '1px solid var(--vela-border)',
            background: toggled ? 'var(--vela-bg-elevated)' : 'transparent',
            color: toggled ? 'var(--vela-fg)' : 'var(--vela-fg-muted)',
            fontSize: 11,
            fontWeight: 500,
            opacity: toggled ? 1 : 0.4,
            cursor: toggled ? 'pointer' : 'default',
          }}
        >
          Recargar página
        </button>
      </div>
    </div>
  );
}
