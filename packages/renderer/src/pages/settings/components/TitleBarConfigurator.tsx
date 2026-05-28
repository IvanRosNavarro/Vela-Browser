import { TITLEBAR_ICON_LABELS, type TitleBarIconId } from '@vela/shared';
import { useTitleBarIconStore } from '../../../stores/titleBarIconStore';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', padding: '2px',
        background: value ? 'var(--vela-accent)' : 'var(--vela-border)',
        cursor: 'pointer', transition: 'background 200ms', flexShrink: 0,
        display: 'flex', alignItems: 'center',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transform: value ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform 200ms',
      }} />
    </button>
  );
}

export function TitleBarConfigurator() {
  const iconConfig = useTitleBarIconStore((s) => s.iconConfig);
  const setVisible = useTitleBarIconStore((s) => s.setVisible);

  return (
    <div>
      {iconConfig.map((config) => (
        <div
          key={config.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--vela-border)',
            background: 'var(--vela-bg-surface)',
            marginBottom: 4,
          }}
        >
          <span style={{ flex: 1, fontSize: 12, color: 'var(--vela-fg)' }}>
            {TITLEBAR_ICON_LABELS[config.id as TitleBarIconId]}
          </span>
          <Toggle
            value={config.visible}
            onChange={(v) => void setVisible(config.id, v)}
          />
        </div>
      ))}
    </div>
  );
}
