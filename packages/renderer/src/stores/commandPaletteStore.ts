import { create } from 'zustand';
import type { PaletteCommandDef } from '../shell/components/CommandPalette/paletteCommands';

export interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  mode: 'list' | 'args';
  selectedCommand: PaletteCommandDef | null;
  argValues: Record<string, string>;

  open: (opts?: { initialCommand?: string; initialQuery?: string }) => void;
  close: () => void;
  setQuery: (q: string) => void;
  setSelectedIndex: (i: number) => void;
  selectCommand: (cmd: PaletteCommandDef) => void;
  setArgValue: (argId: string, value: string) => void;
  resetArgs: () => void;
  backToList: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  query: '',
  selectedIndex: 0,
  mode: 'list',
  selectedCommand: null,
  argValues: {},

  open(opts) {
    set({
      isOpen: true,
      query: opts?.initialQuery ?? '',
      selectedIndex: 0,
      mode: 'list',
      selectedCommand: null,
      argValues: {},
    });
    if (opts?.initialCommand) {
      // Signal to useCommandPalette to pre-select this command.
      // Done via a separate field rather than direct lookup to avoid circular deps.
      set({ query: `__preselect__${opts.initialCommand}` });
    }
  },

  close() {
    set({ isOpen: false, query: '', selectedIndex: 0, mode: 'list', selectedCommand: null, argValues: {} });
  },

  setQuery(q) {
    set({ query: q, selectedIndex: 0 });
  },

  setSelectedIndex(i) {
    set({ selectedIndex: i });
  },

  selectCommand(cmd) {
    if (cmd.args && cmd.args.length > 0) {
      set({ mode: 'args', selectedCommand: cmd, argValues: {} });
    } else {
      set({ selectedCommand: cmd });
    }
  },

  setArgValue(argId, value) {
    set((state) => ({ argValues: { ...state.argValues, [argId]: value } }));
  },

  resetArgs() {
    set({ argValues: {} });
  },

  backToList() {
    set({ mode: 'list', selectedCommand: null, argValues: {} });
  },
}));
