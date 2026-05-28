import { useEffect, useState, useCallback } from 'react';
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import { BookOpen, ArrowLeft, Sun, Coffee, Moon, Minus, Plus } from 'lucide-react';
import { themeManager } from '../../shared-ui/theme';
import { call } from '../../lib/ipc';
import type { ReaderFontFamily, ReaderTheme } from '../../stores/readerStore';
import { READER_PREFS_DEFAULTS } from '../../stores/readerStore';

interface ReaderPrefs {
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
  alwaysOnDomains: string[];
}

interface ParsedArticle {
  title: string;
  byline: string | null;
  siteName: string | null;
  content: string;
}

const THEME_STYLES: Record<ReaderTheme, { bg: string; fg: string; linkColor: string }> = {
  light: { bg: '#ffffff', fg: '#1a1a1a', linkColor: '#0070f3' },
  sepia: { bg: '#f4efe6', fg: '#3b2d1e', linkColor: '#7a5c3a' },
  dark: { bg: '#1a1a1a', fg: '#e8e8e8', linkColor: '#7eb3f7' },
};

const FONT_STACKS: Record<ReaderFontFamily, string> = {
  serif: "Georgia, Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
  'sans-serif': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  monospace: "'Fira Code', 'Cascadia Code', 'Source Code Pro', Consolas, monospace",
};

const FONT_SIZES = [14, 16, 18, 20, 22] as const;

function loadPrefs(): ReaderPrefs {
  try {
    const stored = sessionStorage.getItem('reader:prefs');
    if (stored) return JSON.parse(stored) as ReaderPrefs;
  } catch {}
  return { ...READER_PREFS_DEFAULTS };
}

function savePrefs(prefs: ReaderPrefs): void {
  try {
    sessionStorage.setItem('reader:prefs', JSON.stringify(prefs));
  } catch {}
  // Also persist to settings
  void call(() => window.api.settings.set({ key: 'reader:font-family', value: prefs.fontFamily }));
  void call(() => window.api.settings.set({ key: 'reader:font-size', value: prefs.fontSize }));
  void call(() => window.api.settings.set({ key: 'reader:line-height', value: prefs.lineHeight }));
  void call(() => window.api.settings.set({ key: 'reader:theme', value: prefs.theme }));
}

export function App() {
  const [article, setArticle] = useState<ParsedArticle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefsState] = useState<ReaderPrefs>(loadPrefs);
  const [sourceUrl, setSourceUrl] = useState('');

  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  // Load settings from IPC on mount (overrides sessionStorage defaults)
  useEffect(() => {
    void call(() => window.api.settings.getAll()).then((all) => {
      setPrefsState((prev) => ({
        fontFamily:
          typeof all['reader:font-family'] === 'string'
            ? (all['reader:font-family'] as ReaderFontFamily)
            : prev.fontFamily,
        fontSize:
          typeof all['reader:font-size'] === 'number'
            ? (all['reader:font-size'] as number)
            : prev.fontSize,
        lineHeight:
          typeof all['reader:line-height'] === 'number'
            ? (all['reader:line-height'] as number)
            : prev.lineHeight,
        theme:
          typeof all['reader:theme'] === 'string'
            ? (all['reader:theme'] as ReaderTheme)
            : prev.theme,
        alwaysOnDomains: Array.isArray(all['reader:always-on-domains'])
          ? (all['reader:always-on-domains'] as string[])
          : prev.alwaysOnDomains,
      }));
    });
  }, []);

  // Parse source URL and fetch content
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const src = params.get('source') ?? '';
    setSourceUrl(src);
    if (!src) {
      setError('No se proporcionó URL de origen.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { html } = await call(() => window.api.reader.fetchHtml({ url: src }));
        if (cancelled) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Set base URL so relative links resolve correctly
        const base = doc.createElement('base');
        base.href = src;
        doc.head?.prepend(base);

        const reader = new Readability(doc, { charThreshold: 500 });
        const parsed = reader.parse();
        if (cancelled) return;
        if (!parsed || !parsed.content) {
          setError('No se pudo extraer el contenido del artículo.');
          return;
        }
        const cleanHtml = DOMPurify.sanitize(parsed.content, {
          ALLOWED_TAGS: [
            'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'img', 'ul', 'ol', 'li',
            'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'figure', 'figcaption', 'picture', 'source', 'table', 'thead',
            'tbody', 'tr', 'td', 'th', 'caption', 'sup', 'sub', 'hr', 'dl',
            'dt', 'dd', 'abbr', 'cite', 'time', 'mark',
          ],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel', 'datetime', 'srcset'],
          FORCE_BODY: true,
        });
        setArticle({
          title: parsed.title ?? '',
          byline: parsed.byline ?? null,
          siteName: parsed.siteName ?? null,
          content: cleanHtml as string,
        });
      } catch (err) {
        if (!cancelled) {
          setError(`Error al cargar: ${String(err)}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePrefs = useCallback((next: Partial<ReaderPrefs>) => {
    setPrefsState((prev) => {
      const merged = { ...prev, ...next };
      savePrefs(merged);
      return merged;
    });
  }, []);

  const handleBack = useCallback(() => {
    if (!sourceUrl) return;
    void call(() => window.api.nav.goto({ id: 'reader', url: sourceUrl }));
  }, [sourceUrl]);

  const handleAlwaysOn = useCallback(async () => {
    if (!sourceUrl) return;
    try {
      const hostname = new URL(sourceUrl).hostname;
      const domains = [...prefs.alwaysOnDomains];
      if (!domains.includes(hostname)) {
        const next = [...domains, hostname];
        updatePrefs({ alwaysOnDomains: next });
        await call(() =>
          window.api.settings.set({ key: 'reader:always-on-domains', value: next }),
        );
      }
    } catch {}
  }, [sourceUrl, prefs.alwaysOnDomains, updatePrefs]);

  const currentTheme = THEME_STYLES[prefs.theme];
  const fontSizeIndex = FONT_SIZES.indexOf(prefs.fontSize as (typeof FONT_SIZES)[number]);

  const decreaseFont = useCallback(() => {
    const idx = FONT_SIZES.indexOf(prefs.fontSize as (typeof FONT_SIZES)[number]);
    if (idx > 0) updatePrefs({ fontSize: FONT_SIZES[idx - 1] });
  }, [prefs.fontSize, updatePrefs]);

  const increaseFont = useCallback(() => {
    const idx = FONT_SIZES.indexOf(prefs.fontSize as (typeof FONT_SIZES)[number]);
    if (idx < FONT_SIZES.length - 1) updatePrefs({ fontSize: FONT_SIZES[idx + 1] });
  }, [prefs.fontSize, updatePrefs]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: currentTheme.bg,
        color: currentTheme.fg,
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      {/* Controls bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          borderBottom: `1px solid ${prefs.theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
          background: currentTheme.bg,
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Back button */}
        <button
          type="button"
          onClick={handleBack}
          title="Volver al original"
          style={iconBtnStyle(prefs.theme)}
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          <span style={{ fontSize: 13, marginLeft: 4 }}>Volver</span>
        </button>

        <div style={{ flex: 1 }} />

        {/* Reader icon */}
        <BookOpen size={16} strokeWidth={1.5} style={{ opacity: 0.5 }} />

        <div style={separatorStyle(prefs.theme)} />

        {/* Font family */}
        <select
          value={prefs.fontFamily}
          onChange={(e) => updatePrefs({ fontFamily: e.target.value as ReaderFontFamily })}
          style={selectStyle(prefs.theme)}
          title="Tipografía"
        >
          <option value="serif">Serif</option>
          <option value="sans-serif">Sans-serif</option>
          <option value="monospace">Monospace</option>
        </select>

        <div style={separatorStyle(prefs.theme)} />

        {/* Font size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={decreaseFont}
            disabled={fontSizeIndex <= 0}
            style={iconBtnStyle(prefs.theme, fontSizeIndex <= 0)}
            title="Reducir fuente"
          >
            <Minus size={14} strokeWidth={2} />
          </button>
          <span style={{ fontSize: 13, minWidth: 28, textAlign: 'center', opacity: 0.8 }}>
            {prefs.fontSize}
          </span>
          <button
            type="button"
            onClick={increaseFont}
            disabled={fontSizeIndex >= FONT_SIZES.length - 1}
            style={iconBtnStyle(prefs.theme, fontSizeIndex >= FONT_SIZES.length - 1)}
            title="Aumentar fuente"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>

        <div style={separatorStyle(prefs.theme)} />

        {/* Theme */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ThemeBtn
            active={prefs.theme === 'light'}
            onClick={() => updatePrefs({ theme: 'light' })}
            title="Tema claro"
            readerTheme={prefs.theme}
          >
            <Sun size={14} strokeWidth={1.5} />
          </ThemeBtn>
          <ThemeBtn
            active={prefs.theme === 'sepia'}
            onClick={() => updatePrefs({ theme: 'sepia' })}
            title="Tema sepia"
            readerTheme={prefs.theme}
          >
            <Coffee size={14} strokeWidth={1.5} />
          </ThemeBtn>
          <ThemeBtn
            active={prefs.theme === 'dark'}
            onClick={() => updatePrefs({ theme: 'dark' })}
            title="Tema oscuro"
            readerTheme={prefs.theme}
          >
            <Moon size={14} strokeWidth={1.5} />
          </ThemeBtn>
        </div>

        <div style={separatorStyle(prefs.theme)} />

        {/* Always-on domain */}
        <button
          type="button"
          onClick={() => void handleAlwaysOn()}
          title="Activar siempre para este dominio"
          style={{
            ...iconBtnStyle(prefs.theme),
            fontSize: 12,
            padding: '3px 8px',
          }}
        >
          Siempre aquí
        </button>
      </div>

      {/* Article content */}
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '40px 24px 80px',
          fontFamily: FONT_STACKS[prefs.fontFamily],
          fontSize: prefs.fontSize,
          lineHeight: prefs.lineHeight,
          color: currentTheme.fg,
        }}
      >
        {loading && (
          <div style={{ textAlign: 'center', opacity: 0.5, paddingTop: 60 }}>
            Cargando artículo…
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              textAlign: 'center',
              opacity: 0.6,
              paddingTop: 60,
              fontSize: 15,
            }}
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={handleBack}
              style={{ marginTop: 16, ...iconBtnStyle(prefs.theme), fontSize: 14 }}
            >
              Volver a la página original
            </button>
          </div>
        )}

        {article && !loading && (
          <>
            <h1
              style={{
                fontFamily: FONT_STACKS[prefs.fontFamily],
                fontSize: prefs.fontSize * 1.8,
                lineHeight: 1.25,
                fontWeight: 700,
                marginBottom: 12,
                color: currentTheme.fg,
              }}
            >
              {article.title}
            </h1>

            {(article.byline ?? article.siteName) ? (
              <div
                style={{
                  fontSize: prefs.fontSize * 0.85,
                  opacity: 0.6,
                  marginBottom: 32,
                  lineHeight: 1.4,
                }}
              >
                {article.byline ?? article.siteName}
              </div>
            ) : null}

            <hr
              style={{
                border: 'none',
                borderTop: `1px solid ${prefs.theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                marginBottom: 32,
              }}
            />

            {/* Injected article HTML */}
            <div
              className="reader-content"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: article.content }}
              style={
                {
                  '--reader-link-color': currentTheme.linkColor,
                  '--reader-fg': currentTheme.fg,
                  '--reader-font': FONT_STACKS[prefs.fontFamily],
                  '--reader-fs': `${String(prefs.fontSize)}px`,
                  '--reader-lh': String(prefs.lineHeight),
                } as React.CSSProperties
              }
            />
          </>
        )}
      </div>

      {/* Reader content styles */}
      <style>{`
        .reader-content {
          color: var(--reader-fg);
          font-family: var(--reader-font);
          font-size: var(--reader-fs);
          line-height: var(--reader-lh);
        }
        .reader-content p { margin: 0 0 1.2em; }
        .reader-content h1, .reader-content h2, .reader-content h3,
        .reader-content h4, .reader-content h5, .reader-content h6 {
          font-weight: 700;
          line-height: 1.25;
          margin: 1.8em 0 0.6em;
          color: var(--reader-fg);
        }
        .reader-content h1 { font-size: 1.7em; }
        .reader-content h2 { font-size: 1.4em; }
        .reader-content h3 { font-size: 1.2em; }
        .reader-content a { color: var(--reader-link-color); text-decoration: underline; }
        .reader-content a:hover { opacity: 0.8; }
        .reader-content img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 1.5em auto;
          border-radius: 4px;
        }
        .reader-content figure { margin: 1.5em 0; }
        .reader-content figcaption {
          font-size: 0.85em;
          opacity: 0.6;
          text-align: center;
          margin-top: 6px;
        }
        .reader-content blockquote {
          border-left: 3px solid var(--reader-link-color);
          margin: 1.5em 0;
          padding: 0.5em 1em;
          opacity: 0.85;
          font-style: italic;
        }
        .reader-content pre {
          background: rgba(127,127,127,0.12);
          padding: 1em;
          border-radius: 6px;
          overflow-x: auto;
          font-size: 0.9em;
          line-height: 1.5;
        }
        .reader-content code {
          background: rgba(127,127,127,0.12);
          padding: 0.15em 0.35em;
          border-radius: 3px;
          font-size: 0.9em;
        }
        .reader-content pre code { background: none; padding: 0; }
        .reader-content ul, .reader-content ol { padding-left: 1.5em; margin: 0 0 1.2em; }
        .reader-content li { margin-bottom: 0.4em; }
        .reader-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5em 0;
          font-size: 0.9em;
        }
        .reader-content th, .reader-content td {
          padding: 8px 12px;
          border: 1px solid rgba(127,127,127,0.2);
          text-align: left;
        }
        .reader-content th { font-weight: 600; background: rgba(127,127,127,0.08); }
        .reader-content hr {
          border: none;
          border-top: 1px solid rgba(127,127,127,0.2);
          margin: 2em 0;
        }
      `}</style>
    </div>
  );
}

function iconBtnStyle(theme: ReaderTheme, disabled = false): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 6,
    border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
    background: 'transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: theme === 'dark' ? '#e8e8e8' : '#1a1a1a',
    opacity: disabled ? 0.4 : 1,
    fontSize: 13,
    lineHeight: 1,
    transition: 'background 0.15s',
  };
}

function selectStyle(theme: ReaderTheme): React.CSSProperties {
  return {
    padding: '3px 6px',
    borderRadius: 6,
    border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
    background: 'transparent',
    color: theme === 'dark' ? '#e8e8e8' : '#1a1a1a',
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none',
  };
}

function separatorStyle(theme: ReaderTheme): React.CSSProperties {
  return {
    width: 1,
    height: 20,
    background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    margin: '0 4px',
  };
}

function ThemeBtn({
  active,
  onClick,
  title,
  readerTheme,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  readerTheme: ReaderTheme;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        border: active
          ? `2px solid ${readerTheme === 'dark' ? '#7eb3f7' : '#0070f3'}`
          : `1px solid ${readerTheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
        background: active
          ? readerTheme === 'dark'
            ? 'rgba(126,179,247,0.15)'
            : 'rgba(0,112,243,0.08)'
          : 'transparent',
        cursor: 'pointer',
        color: readerTheme === 'dark' ? '#e8e8e8' : '#1a1a1a',
        transition: 'border 0.15s, background 0.15s',
      }}
    >
      {children}
    </button>
  );
}
