import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { UserScript } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);
const activeTabId = params.get('activeTabId') ?? null;
const currentUrl = params.get('currentUrl') ?? '';
const initialDevtoolsActive = params.get('devtoolsActive') === 'true';

function matchesUrl(pattern: string, url: string): boolean {
  try {
    const re = new RegExp(
      '^' +
        pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/, '.') +
        '$',
    );
    return re.test(url);
  } catch {
    return false;
  }
}

const toolBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--vela-border)',
  background: 'var(--vela-bg)',
  color: 'var(--vela-fg)',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
};

export function App() {
  const [scripts, setScripts] = useState<UserScript[]>([]);
  const [devtoolsActive, setDevtoolsActive] = useState(initialDevtoolsActive);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    void window.api.scripts.list().then((res) => {
      if (res.ok) setScripts(res.data);
    });
  }, []);

  const activeScripts = scripts.filter(
    (s) => s.enabled && s.matchPatterns.some((p) => matchesUrl(p, currentUrl)),
  );

  const handleToggleScript = useCallback((script: UserScript) => {
    void window.api.scripts.toggle({ id: script.id, enabled: !script.enabled });
    setScripts((prev) =>
      prev.map((s) => (s.id === script.id ? { ...s, enabled: !s.enabled } : s)),
    );
  }, []);

  const handleBugSnapshot = useCallback(async () => {
    if (!activeTabId) return;
    setCapturing(true);
    try {
      await window.api.bugSnapshot.capture({ tabId: activeTabId, windowId: parentWindowId });
    } finally {
      setCapturing(false);
      void window.api.devmode.closePopup({ windowId: parentWindowId });
    }
  }, []);

  const handleResponsive = useCallback(async () => {
    setDevtoolsActive((v) => !v);
    await window.api.devmode.toggleEmulation({ parentWindowId });
    void window.api.devmode.closePopup({ windowId: parentWindowId });
  }, []);

  const handleManageScripts = useCallback(() => {
    void window.api.window.openUrlInNewTab({ url: 'vela://scripts' });
    void window.api.devmode.closePopup({ windowId: parentWindowId });
  }, []);

  const execDevTool = useCallback((commandId: string) => {
    void window.api.commands.execute(commandId, { targetWindowId: parentWindowId });
    void window.api.devmode.closePopup({ windowId: parentWindowId });
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--vela-bg-surface)',
      borderRadius: 10,
      border: '1px solid var(--vela-border)',
      overflow: 'hidden',
      fontSize: 12,
      color: 'var(--vela-fg)',
      ...getGlassStyle(),
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 10px', borderBottom: '1px solid var(--vela-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Modo desarrollador</span>
        </div>
      </div>

      {/* Scripts section */}
      <div style={{ padding: '12px 14px 10px' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--vela-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Scripts activos en esta página
        </p>
        {activeScripts.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--vela-fg-muted)', fontStyle: 'italic' }}>
            Sin scripts para esta página
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 96, overflowY: 'auto' }}>
            {activeScripts.map((script) => (
              <label key={script.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  checked={script.enabled}
                  onChange={() => handleToggleScript(script)}
                  style={{ accentColor: 'var(--vela-accent)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12 }}>{script.name}</span>
                <span style={{ fontSize: 10, color: 'var(--vela-fg-muted)', marginLeft: 'auto' }}>
                  {script.type.toUpperCase()}
                </span>
              </label>
            ))}
          </div>
        )}
        <button onClick={handleManageScripts} style={{ marginTop: 10, fontSize: 11, color: 'var(--vela-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
          Gestionar todos →
        </button>
      </div>

      <div style={{ height: 1, background: 'var(--vela-border)', margin: '0 14px' }} />

      {/* Tools section */}
      <div style={{ padding: '10px 14px 12px' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--vela-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Herramientas
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            onClick={() => void handleBugSnapshot()}
            disabled={capturing || !activeTabId}
            style={{ ...toolBtnStyle, opacity: (!activeTabId || capturing) ? 0.5 : 1 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {capturing ? 'Capturando…' : 'Capturar snapshot'}
          </button>
          <button
            onClick={() => void handleResponsive()}
            style={{
              ...toolBtnStyle,
              background: devtoolsActive ? 'color-mix(in srgb, var(--vela-accent) 15%, transparent)' : undefined,
              borderColor: devtoolsActive ? 'color-mix(in srgb, var(--vela-accent) 40%, transparent)' : undefined,
              color: devtoolsActive ? 'var(--vela-accent)' : undefined,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            Modo responsive
          </button>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--vela-border)', margin: '0 14px' }} />

      {/* Dev tools section */}
      <div style={{ padding: '10px 14px 12px' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--vela-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Herramientas dev
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { id: 'devtools.color-picker', label: 'Pick de color' },
            { id: 'devtools.json-formatter', label: 'JSON Formatter' },
            { id: 'devtools.regex-tester', label: 'Regex Tester' },
            { id: 'devtools.text-diff', label: 'Diff de texto' },
            { id: 'devtools.converters', label: 'Conversores →' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => execDevTool(id)}
              style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 5, border: 'none', background: 'none', color: 'var(--vela-fg)', fontSize: 12, cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-hover, rgba(255,255,255,0.07))'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '0 14px 12px' }}>
        <p style={{ fontSize: 10, color: 'var(--vela-fg-muted)', fontStyle: 'italic' }}>
          Las herramientas de desarrollador solo afectan a tu sesión local.
        </p>
      </div>
    </div>
  );
}
