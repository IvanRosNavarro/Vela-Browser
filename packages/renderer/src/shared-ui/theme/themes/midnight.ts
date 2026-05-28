import type { Theme } from '@vela/shared';

// Paleta propia: azul-negro profundo con acentos azul-violeta fríos.
export const midnightTheme: Theme = {
  id: 'midnight',
  name: 'Vela Midnight',
  type: 'dark',
  builtin: true,
  variables: {
    '--vela-bg': '#080b14',
    '--vela-bg-elevated': '#111829',
    '--vela-fg': '#c8d3f5',
    '--vela-fg-muted': '#7a8ab5',
    '--vela-border': 'rgba(100, 130, 255, 0.12)',

    '--vela-sidebar-bg': '#0b0f1e',
    '--vela-sidebar-fg': '#c8d3f5',
    '--vela-sidebar-active-bg': 'rgba(98, 121, 255, 0.20)',
    '--vela-sidebar-hover-bg': 'rgba(100, 130, 255, 0.07)',

    '--vela-titlebar-bg': '#070a12',
    '--vela-titlebar-fg': '#c8d3f5',
    '--vela-titlebar-button-hover': 'rgba(100, 130, 255, 0.15)',

    '--vela-addressbar-bg': '#0b0f1e',
    '--vela-addressbar-border': 'rgba(100, 130, 255, 0.15)',
    '--vela-addressbar-fg': '#c8d3f5',
    '--vela-addressbar-fg-muted': '#7a8ab5',
    '--vela-suggestion-bg': '#111829',
    '--vela-suggestion-bg-active': 'rgba(98, 121, 255, 0.20)',

    '--vela-accent': '#6279ff',
    '--vela-accent-fg': '#ffffff',
    '--vela-success': '#4fc7a4',
    '--vela-warning': '#e5c76b',
    '--vela-danger': '#f07070',

    '--vela-tab-active-bg': 'rgba(98, 121, 255, 0.20)',
    '--vela-tab-active-fg': '#e0e8ff',
    '--vela-tab-discarded-opacity': '0.5',
    '--vela-folder-marker-w': '3px',

    '--vela-font-family': 'system-ui, sans-serif',
    '--vela-font-size': '14px',
    '--vela-radius-sm': '4px',
    '--vela-radius-md': '8px',
    '--vela-radius-lg': '12px',

    // Glassmorphism activo por defecto en Midnight
    '--sidebar-backdrop-filter': 'blur(20px)',
    '--sidebar-background-opacity': '0.75',
    '--sidebar-background-color': '#0b0f1e',

    // Backward-compat
    '--vela-bg-app': '#080b14',
    '--vela-bg-sidebar': '#0b0f1e',
    '--vela-bg-sidebar-elev': '#111829',
    '--vela-bg-surface': '#111829',
    '--vela-bg-row-hover': 'rgba(100, 130, 255, 0.07)',
    '--vela-bg-row-active': 'rgba(98, 121, 255, 0.20)',
    '--vela-bg-folder-hover': 'rgba(100, 130, 255, 0.05)',
    '--vela-fg-subtle': '#4a5580',
    '--vela-border-strong': 'rgba(100, 130, 255, 0.22)',
    '--vela-accent-soft': 'rgba(98, 121, 255, 0.18)',
    '--vela-accent-strong': '#8595ff',
    '--vela-folder-marker-default': '#2d3a6a',
    '--vela-drop-line': '#6279ff',
    '--vela-drop-bg': 'rgba(98, 121, 255, 0.12)',
    '--vela-indent-guide': 'rgba(100, 130, 255, 0.08)',
    '--vela-inherit-line-alpha': '0.5',
    '--vela-row-h-normal': '32px',
    '--vela-row-h-compact': '40px',
    '--vela-indent-normal': '14px',
    '--vela-indent-compact': '8px',
    '--vela-sidebar-w-normal': '240px',
    '--vela-sidebar-w-compact': '56px',
    '--vela-titlebar-fg-muted': '#7a8ab5',
    '--vela-titlebar-accent': '#6279ff',
    '--vela-titlebar-button-hover-bg': 'rgba(100, 130, 255, 0.15)',
    '--vela-titlebar-button-active-bg': 'rgba(100, 130, 255, 0.28)',
    '--vela-secure': '#4fc7a4',
    '--vela-insecure': '#f07070',
  },
};
