import { useCallback, useEffect, type CSSProperties } from 'react';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useTranslationStore, type TranslationStatus } from '../../stores/translationStore';

const btnBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  position: 'relative',
};

function GlobeIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={filled ? 'var(--vela-accent)' : 'none'}
      stroke={filled ? 'var(--vela-accent)' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function getIconForStatus(status: TranslationStatus) {
  if (status === 'translated') {
    return <GlobeIcon filled />;
  }
  // 'suggested': globo normal con punto acento
  return (
    <>
      <GlobeIcon />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: 1,
          right: 1,
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'var(--vela-accent)',
        }}
      />
    </>
  );
}

interface Props {
  editing: boolean;
}

export function TranslateButton({ editing }: Props) {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );
  const status = useTranslationStore((s) =>
    activeTabId ? (s.statusByTab[activeTabId] ?? 'neutral') : 'neutral',
  );

  // Detectar idioma de la página cada vez que cambia la tab activa
  useEffect(() => {
    if (!activeTabId) return;
    void window.api.translation.detectLang({ tabId: activeTabId });
  }, [activeTabId]);

  const handleClick = useCallback(() => {
    if (!currentWindowId || !activeTabId) return;
    if (status === 'translated') {
      void window.api.translation.revertPage({ tabId: activeTabId });
    } else {
      void window.api.translation.openConfirmPopup({ windowId: currentWindowId });
    }
  }, [currentWindowId, activeTabId, status]);

  // neutral = mismo idioma que el destino → ocultar icono
  if (editing || status === 'neutral') return null;

  const title =
    status === 'translated'
      ? 'Página traducida — clic para restaurar el idioma original'
      : 'Traducir esta página';

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      style={btnBase}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
      onClick={handleClick}
    >
      {getIconForStatus(status)}
    </button>
  );
}
