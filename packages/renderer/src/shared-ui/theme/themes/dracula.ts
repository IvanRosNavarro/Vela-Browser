import type { Theme } from '@vela/shared';

// Paleta Dracula: https://draculatheme.com/
// Background: #282a36  Current Line: #44475a  Selection: #44475a
// Foreground: #f8f8f2  Comment: #6272a4
// Cyan: #8be9fd  Green: #50fa7b  Orange: #ffb86c
// Pink: #ff79c6  Purple: #bd93f9  Red: #ff5555  Yellow: #f1fa8c
export const draculaTheme: Theme = {
  id: 'dracula',
  name: 'Dracula',
  type: 'dark',
  builtin: true,
  variables: {
    '--vela-bg': '#282a36',
    '--vela-bg-elevated': '#44475a',
    '--vela-fg': '#f8f8f2',
    '--vela-fg-muted': '#6272a4',
    '--vela-border': 'rgba(98, 114, 164, 0.25)',

    '--vela-sidebar-bg': '#21222c',
    '--vela-sidebar-fg': '#f8f8f2',
    '--vela-sidebar-active-bg': 'rgba(189, 147, 249, 0.20)',
    '--vela-sidebar-hover-bg': 'rgba(248, 248, 242, 0.06)',

    '--vela-titlebar-bg': '#1e1f29',
    '--vela-titlebar-fg': '#f8f8f2',
    '--vela-titlebar-button-hover': 'rgba(248, 248, 242, 0.10)',

    '--vela-addressbar-bg': '#21222c',
    '--vela-addressbar-border': 'rgba(98, 114, 164, 0.30)',
    '--vela-addressbar-fg': '#f8f8f2',
    '--vela-addressbar-fg-muted': '#6272a4',
    '--vela-suggestion-bg': '#44475a',
    '--vela-suggestion-bg-active': 'rgba(189, 147, 249, 0.20)',

    '--vela-accent': '#bd93f9',
    '--vela-accent-fg': '#282a36',
    '--vela-success': '#50fa7b',
    '--vela-warning': '#ffb86c',
    '--vela-danger': '#ff5555',

    '--vela-tab-active-bg': 'rgba(189, 147, 249, 0.20)',
    '--vela-tab-active-fg': '#f8f8f2',
    '--vela-tab-discarded-opacity': '0.5',
    '--vela-folder-marker-w': '3px',

    '--vela-font-family': 'system-ui, sans-serif',
    '--vela-font-size': '14px',
    '--vela-radius-sm': '4px',
    '--vela-radius-md': '8px',
    '--vela-radius-lg': '12px',

    '--sidebar-backdrop-filter': 'blur(16px)',
    '--sidebar-background-opacity': '0.78',
    '--sidebar-background-color': '#21222c',

    // Backward-compat
    '--vela-bg-app': '#282a36',
    '--vela-bg-sidebar': '#21222c',
    '--vela-bg-sidebar-elev': '#44475a',
    '--vela-bg-surface': '#44475a',
    '--vela-bg-row-hover': 'rgba(248, 248, 242, 0.06)',
    '--vela-bg-row-active': 'rgba(189, 147, 249, 0.20)',
    '--vela-bg-folder-hover': 'rgba(248, 248, 242, 0.04)',
    '--vela-fg-subtle': '#6272a4',
    '--vela-border-strong': 'rgba(98, 114, 164, 0.40)',
    '--vela-accent-soft': 'rgba(189, 147, 249, 0.18)',
    '--vela-accent-strong': '#cfa9ff',
    '--vela-folder-marker-default': '#44475a',
    '--vela-drop-line': '#bd93f9',
    '--vela-drop-bg': 'rgba(189, 147, 249, 0.12)',
    '--vela-indent-guide': 'rgba(98, 114, 164, 0.20)',
    '--vela-inherit-line-alpha': '0.5',
    '--vela-row-h-normal': '32px',
    '--vela-row-h-compact': '40px',
    '--vela-indent-normal': '14px',
    '--vela-indent-compact': '8px',
    '--vela-sidebar-w-normal': '240px',
    '--vela-sidebar-w-compact': '56px',
    '--vela-titlebar-fg-muted': '#6272a4',
    '--vela-titlebar-accent': '#bd93f9',
    '--vela-titlebar-button-hover-bg': 'rgba(248, 248, 242, 0.10)',
    '--vela-titlebar-button-active-bg': 'rgba(248, 248, 242, 0.20)',
    '--vela-secure': '#50fa7b',
    '--vela-insecure': '#ff5555',
  },
};
