import { useState } from 'react';
import {
  Settings2, Palette, Layers, Search, User, Shield,
  Keyboard, Puzzle, Sparkles, Info, ShieldOff, LockKeyhole, Anchor, Cloud,
} from 'lucide-react';
import type { Section } from '../lib/router';

interface NavItem {
  id: Section;
  label: string;
  icon: React.ElementType;
  keywords: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'general',
    label: 'General',
    icon: Settings2,
    keywords: ['inicio', 'arranque', 'idioma', 'actualizaciones', 'restaurar', 'startup'],
  },
  {
    id: 'appearance',
    label: 'Aspecto',
    icon: Palette,
    keywords: [
      'tema', 'temas', 'oscuro', 'claro', 'colores', 'fuente', 'tipografía', 'font',
      'sidebar', 'compacto', 'indentación', 'densidad', 'css', 'glassmorphism',
      'efecto', 'transparencia', 'ancho', 'personalizado', 'custom',
    ],
  },
  {
    id: 'tabs',
    label: 'Pestañas',
    icon: Layers,
    keywords: [
      'pestaña', 'pestañas', 'ctrl+tab', 'ctrl tab', 'descartar', 'auto-descartado',
      'grupos', 'árbol', 'carpeta', 'workspace', 'nueva pestaña', 'fijadas',
      'formularios', 'whitelist', 'lista blanca', 'colapsar', 'mru', 'historial reciente',
    ],
  },
  {
    id: 'search',
    label: 'Búsqueda',
    icon: Search,
    keywords: [
      'buscador', 'motor', 'google', 'duckduckgo', 'bing', 'kagi', 'sugerencias',
      'alias', 'personalizado', 'custom engine',
    ],
  },
  {
    id: 'profile',
    label: 'Perfil',
    icon: User,
    keywords: [
      'perfil', 'nombre', 'contraseña', 'maestra', 'avatar', 'color', 'eliminar',
    ],
  },
  {
    id: 'privacy',
    label: 'Privacidad',
    icon: Shield,
    keywords: [
      'privacidad', 'cookies', 'rastreo', 'do not track', 'dnt', 'dns', 'https',
      'notificaciones', 'permisos', 'push', 'historial', 'caché', 'limpiar', 'datos',
    ],
  },
  {
    id: 'shortcuts',
    label: 'Atajos',
    icon: Keyboard,
    keywords: [
      'atajos', 'teclado', 'shortcut', 'keybinding', 'hotkey', 'ctrl', 'combinación',
    ],
  },
  {
    id: 'extensions',
    label: 'Extensiones',
    icon: Puzzle,
    keywords: [
      'extensiones', 'extension', 'addon', 'plugin', 'chrome', 'crx', 'instalar',
    ],
  },
  {
    id: 'aparejos',
    label: 'Aparejos',
    icon: Anchor,
    keywords: [
      'aparejos', 'aparejo', 'izar', 'arriar', 'bloqueador', 'cookies', 'motor', 'nativo',
    ],
  },
  {
    id: 'ai',
    label: 'IA',
    icon: Sparkles,
    keywords: [
      'ia', 'inteligencia artificial', 'ai', 'claude', 'chatgpt', 'ollama', 'resumen',
      'traducir', 'traducción', 'semántica', 'chat', 'llm', 'modelo',
    ],
  },
  {
    id: 'adblocker',
    label: 'Bloqueador',
    icon: ShieldOff,
    keywords: [
      'bloqueador', 'anuncios', 'ads', 'adblocker', 'trackers', 'easylist',
      'filtros', 'excepciones', 'whitelist', 'privacidad',
    ],
  },
  {
    id: 'security',
    label: 'Seguridad',
    icon: LockKeyhole,
    keywords: [
      'contraseñas', 'gestor', 'vault', 'passwords', 'autorrelleno', 'autofill',
      'credenciales', 'login', 'guardar', 'llave', 'clave', 'seguridad',
    ],
  },
  {
    id: 'sync',
    label: 'Sincronización',
    icon: Cloud,
    keywords: [
      'sync', 'sincronización', 'sincronizar', 'nube', 'dispositivos', 'email',
      'contraseña sync', 'recovery', 'recuperación', 'e2ee', 'cifrado',
    ],
  },
  {
    id: 'about',
    label: 'Acerca de',
    icon: Info,
    keywords: [
      'versión', 'electron', 'chromium', 'node', 'licencia', 'gpl', 'acerca',
    ],
  },
];

interface Props {
  section: Section;
  onNavigate: (s: Section) => void;
}

export function SettingsSidebar({ section, onNavigate }: Props) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? NAV_ITEMS.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.keywords.some((k) => k.includes(q)),
      )
    : NAV_ITEMS;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--vela-border)] bg-[var(--vela-bg-surface)]">
      <div className="p-4">
        <h1 className="mb-3 text-sm font-semibold text-[var(--vela-fg)]">
          Configuración
        </h1>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--vela-fg-muted)]" />
          <input
            type="search"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] py-1.5 pl-7 pr-3 text-xs text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] outline-none focus:border-[var(--vela-accent)]"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {filtered.map((item) => {
          const Icon = item.icon;
          const active = item.id === section;
          return (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setQuery(''); }}
              className={[
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-[var(--vela-accent)]/15 font-medium text-[var(--vela-accent)]'
                  : 'text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-[var(--vela-fg-muted)]">
            Sin resultados
          </p>
        )}
      </nav>
    </aside>
  );
}
