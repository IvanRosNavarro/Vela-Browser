import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const WINDOW_ID = parseInt(params.get('windowId') ?? '0', 10);

const LANG_NAMES: Record<string, string> = {
  auto: 'Detectar automático',
  af: 'Afrikáans', sq: 'Albanés', ar: 'Árabe', zh: 'Chino (simplificado)',
  'zh-TW': 'Chino (tradicional)', hr: 'Croata', cs: 'Checo', da: 'Danés',
  nl: 'Neerlandés', en: 'Inglés', fi: 'Finlandés', fr: 'Francés',
  de: 'Alemán', el: 'Griego', he: 'Hebreo', hi: 'Hindi', hu: 'Húngaro',
  id: 'Indonesio', it: 'Italiano', ja: 'Japonés', ko: 'Coreano',
  no: 'Noruego', pl: 'Polaco', pt: 'Portugués', ro: 'Rumano',
  ru: 'Ruso', sk: 'Eslovaco', es: 'Español', sv: 'Sueco',
  th: 'Tailandés', tr: 'Turco', uk: 'Ucraniano', vi: 'Vietnamita',
};

const TARGET_LANGS = Object.keys(LANG_NAMES).filter((k) => k !== 'auto');
const SOURCE_LANGS_WITH_AUTO = Object.keys(LANG_NAMES);

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

interface TranslationData {
  translatedText: string;
  detectedLang: string;
  sourceLang: string;
  targetLang: string;
  originalText: string;
}

function readParams(): TranslationData {
  return {
    translatedText: params.get('translatedText') ?? '',
    detectedLang: params.get('detectedLang') ?? 'und',
    sourceLang: params.get('sourceLang') ?? 'auto',
    targetLang: params.get('targetLang') ?? 'es',
    originalText: params.get('originalText') ?? '',
  };
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function RetranslateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

const btnBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 4, padding: '4px 10px', border: 'none', borderRadius: 6,
  background: 'var(--vela-bg-elevated)', color: 'var(--vela-fg)',
  cursor: 'pointer', fontSize: 12, fontWeight: 500,
  transition: 'background 80ms',
};

const iconBtnBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, border: 'none', borderRadius: 5,
  background: 'transparent', color: 'var(--vela-fg-muted)',
  cursor: 'pointer', padding: 0, flexShrink: 0,
};

export function App() {
  const initial = readParams();
  const [data, setData] = useState<TranslationData>(initial);
  const [expanded, setExpanded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedSource, setSelectedSource] = useState(
    initial.sourceLang === 'auto' ? 'auto' : initial.sourceLang,
  );
  const [selectedTarget, setSelectedTarget] = useState(initial.targetLang);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sendResize = useCallback(() => {
    if (!rootRef.current) return;
    // getBoundingClientRect da la altura visual real (no la del scroll oculto).
    // +16 cubre el padding:8px del #root (arriba + abajo) para que la sombra se vea.
    const h = Math.ceil(rootRef.current.getBoundingClientRect().height);
    void window.api.translation.resizePopup({ windowId: WINDOW_ID, height: h + 16 });
  }, []);

  useLayoutEffect(() => {
    sendResize();
  }, [expanded, textExpanded, data, sendResize]);

  function checkOverflow() {
    const el = document.getElementById('translated-text');
    if (el) setShowMore(el.scrollHeight > el.clientHeight);
  }

  useEffect(() => {
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [data.translatedText]);

  const doClose = useCallback(() => {
    void window.api.translation.copyAndClose({ windowId: WINDOW_ID });
    window.close();
  }, []);

  const doCopy = useCallback(async () => {
    // Usar el canal IPC de clipboard (más fiable en BrowserWindow popup que navigator.clipboard)
    try {
      await window.api.clipboard.writeText(data.translatedText);
    } catch {
      // Fallback execCommand para contextos sin permisos de clipboard
      try {
        const ta = document.createElement('textarea');
        ta.value = data.translatedText;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* ignorar */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    void window.api.translation.copyAndClose({ windowId: WINDOW_ID });
    window.close();
  }, [data.translatedText]);

  const doRetranslate = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await window.api.translation.translate({
        text: data.originalText,
        targetLang: selectedTarget,
        sourceLang: selectedSource === 'auto' ? undefined : selectedSource,
      });
      if (res.ok) {
        setData({ ...res.data });
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [data.originalText, selectedSource, selectedTarget]);

  const containerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column',
    background: 'var(--vela-bg-surface, #1c1f26)',
    border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
    borderRadius: 10,
    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
    overflow: 'hidden',
    animation: 'fadeIn 150ms ease-out',
    ...getGlassStyle(),
  };

  const detectedName = langName(data.detectedLang);

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        select {
          background: var(--vela-bg-elevated, #22252e);
          color: var(--vela-fg, #e6e8ee);
          border: 1px solid var(--vela-border, rgba(255,255,255,0.09));
          border-radius: 5px;
          padding: 3px 6px;
          font-size: 12px;
          font-family: inherit;
          cursor: pointer;
          flex: 1;
          min-width: 0;
          outline: none;
        }
        select:focus { border-color: var(--vela-accent, #7D8CFF); }
        button:hover { filter: brightness(1.1); }
      `}</style>
      <div ref={rootRef} style={containerStyle}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderBottom: '1px solid var(--vela-border)',
        }}>
          <span style={{ color: 'var(--vela-accent)', flexShrink: 0 }}><GlobeIcon /></span>
          <span style={{ fontSize: 12, color: 'var(--vela-fg-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {expanded ? 'Traducción' : `Traducido del ${detectedName}`}
          </span>
          <button
            type="button"
            aria-label="Cerrar"
            style={iconBtnBase}
            onClick={doClose}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Expanded mode: lang selectors */}
        {expanded && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--vela-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 50, flexShrink: 0 }}>Origen</span>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
              >
                {SOURCE_LANGS_WITH_AUTO.map((code) => (
                  <option key={code} value={code}>{langName(code)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 50, flexShrink: 0 }}>Destino</span>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
              >
                {TARGET_LANGS.map((code) => (
                  <option key={code} value={code}>{langName(code)}</option>
                ))}
              </select>
              <button
                type="button"
                title="Retraducir"
                aria-label="Retraducir"
                style={{ ...iconBtnBase, color: 'var(--vela-fg)', background: 'var(--vela-bg-elevated)', padding: '4px 8px', width: 'auto', borderRadius: 5 }}
                onClick={() => void doRetranslate()}
                disabled={loading}
              >
                <RetranslateIcon />
              </button>
            </div>
          </div>
        )}

        {/* Body: translated text */}
        <div style={{ padding: '8px 12px' }}>
          {error ? (
            <div style={{ color: 'var(--vela-fg-muted)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
              No se pudo traducir. Inténtalo de nuevo.
              <br />
              <button
                type="button"
                style={{ ...btnBase, marginTop: 6 }}
                onClick={() => void doRetranslate()}
              >
                Reintentar
              </button>
            </div>
          ) : loading ? (
            <div style={{ color: 'var(--vela-fg-muted)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
              Traduciendo…
            </div>
          ) : (
            <>
              <div
                id="translated-text"
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--vela-fg)',
                  overflowY: expanded || textExpanded ? 'auto' : 'hidden',
                  maxHeight: expanded || textExpanded ? 200 : 63,
                  wordBreak: 'break-word',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  cursor: 'text',
                }}
              >
                {data.translatedText}
              </div>
              {!expanded && showMore && !textExpanded && (
                <button
                  type="button"
                  style={{ ...btnBase, background: 'transparent', color: 'var(--vela-accent)', padding: '2px 0', marginTop: 2, fontSize: 11 }}
                  onClick={() => { setTextExpanded(true); }}
                >
                  ver más
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 12px 8px',
          borderTop: '1px solid var(--vela-border)',
          gap: 8,
        }}>
          <button
            type="button"
            style={btnBase}
            onClick={() => { setExpanded(!expanded); setTextExpanded(false); }}
          >
            {expanded ? '⌃ Cerrar edición' : '⇄ Editar'}
          </button>
          <button
            type="button"
            style={{ ...btnBase, background: 'var(--vela-accent)', color: 'var(--vela-accent-fg)' }}
            onClick={() => void doCopy()}
          >
            <CopyIcon />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
    </>
  );
}
