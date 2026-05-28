import type { Theme } from '@vela/shared';

// Paleta Gruvbox Dark: https://github.com/morhetz/gruvbox
// bg0_h:#1d2021  bg0:#282828  bg1:#3c3836  bg2:#504945
// bg3:#665c54    bg4:#7c6f64
// fg0:#fbf1c7    fg1:#ebdbb2   fg4:#a89984
// red:#cc241d    green:#98971a  yellow:#d79921  blue:#458588
// purple:#b16286 aqua:#689d6a  orange:#d65d0e
// bright red:#fb4934  bright orange:#fe8019
export const gruvboxDarkTheme: Theme = {
  id: 'gruvbox-dark',
  name: 'Gruvbox Dark',
  type: 'dark',
  builtin: true,
  variables: {
    '--vela-bg': '#282828',
    '--vela-bg-elevated': '#3c3836',
    '--vela-fg': '#ebdbb2',
    '--vela-fg-muted': '#a89984',
    '--vela-border': 'rgba(168, 153, 132, 0.15)',

    '--vela-sidebar-bg': '#1d2021',
    '--vela-sidebar-fg': '#ebdbb2',
    '--vela-sidebar-active-bg': 'rgba(214, 93, 14, 0.20)',
    '--vela-sidebar-hover-bg': 'rgba(168, 153, 132, 0.07)',

    '--vela-titlebar-bg': '#1d2021',
    '--vela-titlebar-fg': '#ebdbb2',
    '--vela-titlebar-button-hover': 'rgba(168, 153, 132, 0.12)',

    '--vela-addressbar-bg': '#1d2021',
    '--vela-addressbar-border': 'rgba(168, 153, 132, 0.18)',
    '--vela-addressbar-fg': '#ebdbb2',
    '--vela-addressbar-fg-muted': '#a89984',
    '--vela-suggestion-bg': '#3c3836',
    '--vela-suggestion-bg-active': 'rgba(214, 93, 14, 0.20)',

    '--vela-accent': '#fe8019',
    '--vela-accent-fg': '#1d2021',
    '--vela-success': '#98971a',
    '--vela-warning': '#d79921',
    '--vela-danger': '#cc241d',

    '--vela-tab-active-bg': 'rgba(214, 93, 14, 0.20)',
    '--vela-tab-active-fg': '#fbf1c7',
    '--vela-tab-discarded-opacity': '0.5',
    '--vela-folder-marker-w': '3px',

    '--vela-font-family': 'system-ui, sans-serif',
    '--vela-font-size': '14px',
    '--vela-radius-sm': '4px',
    '--vela-radius-md': '8px',
    '--vela-radius-lg': '12px',

    '--sidebar-backdrop-filter': 'blur(14px)',
    '--sidebar-background-opacity': '0.82',
    '--sidebar-background-color': '#1d2021',

    // Backward-compat
    '--vela-bg-app': '#282828',
    '--vela-bg-sidebar': '#1d2021',
    '--vela-bg-sidebar-elev': '#3c3836',
    '--vela-bg-surface': '#3c3836',
    '--vela-bg-row-hover': 'rgba(168, 153, 132, 0.07)',
    '--vela-bg-row-active': 'rgba(214, 93, 14, 0.20)',
    '--vela-bg-folder-hover': 'rgba(168, 153, 132, 0.05)',
    '--vela-fg-subtle': '#7c6f64',
    '--vela-border-strong': 'rgba(168, 153, 132, 0.28)',
    '--vela-accent-soft': 'rgba(254, 128, 25, 0.16)',
    '--vela-accent-strong': '#d65d0e',
    '--vela-folder-marker-default': '#504945',
    '--vela-drop-line': '#fe8019',
    '--vela-drop-bg': 'rgba(254, 128, 25, 0.12)',
    '--vela-indent-guide': 'rgba(168, 153, 132, 0.10)',
    '--vela-inherit-line-alpha': '0.5',
    '--vela-row-h-normal': '32px',
    '--vela-row-h-compact': '40px',
    '--vela-indent-normal': '14px',
    '--vela-indent-compact': '8px',
    '--vela-sidebar-w-normal': '240px',
    '--vela-sidebar-w-compact': '56px',
    '--vela-titlebar-fg-muted': '#a89984',
    '--vela-titlebar-accent': '#fe8019',
    '--vela-titlebar-button-hover-bg': 'rgba(168, 153, 132, 0.12)',
    '--vela-titlebar-button-active-bg': 'rgba(168, 153, 132, 0.22)',
    '--vela-secure': '#98971a',
    '--vela-insecure': '#cc241d',
  },
};
