import { useCallback, useEffect, useState } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const WINDOW_ID = parseInt(params.get('windowId') ?? '0', 10);
const TAB_ID = params.get('tabId') ?? '';

const LANG_NAMES: Record<string, string> = {
  es: 'Español', en: 'Inglés', fr: 'Francés', de: 'Alemán', it: 'Italiano',
  pt: 'Portugués', ru: 'Ruso', zh: 'Chino (simplificado)', ja: 'Japonés',
  ko: 'Coreano', ar: 'Árabe', nl: 'Neerlandés', pl: 'Polaco', tr: 'Turco',
  uk: 'Ucraniano',
};

export function App() {
  const [targetLang, setTargetLang] = useState('es');

  useEffect(() => {
    void window.api.translation.getSettings().then((res) => {
      if (res.ok) setTargetLang(res.data.targetLang);
    });
  }, []);

  const handleCancel = useCallback(() => { window.close(); }, []);

  const handleTranslate = useCallback(() => {
    if (!TAB_ID) { window.close(); return; }
    // El main cierra el popup y lanza la traducción en background.
    // No llamamos window.close() aquí: lo hace el main en confirmExec.
    void window.api.translation.confirmExec({ windowId: WINDOW_ID, tabId: TAB_ID, targetLang });
  }, [targetLang]);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: 'var(--vela-bg-surface, #1c1f26)',
    border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
    borderRadius: 12,
    padding: '24px 28px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
    ...getGlassStyle(),
  };

  return (
    <>
      <style>{`
        :root {
          --vela-bg: #141519; --vela-bg-surface: #1c1f26; --vela-bg-elevated: #22252e;
          --vela-border: rgba(255,255,255,0.09); --vela-fg: #e6e8ee;
          --vela-fg-muted: #8c93a3; --vela-accent: #7D8CFF; --vela-accent-fg: #ffffff;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: transparent; overflow: visible; }
        #root { background: transparent; padding: 8px; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
               font-size: 13px; color: var(--vela-fg); -webkit-user-select: none; user-select: none; }
        select {
          background: var(--vela-bg-elevated); color: var(--vela-fg);
          border: 1px solid var(--vela-border); border-radius: 6px;
          padding: 5px 8px; font-size: 13px; font-family: inherit;
          cursor: pointer; flex: 1; outline: none;
        }
        select:focus { border-color: var(--vela-accent); }
        button:hover { filter: brightness(1.1); }
      `}</style>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--vela-accent)', display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--vela-fg)' }}>
            Traducir esta página
          </span>
        </div>

        {/* Target lang selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--vela-fg-muted)', width: 60, flexShrink: 0 }}>
            Traducir al
          </span>
          <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
            {Object.entries(LANG_NAMES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 12, color: 'var(--vela-fg-muted)', lineHeight: 1.5 }}>
          El idioma original se detectará automáticamente. Si la página ya está en{' '}
          <strong style={{ color: 'var(--vela-fg)' }}>{LANG_NAMES[targetLang] ?? targetLang}</strong>,
          se traducirá al {targetLang === 'en' ? 'Español' : 'Inglés'} automáticamente.
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '7px 16px', borderRadius: 7,
              border: '1px solid var(--vela-border)',
              background: 'var(--vela-bg-elevated)', color: 'var(--vela-fg)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleTranslate}
            disabled={!TAB_ID}
            style={{
              padding: '7px 18px', borderRadius: 7, border: 'none',
              background: 'var(--vela-accent)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: TAB_ID ? 1 : 0.5,
            }}
          >
            Traducir página
          </button>
        </div>
      </div>
    </>
  );
}
