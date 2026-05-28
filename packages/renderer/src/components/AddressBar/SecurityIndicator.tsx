import { useCallback, useRef } from 'react';
import { FileText, Lock, ShieldAlert } from 'lucide-react';
import type { ParsedScheme } from './url';
import { useRuntimeStore } from '../../stores/runtimeStore';
import velaIcon from '../../assets/vela-icon.png';

interface SecurityIndicatorProps {
  security: ParsedScheme;
  rawUrl: string;
}

export function SecurityIndicator({ security, rawUrl }: SecurityIndicatorProps) {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const handleClick = useCallback(async () => {
    if (!buttonRef.current || currentWindowId === null) return;
    const rect = buttonRef.current.getBoundingClientRect();
    await window.api.security.openPopup({
      windowId: currentWindowId,
      scheme: security.scheme ?? '',
      rawUrl,
      anchorRect: { left: rect.left, bottom: rect.bottom, width: rect.width },
    });
  }, [currentWindowId, security.scheme, rawUrl]);

  const { icon, label, color } = (() => {
    if (security.scheme === 'https') {
      return { icon: <Lock size={13} />, label: 'Conexión segura', color: 'var(--vela-secure)' };
    }
    if (security.scheme === 'http') {
      return { icon: <ShieldAlert size={13} />, label: 'No seguro', color: 'var(--vela-insecure)' };
    }
    if (security.scheme === 'file') {
      return { icon: <FileText size={13} />, label: 'Archivo local', color: 'var(--vela-addressbar-fg-muted)' };
    }
    if (security.scheme === 'vela') {
      return { icon: <img src={velaIcon} style={{ width: 13, height: 13, borderRadius: 2 }} draggable={false} />, label: 'Página interna de Vela', color: 'var(--vela-accent-strong)' };
    }
    return { icon: <ShieldAlert size={13} />, label: 'Esquema desconocido', color: 'var(--vela-addressbar-fg-muted)' };
  })();

  const showLabel = security.scheme === 'http';

  return (
    <div className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        title={label}
        aria-label={label}
        onClick={() => void handleClick()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          borderRadius: 4,
          background: 'transparent',
          color,
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: showLabel ? 600 : 400,
        }}
      >
        {icon}
        {showLabel ? <span>No seguro</span> : null}
      </button>
    </div>
  );
}
