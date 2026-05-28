export const THEME_VARS = {
  // Colores base
  '--vela-bg': '#0e0f12',
  '--vela-bg-elevated': '#1c1f25',
  '--vela-fg': '#e6e8ee',
  '--vela-fg-muted': '#8c93a3',
  '--vela-border': 'rgba(255, 255, 255, 0.08)',

  // Sidebar
  '--vela-sidebar-bg': '#16181d',
  '--vela-sidebar-fg': '#e6e8ee',
  '--vela-sidebar-active-bg': 'rgba(120, 140, 255, 0.16)',
  '--vela-sidebar-hover-bg': 'rgba(255, 255, 255, 0.05)',

  // Title bar
  '--vela-titlebar-bg': '#1a1a1a',
  '--vela-titlebar-fg': '#e0e0e0',
  '--vela-titlebar-button-hover': 'rgba(255, 255, 255, 0.1)',

  // URL bar
  '--vela-addressbar-bg': '#16181d',
  '--vela-addressbar-border': 'rgba(255, 255, 255, 0.10)',
  '--vela-addressbar-fg': '#e6e8ee',
  '--vela-addressbar-fg-muted': '#8c93a3',
  '--vela-suggestion-bg': '#1c1f25',
  '--vela-suggestion-bg-active': 'rgba(125, 140, 255, 0.18)',

  // Estados
  '--vela-accent': '#7d8cff',
  '--vela-accent-fg': '#ffffff',
  '--vela-success': '#6ad8a4',
  '--vela-warning': '#f5c76a',
  '--vela-danger': '#ff8a8a',

  // Tabs
  '--vela-tab-active-bg': 'rgba(125, 140, 255, 0.18)',
  '--vela-tab-active-fg': '#ffffff',
  '--vela-tab-discarded-opacity': '0.5',
  '--vela-folder-marker-w': '3px',

  // Tipografía
  '--vela-font-family': 'system-ui, sans-serif',
  '--vela-font-size': '14px',

  // Layout
  '--vela-radius-sm': '4px',
  '--vela-radius-md': '8px',
  '--vela-radius-lg': '12px',

  // Glassmorphism (sidebar material)
  '--sidebar-backdrop-filter': 'none',
  '--sidebar-background-opacity': '1',
  '--sidebar-background-color': 'var(--vela-sidebar-bg)',
} as const;

export type ThemeVarKey = keyof typeof THEME_VARS;
