import { icons as lucideIcons } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

const LUCIDE_PREFIX = 'lucide:';

export interface WorkspaceIconProps {
  icon: string | null | undefined;
  fallbackName: string;
  size?: number;
  className?: string;
  /**
   * Color de fondo. Si no se pasa, no se aplica fondo.
   */
  background?: string | null;
}

function getLucideComponent(
  name: string,
): ComponentType<SVGProps<SVGSVGElement>> | null {
  const Component = (lucideIcons as Record<
    string,
    ComponentType<SVGProps<SVGSVGElement>>
  >)[name];
  return Component ?? null;
}

export function isLucideIcon(value: string): boolean {
  return value.startsWith(LUCIDE_PREFIX);
}

export function lucideName(value: string): string {
  return value.slice(LUCIDE_PREFIX.length);
}

export function buildLucideValue(name: string): string {
  return `${LUCIDE_PREFIX}${name}`;
}

export function WorkspaceIcon({
  icon,
  fallbackName,
  size = 24,
  className,
  background,
}: WorkspaceIconProps) {
  const fallback = (fallbackName?.charAt(0) ?? '·').toUpperCase();
  const styleBase: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: Math.max(11, Math.floor(size * 0.55)),
    fontWeight: 600,
    color: 'var(--vela-fg)',
  };
  if (background !== undefined && background !== null) {
    styleBase.background = background;
  } else if (background === null) {
    styleBase.background = 'var(--vela-bg-folder-hover)';
  }

  if (icon && isLucideIcon(icon)) {
    const Icon = getLucideComponent(lucideName(icon));
    if (Icon) {
      return (
        <span aria-hidden className={className} style={styleBase}>
          <Icon
            width={Math.floor(size * 0.6)}
            height={Math.floor(size * 0.6)}
            strokeWidth={2}
          />
        </span>
      );
    }
  }

  return (
    <span aria-hidden className={className} style={styleBase}>
      {icon && !isLucideIcon(icon) ? icon : fallback}
    </span>
  );
}
