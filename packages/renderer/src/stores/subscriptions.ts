import { IPC_EVENTS, type CommandRendererActionPayload } from '@vela/shared';
import { useContextMenuStore } from './contextMenuStore';
import { useLayoutStore } from './layoutStore';
import { useRuntimeStore } from './runtimeStore';
import { useTreeStore } from './treeStore';
import { useWorkspacesStore } from './workspacesStore';
import { useWorkspaceModalStore } from './workspaceModalStore';
import { useRulesStore } from './rulesStore';
import { useUiStore } from './uiStore';
import { useAddressBarStore } from './addressBarStore';
import { useProfilesStore } from './profilesStore';
import { useProfileModalStore } from './profileModalStore';
import { toast } from './toastStore';
import { writeToClipboard } from '../lib/clipboard';
import { useReaderStore } from './readerStore';
import { useDeviceEmulationStore } from './deviceEmulationStore';
import { usePageFeatureStore } from './pageFeatureStore';
import { useExtensionActionsStore } from './extensionActionsStore';
import { useMruSwitcherStore, type MruTabEntry } from './mruSwitcherStore';
import { useScreenshotStore } from './screenshotStore';
import { useMediaStore } from './mediaStore';
import { useTabSwitcherStore } from './tabSwitcherStore';
import { useCommandPaletteStore } from './commandPaletteStore';
import { useFavoritesStore } from './favoritesStore';
import { useResourcesStore } from './resourcesStore';
import { useAparejosStore } from './aparejosStore';
import { useUrlBarStore } from './urlBarStore';
import { useTitleBarIconStore } from './titleBarIconStore';
import { useSyncStore } from './syncStore';
import { useMultiWindowStore } from './multiWindowStore';
import { useFindStore } from './findStore';
import { useDevToolsStore, type ConverterTab } from './devtoolsStore';


function handleRendererAction(payload: CommandRendererActionPayload): void {
  const { currentWindowId } = useRuntimeStore.getState();
  if (currentWindowId !== null && payload.windowId !== currentWindowId) {
    return;
  }
  switch (payload.action) {
    case 'open-create-workspace-modal':
      void useWorkspaceModalStore.getState().openCreate();
      return;
    case 'open-create-profile-modal':
      void useProfileModalStore.getState().openCreate();
      return;
    case 'open-manage-profile-modal':
      void useProfileModalStore.getState().openManage();
      return;
    case 'toggle-sidebar': {
      void useUiStore.getState().toggleSidebar();
      return;
    }
    case 'toggle-sidebar-mode': {
      const ui = useUiStore.getState();
      void ui.setSidebarMode(ui.sidebarMode === 'compact' ? 'normal' : 'compact');
      return;
    }
    case 'focus-address-bar':
      useAddressBarStore.getState().requestFocus(null);
      return;
    case 'focus-address-bar-with-prefix': {
      const prefix = (payload.payload as { prefix?: string } | undefined)?.prefix ?? null;
      useAddressBarStore.getState().requestFocus(prefix);
      return;
    }
    case 'copy-url': {
      const { currentWindowId: winId, activeTabIdByWindow } = useRuntimeStore.getState();
      if (winId === null) return;
      const activeTabId = activeTabIdByWindow[winId] ?? null;
      if (!activeTabId) return;
      const { nodesByWorkspace } = useTreeStore.getState();
      const { activeWorkspaceId } = useWorkspacesStore.getState();
      if (!activeWorkspaceId) return;
      const nodes = nodesByWorkspace[activeWorkspaceId] ?? [];
      const node = nodes.find((n) => n.id === activeTabId);
      if (!node || node.kind !== 'tab') return;
      void writeToClipboard(node.url).then(() => {
        toast('URL copiada', 'info');
      }).catch(() => {
        toast('No se pudo copiar la URL', 'error');
      });
      return;
    }
    case 'open-mru-modal': {
      const p = payload.payload as {
        direction: 'forward' | 'backward';
        tabs: MruTabEntry[];
        previewsEnabled: boolean;
      } | undefined;
      if (!p) return;
      useMruSwitcherStore.getState().open(p.tabs, p.direction, p.previewsEnabled);
      return;
    }
    case 'commit-mru-modal': {
      useMruSwitcherStore.getState().commitOrDirect();
      return;
    }
    case 'screenshot-start': {
      // Capturamos la página ANTES de ocultar el WCV para usarla como fondo.
      void (async () => {
        const res = await window.api.screenshot.captureVisible();
        const snapshot = res.ok ? res.data.dataUrl : undefined;
        useScreenshotStore.getState().startCapture(snapshot);
      })();
      return;
    }
    case 'open-tab-switcher':
      void useTabSwitcherStore.getState().open();
      return;
    case 'open-command-palette': {
      const p = payload.payload as { initialCommand?: string } | undefined;
      useCommandPaletteStore.getState().open(p?.initialCommand ? { initialCommand: p.initialCommand } : undefined);
      return;
    }
    case 'show-toast': {
      const p = payload.payload as { message?: string; type?: string } | undefined;
      if (p?.message) {
        toast(p.message, (p.type as 'info' | 'warning' | 'error') ?? 'info');
      }
      return;
    }
    case 'open-resources-monitor':
      useResourcesStore.getState().open();
      return;
    case 'open-analytics-debugger':
      void window.api.analyticsDebugger.open();
      return;
    case 'toggle-device-mode': {
      const devStore = useDeviceEmulationStore.getState();
      if (devStore.active) {
        void devStore.deactivate();
      } else {
        void devStore.activate();
      }
      return;
    }
    case 'find-open':
      useFindStore.getState().openBar();
      return;
    case 'rename-tab':
    case 'create-folder-prompt':
      // TODO(deuda): conectar con la UI cuando exista
      // (Fase 4.5: command palette + rename inline programático).
      return;
    case 'open-devtools-color-picker':
      useDevToolsStore.getState().open('color-picker');
      return;
    case 'open-devtools-json-formatter':
      useDevToolsStore.getState().open('json-formatter');
      return;
    case 'open-devtools-regex-tester':
      useDevToolsStore.getState().open('regex-tester');
      return;
    case 'open-devtools-text-diff':
      useDevToolsStore.getState().open('text-diff');
      return;
    case 'open-devtools-converters': {
      const p = payload.payload as { tab?: ConverterTab } | undefined;
      useDevToolsStore.getState().open('converters', p?.tab ?? 'css');
      return;
    }
  }
}

export function initSubscriptions(): () => void {
  const offWorkspaces = window.api.on(
    IPC_EVENTS.WORKSPACES_CHANGED,
    () => {
      void useWorkspacesStore.getState().reload();
    },
  );

  const offTree = window.api.on(IPC_EVENTS.TREE_CHANGED, (payload) => {
    void useTreeStore.getState().invalidate(payload.workspaceId);
  });

  const offActiveTab = window.api.on(
    IPC_EVENTS.ACTIVE_TAB_CHANGED,
    (payload) => {
      useRuntimeStore.getState().setActiveTab(payload.windowId, payload.tabId);
      if (useDeviceEmulationStore.getState().active) {
        void useDeviceEmulationStore.getState().deactivate();
      }
      const find = useFindStore.getState();
      if (find.open && find.query) {
        void window.api.find.start({ text: find.query, matchCase: find.matchCase });
      }
    },
  );

  const offActiveWorkspace = window.api.on(
    IPC_EVENTS.ACTIVE_WORKSPACE_CHANGED,
    (payload) => {
      const { currentWindowId } = useRuntimeStore.getState();
      if (currentWindowId !== null && payload.windowId !== currentWindowId) {
        return;
      }
      useWorkspacesStore.getState().setActiveLocal(payload.workspaceId);
      void useTreeStore.getState().hydrateWorkspace(payload.workspaceId);
    },
  );

  const offRules = window.api.on(IPC_EVENTS.RULES_CHANGED, (payload) => {
    void useRulesStore.getState().invalidate(payload.workspaceId);
  });

  const offCommandAction = window.api.on(
    IPC_EVENTS.COMMAND_RENDERER_ACTION,
    (payload) => {
      handleRendererAction(payload);
    },
  );

  const offProfilesChanged = window.api.on(IPC_EVENTS.PROFILES_CHANGED, () => {
    void useProfilesStore.getState().reload();
  });

  const offActiveProfile = window.api.on(
    IPC_EVENTS.ACTIVE_PROFILE_CHANGED,
    (payload) => {
      const { currentWindowId } = useRuntimeStore.getState();
      if (currentWindowId !== null && payload.windowId !== currentWindowId) {
        return;
      }
      useProfilesStore.getState().setActiveLocal(payload.profileId);
    },
  );

  const offFullscreen = window.api.on(IPC_EVENTS.FULLSCREEN_CHANGED, (payload) => {
    const { currentWindowId } = useRuntimeStore.getState();
    if (currentWindowId !== null && payload.windowId !== currentWindowId) return;
    useUiStore.getState().setFullscreen(payload.fullscreen);
  });

  const offReaderState = window.api.on(
    IPC_EVENTS.TAB_READER_STATE_CHANGED,
    (payload) => {
      const { currentWindowId } = useRuntimeStore.getState();
      if (currentWindowId !== null && payload.windowId !== currentWindowId) return;
      useReaderStore.getState().setReadable(payload.tabId, payload.readable);
    },
  );

  const offTabFeatures = window.api.on(
    IPC_EVENTS.TAB_FEATURES_CHANGED,
    (payload) => {
      const { currentWindowId } = useRuntimeStore.getState();
      if (currentWindowId !== null && payload.windowId !== currentWindowId) return;
      usePageFeatureStore.getState().setFeatures(payload.tabId, payload.features);
    },
  );

  const offTabLoading = window.api.on(
    IPC_EVENTS.TAB_LOADING_CHANGED,
    (payload) => {
      useRuntimeStore.getState().setTabLoading(payload.tabId, payload.loading);
    },
  );

  const offExtensionActionsChanged = window.api.on(
    IPC_EVENTS.EXTENSION_ACTIONS_CHANGED,
    () => {
      void useExtensionActionsStore.getState().hydrate();
    },
  );

  const offUiSettingsChanged = window.api.on(
    IPC_EVENTS.UI_SETTINGS_CHANGED,
    () => {
      void useUiStore.getState().hydrate();
    },
  );

  const offContextMenuShow = window.api.on(
    IPC_EVENTS.CONTEXT_MENU_SHOW,
    (payload) => {
      const { currentWindowId } = useRuntimeStore.getState();
      if (currentWindowId !== null && payload.windowId !== currentWindowId) return;
      useContextMenuStore.getState().show(payload);
    },
  );

  const offLayoutChanged = window.api.on(
    IPC_EVENTS.LAYOUT_CHANGED,
    (payload) => {
      const { currentWindowId } = useRuntimeStore.getState();
      if (currentWindowId !== null && payload.windowId !== currentWindowId) return;
      useLayoutStore.getState().setLayout(payload.layout);
    },
  );

  const offMediaChanged = window.api.on(
    IPC_EVENTS.MEDIA_CHANGED,
    (payload) => {
      const profileId = useRuntimeStore.getState().currentProfileId;
      const sources = profileId
        ? payload.sources.filter((s) => s.profileId === profileId)
        : payload.sources;
      useMediaStore.getState().setSources(sources);
    },
  );

  const offFavoritesChanged = window.api.on(
    IPC_EVENTS.FAVORITES_CHANGED,
    (payload) => {
      const { currentProfileId } = useRuntimeStore.getState();
      if (currentProfileId !== null && payload.profileId !== currentProfileId) return;
      useFavoritesStore.getState().setFromEvent(payload.favorites);
    },
  );

  const offAnchoredTabs = window.api.on(
    IPC_EVENTS.ANCHORED_TABS_CHANGED,
    (payload) => {
      const { currentProfileId } = useRuntimeStore.getState();
      if (currentProfileId !== null && payload.profileId !== currentProfileId) return;
      useTreeStore.getState().setAnchoredTabs(payload.tabs);
    },
  );

  const offAparejos = window.api.on(
    IPC_EVENTS.APAREJOS_CHANGED,
    (payload) => {
      useAparejosStore.getState().setAparejos(payload.aparejos);
    },
  );

  const offUrlBarConfig = window.api.on(
    IPC_EVENTS.URLBAR_CONFIG_CHANGED,
    (payload) => {
      useUrlBarStore.getState().setConfig(payload.config);
    },
  );

  const offTitleBarConfig = window.api.on(
    IPC_EVENTS.TITLEBAR_CONFIG_CHANGED,
    (payload) => {
      useTitleBarIconStore.getState().setConfig(payload.config);
    },
  );

  const offSyncStatus = window.api.on(
    IPC_EVENTS.SYNC_STATUS_CHANGED,
    (payload) => {
      useSyncStore.getState().updateStatus(payload.status);
    },
  );

  const offSyncCallback = window.api.on(
    IPC_EVENTS.SYNC_CALLBACK_RECEIVED,
    (payload) => {
      useSyncStore.getState().setPendingToken(payload.token);
    },
  );

  const offSyncSessionExpired = window.api.on(
    IPC_EVENTS.SYNC_SESSION_EXPIRED,
    () => {
      useSyncStore.getState().markSessionExpired();
    },
  );

  const offDeviceEmulationToggle = window.api.on(
    IPC_EVENTS.DEVICE_EMULATION_TOGGLE_REQUEST,
    () => {
      const store = useDeviceEmulationStore.getState();
      if (store.active) {
        void store.deactivate();
      } else {
        void store.activate();
      }
    },
  );

  const offWindowsChanged = window.api.on(
    IPC_EVENTS.WINDOWS_CHANGED,
    (payload) => {
      useMultiWindowStore.getState().setOpenWindows(payload.windows);
    },
  );

  const offFindQuerySync = window.api.on(
    IPC_EVENTS.FIND_BAR_QUERY_SYNC,
    (payload) => {
      const { currentWindowId } = useRuntimeStore.getState();
      if (currentWindowId !== null && payload.windowId !== currentWindowId) return;
      useFindStore.getState().syncQuery(payload.text, payload.matchCase);
    },
  );

  const offFindBarClosed = window.api.on(
    IPC_EVENTS.FIND_BAR_CLOSED,
    (payload) => {
      const { currentWindowId } = useRuntimeStore.getState();
      if (currentWindowId !== null && payload.windowId !== currentWindowId) return;
      useFindStore.getState().forceClose();
    },
  );

  // Evento de estado maximizado: gestionado localmente en WindowControls
  // mediante useWindowMaximized (suscripción directa vía window.api.on).
  // No se necesita estado global; la suscripción aquí sería redundante.

  return () => {
    offWorkspaces();
    offTree();
    offActiveTab();
    offActiveWorkspace();
    offRules();
    offCommandAction();
    offProfilesChanged();
    offActiveProfile();
    offFullscreen();
    offReaderState();
    offTabFeatures();
    offTabLoading();
    offExtensionActionsChanged();
    offUiSettingsChanged();
    offContextMenuShow();
    offLayoutChanged();
    offMediaChanged();
    offFavoritesChanged();
    offAnchoredTabs();
    offAparejos();
    offUrlBarConfig();
    offTitleBarConfig();
    offSyncStatus();
    offSyncCallback();
    offSyncSessionExpired();
    offDeviceEmulationToggle();
    offWindowsChanged();
    offFindQuerySync();
    offFindBarClosed();
  };
}
