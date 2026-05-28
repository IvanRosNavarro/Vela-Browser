import type { Theme } from '@vela/shared';

// Paleta Nord: https://www.nordtheme.com/
// Polar Night: #2e3440 #3b4252 #434c5e #4c566a
// Snow Storm:  #d8dee9 #e5e9f0 #eceff4
// Frost:       #8fbcbb #88c0d0 #81a1c1 #5e81ac
// Aurora:      #bf616a #d08770 #ebcb8b #a3be8c #b48ead
export const nordTheme: Theme = {
  id: 'nord',
  name: 'Nord',
  type: 'dark',
  builtin: true,
  variables: {
    '--vela-bg': '#2e3440',
    '--vela-bg-elevated': '#3b4252',
    '--vela-fg': '#eceff4',
    '--vela-fg-muted': '#d8dee9',
    '--vela-border': 'rgba(216, 222, 233, 0.10)',

    '--vela-sidebar-bg': '#272c36',
    '--vela-sidebar-fg': '#eceff4',
    '--vela-sidebar-active-bg': 'rgba(136, 192, 208, 0.18)',
    '--vela-sidebar-hover-bg': 'rgba(216, 222, 233, 0.07)',

    '--vela-titlebar-bg': '#242932',
    '--vela-titlebar-fg': '#eceff4',
    '--vela-titlebar-button-hover': 'rgba(216, 222, 233, 0.10)',

    '--vela-addressbar-bg': '#272c36',
    '--vela-addressbar-border': 'rgba(216, 222, 233, 0.12)',
    '--vela-addressbar-fg': '#eceff4',
    '--vela-addressbar-fg-muted': '#d8dee9',
    '--vela-suggestion-bg': '#3b4252',
    '--vela-suggestion-bg-active': 'rgba(136, 192, 208, 0.18)',

    '--vela-accent': '#88c0d0',
    '--vela-accent-fg': '#2e3440',
    '--vela-success': '#a3be8c',
    '--vela-warning': '#ebcb8b',
    '--vela-danger': '#bf616a',

    '--vela-tab-active-bg': 'rgba(136, 192, 208, 0.18)',
    '--vela-tab-active-fg': '#eceff4',
    '--vela-tab-discarded-opacity': '0.5',
    '--vela-folder-marker-w': '3px',

    '--vela-font-family': 'system-ui, sans-serif',
    '--vela-font-size': '14px',
    '--vela-radius-sm': '4px',
    '--vela-radius-md': '8px',
    '--vela-radius-lg': '12px',

    '--sidebar-backdrop-filter': 'blur(16px)',
    '--sidebar-background-opacity': '0.80',
    '--sidebar-background-color': '#272c36',

    // Backward-compat
    '--vela-bg-app': '#2e3440',
    '--vela-bg-sidebar': '#272c36',
    '--vela-bg-sidebar-elev': '#3b4252',
    '--vela-bg-surface': '#3b4252',
    '--vela-bg-row-hover': 'rgba(216, 222, 233, 0.07)',
    '--vela-bg-row-active': 'rgba(136, 192, 208, 0.18)',
    '--vela-bg-folder-hover': 'rgba(216, 222, 233, 0.05)',
    '--vela-fg-subtle': '#4c566a',
    '--vela-border-strong': 'rgba(216, 222, 233, 0.18)',
    '--vela-accent-soft': 'rgba(136, 192, 208, 0.16)',
    '--vela-accent-strong': '#8fbcbb',
    '--vela-folder-marker-default': '#434c5e',
    '--vela-drop-line': '#88c0d0',
    '--vela-drop-bg': 'rgba(136, 192, 208, 0.12)',
    '--vela-indent-guide': 'rgba(216, 222, 233, 0.07)',
    '--vela-inherit-line-alpha': '0.5',
    '--vela-row-h-normal': '32px',
    '--vela-row-h-compact': '40px',
    '--vela-indent-normal': '14px',
    '--vela-indent-compact': '8px',
    '--vela-sidebar-w-normal': '240px',
    '--vela-sidebar-w-compact': '56px',
    '--vela-titlebar-fg-muted': '#d8dee9',
    '--vela-titlebar-accent': '#88c0d0',
    '--vela-titlebar-button-hover-bg': 'rgba(216, 222, 233, 0.10)',
    '--vela-titlebar-button-active-bg': 'rgba(216, 222, 233, 0.20)',
    '--vela-secure': '#a3be8c',
    '--vela-insecure': '#bf616a',
  },
};
