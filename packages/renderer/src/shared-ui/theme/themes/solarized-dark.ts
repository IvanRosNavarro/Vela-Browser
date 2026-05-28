import type { Theme } from '@vela/shared';

// Paleta Solarized: https://ethanschoonover.com/solarized/
// base03:#002b36  base02:#073642  base01:#586e75  base00:#657b83
// base0:#839496   base1:#93a1a1   base2:#eee8d5   base3:#fdf6e3
// yellow:#b58900  orange:#cb4b16  red:#dc322f     magenta:#d33682
// violet:#6c71c4  blue:#268bd2    cyan:#2aa198    green:#859900
export const solarizedDarkTheme: Theme = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  type: 'dark',
  builtin: true,
  variables: {
    '--vela-bg': '#002b36',
    '--vela-bg-elevated': '#073642',
    '--vela-fg': '#839496',
    '--vela-fg-muted': '#586e75',
    '--vela-border': 'rgba(131, 148, 150, 0.12)',

    '--vela-sidebar-bg': '#00232e',
    '--vela-sidebar-fg': '#93a1a1',
    '--vela-sidebar-active-bg': 'rgba(38, 139, 210, 0.20)',
    '--vela-sidebar-hover-bg': 'rgba(131, 148, 150, 0.07)',

    '--vela-titlebar-bg': '#001e28',
    '--vela-titlebar-fg': '#93a1a1',
    '--vela-titlebar-button-hover': 'rgba(131, 148, 150, 0.12)',

    '--vela-addressbar-bg': '#00232e',
    '--vela-addressbar-border': 'rgba(131, 148, 150, 0.15)',
    '--vela-addressbar-fg': '#839496',
    '--vela-addressbar-fg-muted': '#586e75',
    '--vela-suggestion-bg': '#073642',
    '--vela-suggestion-bg-active': 'rgba(38, 139, 210, 0.20)',

    '--vela-accent': '#268bd2',
    '--vela-accent-fg': '#fdf6e3',
    '--vela-success': '#859900',
    '--vela-warning': '#b58900',
    '--vela-danger': '#dc322f',

    '--vela-tab-active-bg': 'rgba(38, 139, 210, 0.20)',
    '--vela-tab-active-fg': '#93a1a1',
    '--vela-tab-discarded-opacity': '0.5',
    '--vela-folder-marker-w': '3px',

    '--vela-font-family': 'system-ui, sans-serif',
    '--vela-font-size': '14px',
    '--vela-radius-sm': '4px',
    '--vela-radius-md': '8px',
    '--vela-radius-lg': '12px',

    '--sidebar-backdrop-filter': 'blur(12px)',
    '--sidebar-background-opacity': '0.85',
    '--sidebar-background-color': '#00232e',

    // Backward-compat
    '--vela-bg-app': '#002b36',
    '--vela-bg-sidebar': '#00232e',
    '--vela-bg-sidebar-elev': '#073642',
    '--vela-bg-surface': '#073642',
    '--vela-bg-row-hover': 'rgba(131, 148, 150, 0.07)',
    '--vela-bg-row-active': 'rgba(38, 139, 210, 0.20)',
    '--vela-bg-folder-hover': 'rgba(131, 148, 150, 0.05)',
    '--vela-fg-subtle': '#073642',
    '--vela-border-strong': 'rgba(131, 148, 150, 0.22)',
    '--vela-accent-soft': 'rgba(38, 139, 210, 0.16)',
    '--vela-accent-strong': '#2aa198',
    '--vela-folder-marker-default': '#073642',
    '--vela-drop-line': '#268bd2',
    '--vela-drop-bg': 'rgba(38, 139, 210, 0.12)',
    '--vela-indent-guide': 'rgba(131, 148, 150, 0.10)',
    '--vela-inherit-line-alpha': '0.5',
    '--vela-row-h-normal': '32px',
    '--vela-row-h-compact': '40px',
    '--vela-indent-normal': '14px',
    '--vela-indent-compact': '8px',
    '--vela-sidebar-w-normal': '240px',
    '--vela-sidebar-w-compact': '56px',
    '--vela-titlebar-fg-muted': '#586e75',
    '--vela-titlebar-accent': '#268bd2',
    '--vela-titlebar-button-hover-bg': 'rgba(131, 148, 150, 0.12)',
    '--vela-titlebar-button-active-bg': 'rgba(131, 148, 150, 0.22)',
    '--vela-secure': '#859900',
    '--vela-insecure': '#dc322f',
  },
};
