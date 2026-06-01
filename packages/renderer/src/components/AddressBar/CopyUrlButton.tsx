import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { call } from '../../lib/ipc';
import { writeToClipboard } from '../../lib/clipboard';
import { useUrlBarStore } from '../../stores/urlBarStore';
import { URLBAR_ICON_LABELS } from '@vela/shared';
import { IconContextMenu } from './IconContextMenu';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'mc_eid', 'mc_cid',
  '_ga', 'igshid', 'ref', 'ref_src',
]);

function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function hasTrackingParams(url: string): boolean {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key)) return true;
    }
  } catch {
    // URL inválida o relativa
  }
  return false;
}

function isEmptyUrl(url: string): boolean {
  return !url || url === 'about:blank' || url === 'vela://newtab';
}

type CopyState = 'idle' | 'copied' | 'error';

const FEEDBACK_MS = 1500;

const btnBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'default',
  color: 'var(--vela-addressbar-fg-muted)',
  padding: 0,
  flexShrink: 0,
};

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M2 9H1.5C1.22 9 1 8.78 1 8.5V1.5C1 1.22 1.22 1 1.5 1H8.5C8.78 1 9 1.22 9 1.5V2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 6L5 9L10 3" stroke="var(--vela-secure)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 2L10 10M10 2L2 10" stroke="var(--vela-insecure)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LinkCleanIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M5 7L7 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3.5 8.5a2.12 2.12 0 0 1 0-3L5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8.5 3.5a2.12 2.12 0 0 1 0 3L7 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="1" y1="11" x2="4" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

interface CopyButtonProps {
  url: string;
  label: string;
  onCopy: () => Promise<void>;
  title: string;
}

function CopyButton({ url: _url, label, onCopy, title }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(async () => {
    try {
      await onCopy();
      setState('copied');
    } catch {
      setState('error');
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), FEEDBACK_MS);
  }, [onCopy]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const icon =
    state === 'copied' ? <CheckIcon /> :
    state === 'error'  ? <ErrorIcon /> :
    label === 'copy'   ? <CopyIcon /> :
    <LinkCleanIcon />;

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      style={btnBase}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      onClick={() => void handleClick()}
    >
      {icon}
    </button>
  );
}

interface CopyUrlButtonProps {
  url: string;
  editing: boolean;
}

export function CopyUrlButton({ url, editing }: CopyUrlButtonProps) {
  const [stripTracking, setStripTracking] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const isVisible = useUrlBarStore((s) => s.isVisible('copy-url'));
  const setVisible = useUrlBarStore((s) => s.setVisible);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await call(() =>
          window.api.settings.get({ key: 'addressbar:strip-tracking' }),
        );
        if (!cancelled) {
          setStripTracking(res.value !== false);
        }
      } catch {
        // mantener default true
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (editing || isEmptyUrl(url) || !isVisible) return null;

  const showClean = stripTracking && hasTrackingParams(url);

  async function copyNormal(): Promise<void> {
    await writeToClipboard(url);
  }

  async function copyClean(): Promise<void> {
    await writeToClipboard(stripTrackingParams(url));
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
      onContextMenu={handleContextMenu}
    >
      <CopyButton url={url} label="copy" onCopy={copyNormal} title="Copiar URL" />
      {showClean && (
        <CopyButton
          url={url}
          label="clean"
          onCopy={copyClean}
          title="Copiar URL sin parámetros de seguimiento"
        />
      )}
      {ctxMenu && (
        <IconContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          iconLabel={URLBAR_ICON_LABELS['copy-url']}
          onHide={() => void setVisible('copy-url', false)}
          onSettings={() => void window.api.window.openUrlInNewTab({ url: 'vela://settings#appearance' })}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
