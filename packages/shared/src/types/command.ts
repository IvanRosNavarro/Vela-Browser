import type { z } from 'zod';

export type CommandCategory =
  | 'tab'
  | 'workspace'
  | 'folder'
  | 'navigation'
  | 'window'
  | 'view'
  | 'profile'
  | 'internal'
  | 'reader'
  | 'screenshot'
  | 'devtools';

export interface CommandContext {
  windowId: number | null;
  /** Perfil al que pertenece la ventana de origen, o null si el comando se
   *  ejecuta fuera de una ventana (paleta global futura). Tras Fase 3 cada
   *  ventana está pegada a un perfil estable. */
  activeProfileId: string | null;
  activeTabId: string | null;
  activeWorkspaceId: string | null;
}

export interface CommandDefinition<Args = void> {
  id: string;
  title: string;
  category: CommandCategory;
  defaultShortcut?: string;
  argsSchema?: z.ZodType<Args>;
  // Visibilidad futura para palette: si el comando solo aplica
  // bajo ciertas condiciones (ej. tab activa pinned), expón un
  // predicate. En esta fase no se usa, pero deja el campo definido
  // para que el palette de Fase 4.5 lo consuma sin migración.
  isVisible?: (ctx: CommandContext) => boolean;
}

export type RendererCommandAction =
  | 'open-create-workspace-modal'
  | 'open-create-profile-modal'
  | 'open-manage-profile-modal'
  | 'rename-tab'
  | 'focus-address-bar'
  | 'focus-address-bar-with-prefix'
  | 'create-folder-prompt'
  | 'toggle-sidebar-mode'
  | 'toggle-sidebar'
  | 'copy-url'
  | 'open-mru-modal'
  | 'commit-mru-modal'
  | 'screenshot-start'
  | 'open-tab-switcher'
  | 'open-command-palette'
  | 'show-toast'
  | 'open-resources-monitor'
  | 'toggle-device-mode'
  | 'open-analytics-debugger'
  | 'find-open'
  | 'open-devtools-color-picker'
  | 'open-devtools-json-formatter'
  | 'open-devtools-regex-tester'
  | 'open-devtools-text-diff'
  | 'open-devtools-converters';

export interface ShortcutCommandInfo {
  id: string;
  title: string;
  category: CommandCategory;
  defaultShortcut?: string;
  /** undefined = using default, null = no shortcut (user removed), string = custom shortcut */
  customShortcut?: string | null;
}

export interface CommandRendererActionPayload {
  windowId: number;
  action: RendererCommandAction;
  payload?: unknown;
}
