import { useState } from 'react';
import ReactDOM from 'react-dom';
import { Rss, FileInput, Volume2 } from 'lucide-react';
import type { PageFeature } from '../../stores/pageFeatureStore';

interface FeatureIconProps {
  feature: PageFeature;
}

type LucideIconComponent = React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;

const FEATURE_CONFIG: Record<PageFeature, { Icon: LucideIconComponent; tooltip: string }> = {
  rss:   { Icon: Rss as LucideIconComponent,       tooltip: 'Esta página tiene un feed RSS' },
  form:  { Icon: FileInput as LucideIconComponent, tooltip: 'Hay un formulario en esta página' },
  media: { Icon: Volume2 as LucideIconComponent,   tooltip: 'Hay medios reproduciéndose' },
};

function FeatureIcon({ feature }: FeatureIconProps) {
  const { Icon, tooltip } = FEATURE_CONFIG[feature];
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: rect.left });
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon
        size={14}
        style={{ color: 'var(--vela-addressbar-fg-muted)', opacity: 0.7 }}
      />
      {hovered && pos &&
        ReactDOM.createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
              padding: '3px 8px',
              borderRadius: 4,
              background: 'var(--vela-bg-sidebar-elev)',
              border: '1px solid var(--vela-border-strong)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              fontSize: 11,
              color: 'var(--vela-fg)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {tooltip}
          </div>,
          document.body,
        )}
    </span>
  );
}

interface PageFeatureIndicatorsProps {
  features: PageFeature[];
}

export function PageFeatureIndicators({ features }: PageFeatureIndicatorsProps) {
  if (features.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {features.map((f) => (
        <FeatureIcon key={f} feature={f} />
      ))}
    </div>
  );
}
