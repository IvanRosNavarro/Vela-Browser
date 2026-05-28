import type { LayoutMode } from '@vela/shared';
import { BUILTIN_THEMES } from '../../../shared-ui/theme/themes';
import { call } from '../../../lib/ipc';
import { useRuntimeStore } from '../../../stores/runtimeStore';
import { useWorkspacesStore } from '../../../stores/workspacesStore';
import { useTreeStore } from '../../../stores/treeStore';
import { useUiStore } from '../../../stores/uiStore';
import { toast } from '../../../stores/toastStore';

export interface PaletteArg {
  id: string;
  label: string;
  type: 'string' | 'select' | 'tab' | 'workspace';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  required: boolean;
}

export interface PaletteContext {
  activeTabId: string | null;
  activeWorkspaceId: string | null;
  layoutMode: LayoutMode;
  profileId: string | null;
}

export interface PaletteCommandDef {
  id: string;
  title?: string;
  category?: string;
  defaultShortcut?: string | null;
  args?: PaletteArg[];
  when?: (ctx: PaletteContext) => boolean;
  run?: (ctx: PaletteContext, args: Record<string, string>) => void | Promise<void>;
}

const COLOR_OPTIONS = [
  { value: '#7d8cff', label: 'Índigo' },
  { value: '#6ad8a4', label: 'Verde' },
  { value: '#f5c76a', label: 'Naranja' },
  { value: '#ff8a8a', label: 'Rojo' },
  { value: '#c084fc', label: 'Violeta' },
  { value: '#38bdf8', label: 'Azul' },
  { value: '#fb923c', label: 'Coral' },
  { value: '', label: 'Sin color' },
];

export const PALETTE_COMMAND_DEFS: PaletteCommandDef[] = [
  // ─── comandos con args (lógica de ejecución en el renderer) ───────────────

  {
    id: 'workspace.rename',
    args: [
      {
        id: 'name',
        label: 'Nuevo nombre',
        type: 'string',
        placeholder: 'Nombre del workspace…',
        required: true,
      },
    ],
    run: async (ctx, args) => {
      const wsId = ctx.activeWorkspaceId;
      if (!wsId) return;
      const name = args.name?.trim();
      if (!name) return;
      try {
        await call(() => window.api.workspaces.update({ id: wsId, name }));
      } catch {
        toast('Error al renombrar el workspace', 'error');
      }
    },
  },

  {
    id: 'workspace.setColor',
    args: [
      {
        id: 'color',
        label: 'Color',
        type: 'select',
        options: COLOR_OPTIONS,
        required: true,
      },
    ],
    run: async (ctx, args) => {
      const wsId = ctx.activeWorkspaceId;
      if (!wsId) return;
      const color = args.color || null;
      try {
        await call(() => window.api.workspaces.update({ id: wsId, color }));
      } catch {
        toast('Error al cambiar el color', 'error');
      }
    },
  },

  {
    id: 'tab.moveToWorkspace',
    when: (ctx) => ctx.activeTabId !== null,
    args: [
      {
        id: 'ws',
        label: 'Workspace destino',
        type: 'workspace',
        required: true,
      },
    ],
    run: async (ctx, args) => {
      const targetWsId = args.ws;
      if (!targetWsId) return;
      const activeTabId = ctx.activeTabId;
      if (!activeTabId) return;
      const { currentWindowId } = useRuntimeStore.getState();
      if (!currentWindowId) return;

      const { nodesByWorkspace } = useTreeStore.getState();
      const allNodes = Object.values(nodesByWorkspace).flat();
      const tab = allNodes.find((n) => n.id === activeTabId && n.kind === 'tab');
      if (!tab || tab.kind !== 'tab') return;

      try {
        // Create tab in target workspace then close original.
        const newTab = await call(() =>
          window.api.node.createTab({
            workspaceId: targetWsId,
            parentId: null,
            url: tab.url,
            originalTitle: tab.originalTitle ?? undefined,
            name: tab.name ?? undefined,
          }),
        );
        await call(() => window.api.tab.close({ id: activeTabId }));
        await useWorkspacesStore.getState().setActive(targetWsId);
        await call(() => window.api.tab.activate({ id: newTab.id }));
      } catch {
        toast('Error al mover la pestaña', 'error');
      }
    },
  },

  {
    id: 'view.setTheme',
    args: [
      {
        id: 'theme',
        label: 'Tema',
        type: 'select',
        options: [
          { value: 'system', label: 'Sistema (automático)' },
          ...BUILTIN_THEMES.map((t) => ({ value: t.id, label: t.name })),
        ],
        required: true,
      },
    ],
    run: (_ctx, args) => {
      const themeId = args.theme;
      if (!themeId) return;
      void useUiStore.getState().setTheme(themeId);
    },
  },

  {
    id: 'history.clearToday',
    run: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      try {
        const entries = await call(() =>
          window.api.history.getForPeriod({ from: startOfDay.getTime(), to: Date.now() }),
        );
        await Promise.all(entries.map((e) => call(() => window.api.history.delete({ id: e.id }))));
        toast(`Historial de hoy borrado (${entries.length} entradas)`, 'info');
      } catch {
        toast('Error al borrar el historial', 'error');
      }
    },
  },

  {
    id: 'history.clearAll',
    run: async () => {
      try {
        await call(() => window.api.history.deleteAll({}));
        toast('Todo el historial ha sido borrado', 'info');
      } catch {
        toast('Error al borrar el historial', 'error');
      }
    },
  },

  // ─── predicados de visibilidad para comandos del registro central ──────────

  {
    id: 'layout.closeSplit',
    when: (ctx) => ctx.layoutMode !== 'single',
  },

  {
    id: 'reader.toggle',
    when: (ctx) => ctx.activeTabId !== null,
  },

  {
    id: 'tab.pin',
    when: (ctx) => ctx.activeTabId !== null,
  },

  {
    id: 'tab.unpin',
    when: (ctx) => ctx.activeTabId !== null,
  },

  {
    id: 'tab.closeActive',
    when: (ctx) => ctx.activeTabId !== null,
  },

  {
    id: 'tab.duplicate',
    when: (ctx) => ctx.activeTabId !== null,
  },

  {
    id: 'tab.rename',
    when: (ctx) => ctx.activeTabId !== null,
  },

  {
    id: 'tab.copyUrl',
    when: (ctx) => ctx.activeTabId !== null,
  },

  {
    id: 'screenshot.capture',
    when: (ctx) => ctx.activeTabId !== null,
  },
];

export function getPaletteCommandDef(id: string): PaletteCommandDef | undefined {
  return PALETTE_COMMAND_DEFS.find((d) => d.id === id);
}
