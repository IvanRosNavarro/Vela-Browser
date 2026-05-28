import { icons as lucideIcons } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import {
  buildLucideValue,
  isLucideIcon,
  lucideName,
} from '../WorkspaceSwitcher/WorkspaceIcon';

export { buildLucideValue, isLucideIcon, lucideName };

export interface ProfileBadgeProps {
  icon: string | null | undefined;
  fallbackName: string;
  background?: string | null;
  size?: number;
  className?: string;
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

/**
 * Avatar circular del perfil. Reutiliza la convención lucide:* del
 * WorkspaceIcon, pero el contorno es un círculo (border-radius 50%) para
 * distinguir visualmente perfil de workspace.
 */
export function ProfileBadge({
  icon,
  fallbackName,
  background,
  size = 24,
  className,
}: ProfileBadgeProps) {
  const fallback = (fallbackName?.charAt(0) ?? '·').toUpperCase();
  const styleBase: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: Math.max(11, Math.floor(size * 0.5)),
    fontWeight: 600,
    color: 'var(--vela-fg)',
    background:
      background ?? 'var(--vela-bg-folder-hover)',
  };

  if (icon && isLucideIcon(icon)) {
    const Icon = getLucideComponent(lucideName(icon));
    if (Icon) {
      return (
        <span aria-hidden className={className} style={styleBase}>
          <Icon
            width={Math.floor(size * 0.55)}
            height={Math.floor(size * 0.55)}
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
