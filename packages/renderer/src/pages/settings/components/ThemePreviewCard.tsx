import { Check } from 'lucide-react';
import type { Theme } from '@vela/shared';

interface Props {
  theme: Theme;
  selected: boolean;
  onClick: () => void;
}

export function ThemePreviewCard({ theme, selected, onClick }: Props) {
  const v = theme.variables;

  const bg = v['--vela-bg'] ?? '#1a1a1a';
  const sidebarBg = v['--vela-sidebar-bg'] ?? '#16181d';
  const titlebarBg = v['--vela-titlebar-bg'] ?? '#111';
  const titlebarFg = v['--vela-titlebar-fg'] ?? '#eee';
  const fg = v['--vela-fg'] ?? '#eee';
  const fgMuted = v['--vela-fg-muted'] ?? '#888';
  const accent = v['--vela-accent'] ?? '#7d8cff';
  const activeRowBg = v['--vela-sidebar-active-bg'] ?? 'rgba(120,140,255,0.16)';
  const border = v['--vela-border'] ?? 'rgba(255,255,255,0.08)';

  return (
    <button
      onClick={onClick}
      title={theme.name}
      className={[
        'relative flex flex-col overflow-hidden rounded-lg border-2 transition-all',
        'hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vela-accent)]',
        selected
          ? 'border-[var(--vela-accent)] shadow-lg'
          : 'border-transparent hover:border-[var(--vela-border)]',
      ].join(' ')}
      style={{ width: 160, height: 100 }}
    >
      {/* Title bar mini */}
      <div
        className="flex shrink-0 items-center gap-1 px-2"
        style={{ height: 16, background: titlebarBg }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: '#ff5f57', opacity: 0.8 }}
        />
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: '#febc2e', opacity: 0.8 }}
        />
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: '#28c840', opacity: 0.8 }}
        />
        <div
          className="mx-auto h-1.5 w-16 rounded-full"
          style={{ background: border }}
        />
        <span className="text-[6px] leading-none" style={{ color: titlebarFg, opacity: 0.7 }}>
          Aa
        </span>
      </div>

      {/* Cuerpo: sidebar + contenido */}
      <div className="flex flex-1" style={{ background: bg }}>
        {/* Sidebar mini */}
        <div
          className="flex shrink-0 flex-col gap-0.5 p-1"
          style={{ width: 44, background: sidebarBg, borderRight: `1px solid ${border}` }}
        >
          {/* Ítem activo */}
          <div
            className="flex items-center gap-1 rounded px-1"
            style={{ height: 10, background: activeRowBg }}
          >
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: accent }} />
            <span className="h-1 w-10 rounded" style={{ background: fg, opacity: 0.7 }} />
          </div>
          {/* Ítems inactivos */}
          {[0.5, 0.35, 0.5].map((op, i) => (
            <div key={i} className="flex items-center gap-1 px-1" style={{ height: 10 }}>
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: fgMuted, opacity: op }} />
              <span className="h-1 w-8 rounded" style={{ background: fgMuted, opacity: op * 0.7 }} />
            </div>
          ))}
        </div>

        {/* Área de contenido */}
        <div className="flex flex-1 flex-col gap-1 p-2">
          <div className="h-1.5 w-16 rounded" style={{ background: fg, opacity: 0.6 }} />
          <div className="h-1 w-12 rounded" style={{ background: fgMuted, opacity: 0.4 }} />
          <div className="mt-1 h-1 w-14 rounded" style={{ background: fgMuted, opacity: 0.3 }} />
          <div className="h-1 w-10 rounded" style={{ background: fgMuted, opacity: 0.3 }} />
        </div>
      </div>

      {/* Nombre del tema */}
      <div
        className="absolute bottom-0 left-0 right-0 px-2 py-1 text-center text-[9px] font-medium"
        style={{ background: `${sidebarBg}cc`, color: fg }}
      >
        {theme.name}
      </div>

      {/* Checkmark seleccionado */}
      {selected && (
        <div
          className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full"
          style={{ background: accent }}
        >
          <Check className="h-2.5 w-2.5" style={{ color: '#fff' }} strokeWidth={3} />
        </div>
      )}
    </button>
  );
}
