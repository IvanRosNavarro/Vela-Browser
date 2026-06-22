import { useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { WorkspaceModal } from './components/WorkspaceSwitcher';
import { ProfileModal } from './components/ProfileModal';
import { UnlockModal } from './components/UnlockModal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Toaster } from './components/Toaster';
import { TitleBar } from './shell/components/TitleBar';
import { DeviceToolbar } from './components/DeviceToolbar/DeviceToolbar';
import { MruModal } from './components/MruSwitcher';
import { ScreenshotOverlay } from './shell/components/Screenshot/ScreenshotOverlay';
import { ContextMenu } from './components/ContextMenu';
import { SplitResizer, SplitFocusIndicators } from './shell/components/SplitResizer';
import { TabSwitcherModal } from './shell/components/TabSwitcher';
import { CommandPalette } from './shell/components/CommandPalette';
import { ResourcesModal } from './shell/components/ResourcesModal/ResourcesModal';
import { GestureTrail } from './shell/components/GestureTrail';
import { DevToolsModal } from './shell/components/DevTools/DevToolsModal';
import { useDevToolsStore } from './stores/devtoolsStore';
import { NotificationCenter } from './shell/components/NotificationCenter/NotificationCenter';
import { useMouseGestures, type GestureTrailHandle } from './shell/hooks/useMouseGestures';
import { WorkspaceSelector } from './components/WorkspaceSelector/WorkspaceSelector';
import { UpdateModal } from './components/UpdateModal/UpdateModal';
import { useUpdateStore } from './stores/updateStore';
import { useBootstrap, useProfilesStore, useUiStore, useUrlBarStore } from './stores';
import type { UrlBarIconId } from '@vela/shared';
import { useScreenshotStore } from './stores/screenshotStore';
import { useWorkspaceModalStore } from './stores/workspaceModalStore';
import { useProfileModalStore } from './stores/profileModalStore';
import { useTreeStore } from './stores/treeStore';
import { useAddressBarStore } from './stores/addressBarStore';
import { useDownloadStore } from './stores/downloadStore';
import { useNotificationsStore } from './stores/notificationsStore';
import { useRuntimeStore } from './stores/runtimeStore';
import { useWorkspacesStore } from './stores/workspacesStore';
import { useDeviceEmulationStore } from './stores/deviceEmulationStore';
import { toast } from './stores/toastStore';
import { themeManager } from './shared-ui/theme';
import { VelaLogo } from './shared-ui/VelaLogo';
import { IPC_EVENTS } from '@vela/shared';
import { clusterRegistry } from './components/AddressBar/clusterRegistry';
import { useTranslationStore } from './stores/translationStore';

function WebContentArea() {
  const backgroundSnapshot = useScreenshotStore((s) => s.backgroundSnapshot);

  return (
    <main
      className="relative flex flex-1 items-center justify-center overflow-hidden"
      style={{ background: 'var(--vela-bg-app)' }}
      aria-hidden
    >
      {backgroundSnapshot ? (
        // Snapshot de la página: se muestra cuando el WCV está oculto por un overlay
        // de captura, para que el usuario vea la web "congelada" detrás del overlay.
        <img
          src={backgroundSnapshot}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
          draggable={false}
        />
      ) : (
        // Backdrop de la shell. En navegación normal el WCV (blanco) lo cubre por
        // completo, así que no se ve. En device mode el WCV se encoge al tamaño
        // del dispositivo: el fondo VELA que asoma alrededor delimita visualmente
        // dónde empieza y acaba la página emulada (el viewport sí es blanco).
        <VelaLogo size={3.5} opacity={0.15} />
      )}
    </main>
  );
}

export function App() {
  const { ready, error } = useBootstrap();
  const profiles = useProfilesStore((s) => s.profiles);
  const archived = useProfilesStore((s) => s.archivedProfiles);
  const profilesLoaded = useProfilesStore((s) => s.loaded);
  const theme = useUiStore((s) => s.theme);

  const gestureTrailRef = useRef<GestureTrailHandle>(null);
  useMouseGestures(gestureTrailRef);

  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  useEffect(() => {
    const offWorkspace = window.api.on(IPC_EVENTS.WORKSPACE_MODAL_TRIGGER, ({ mode, editId }) => {
      const store = useWorkspaceModalStore.getState();
      if (mode === 'create') void store.openCreate();
      else if (mode === 'manage') void store.openManage();
      else if (mode === 'edit' && editId) void store.openEdit(editId);
    });
    const offProfile = window.api.on(IPC_EVENTS.PROFILE_MODAL_TRIGGER, ({ mode, profileId }) => {
      const store = useProfileModalStore.getState();
      if (mode === 'create') void store.openCreate();
      else if (mode === 'manage') void store.openManage();
      else if (mode === 'unlock' && profileId) store.openUnlock(profileId);
    });
    const offSnapshot = window.api.on(IPC_EVENTS.BUG_SNAPSHOT_COMPLETE, ({ zipPath }) => {
      const filename = zipPath.split(/[/\\]/).pop() ?? 'snapshot.zip';
      toast(`Snapshot guardado: ${filename}`, 'success', () => {
        void window.api.bugSnapshot.showInFolder({ zipPath });
      });
    });
    const offSelectionSaved = window.api.on(IPC_EVENTS.SELECTION_SAVED_TO_FILE, ({ filePath }) => {
      const filename = filePath.split(/[/\\]/).pop() ?? 'seleccion.txt';
      toast(`Selección guardada: ${filename}`, 'success', () => {
        void window.api.downloads.showInFolder(filePath);
      });
    });
    const offAddNodeMenu = window.api.on(IPC_EVENTS.ADD_NODE_MENU_ACTION, ({ action, workspaceId, parentId }) => {
      if (action === 'new-tab') {
        void window.api.window.openUrlInNewTab({ url: 'vela://newtab', parentId, activate: true })
          .then(() => { setTimeout(() => useAddressBarStore.getState().requestFocus(), 0); });
      } else if (action === 'new-folder') {
        void useTreeStore.getState().createFolder({ workspaceId, parentId, name: 'Carpeta' });
      } else if (action === 'new-secure-tab') {
        void window.api.tab.createSecure({});
      }
    });
    const offDownloads = window.api.on(IPC_EVENTS.DOWNLOADS_CHANGED, ({ items }) => {
      useDownloadStore.getState().setItems(items);
    });
    void useDownloadStore.getState().hydrate();

    const offNotificationsChanged = window.api.on(IPC_EVENTS.NOTIFICATIONS_CHANGED, ({ unreadCount }) => {
      useNotificationsStore.getState().setUnreadCount(unreadCount);
      void useNotificationsStore.getState().refetchIfOpen();
    });
    const offPermissionPending = window.api.on(IPC_EVENTS.NOTIFICATION_PERMISSION_PENDING, (info) => {
      useNotificationsStore.getState().addPendingOrigin(info);
    });
    const offPermissionChanged = window.api.on(IPC_EVENTS.NOTIFICATION_PERMISSION_CHANGED, ({ origin, state }) => {
      useNotificationsStore.getState().setPermissionState(origin, state);
      useNotificationsStore.getState().removePendingOrigin(origin);
    });
    const offNotificationCenterOpen = window.api.on(IPC_EVENTS.NOTIFICATION_CENTER_OPEN, () => {
      void useNotificationsStore.getState().openPanel();
    });
    void useNotificationsStore.getState().hydrate();

    const offUpdateModalOpen = window.api.on(IPC_EVENTS.UPDATE_MODAL_OPEN, () => {
      useUpdateStore.getState().openModal();
      useUpdateStore.getState().setPhase('checking');
    });
    const offUpdateDevMode = window.api.on(IPC_EVENTS.UPDATE_DEV_MODE, () => {
      useUpdateStore.getState().setPhase('dev-mode');
    });
    const offUpdateChecking = window.api.on(IPC_EVENTS.UPDATE_CHECKING, () => {
      useUpdateStore.getState().setPhase('checking');
    });
    const offUpdateAvailable = window.api.on(IPC_EVENTS.UPDATE_AVAILABLE, ({ version }) => {
      useUpdateStore.getState().setPhase('available', { version });
      if (!useUpdateStore.getState().modalOpen) {
        toast(`Nueva versión v${version} disponible`, 'success', () => {
          useUpdateStore.getState().openModal();
        });
      }
    });
    const offUpdateNotAvailable = window.api.on(IPC_EVENTS.UPDATE_NOT_AVAILABLE, () => {
      useUpdateStore.getState().setPhase('up-to-date');
      if (!useUpdateStore.getState().modalOpen) {
        toast('Vela está al día', 'success');
      }
    });
    let downloadingToastShown = false;
    const offUpdateProgress = window.api.on(IPC_EVENTS.UPDATE_DOWNLOAD_PROGRESS, ({ percent }) => {
      useUpdateStore.getState().setPhase('downloading', { percent });
      if (!useUpdateStore.getState().modalOpen && !downloadingToastShown) {
        downloadingToastShown = true;
        toast('Descargando actualización…');
      }
    });
    const offUpdateDownloaded = window.api.on(IPC_EVENTS.UPDATE_DOWNLOADED, ({ version }) => {
      downloadingToastShown = false;
      useUpdateStore.getState().setPhase('downloaded', { version });
      if (!useUpdateStore.getState().modalOpen) {
        toast(`Actualización v${version} lista — Reinicia Vela para instalarla`, 'success', () => {
          void window.api.update.quitAndInstall();
        });
      }
    });
    const offUpdateError = window.api.on(IPC_EVENTS.UPDATE_ERROR, ({ message }) => {
      useUpdateStore.getState().setPhase('error', { message });
      if (!useUpdateStore.getState().modalOpen) {
        toast(`Error al actualizar: ${message}`, 'error');
      }
    });

    const offColorPicked = window.api.on(IPC_EVENTS.DEVTOOLS_COLOR_PICKED, (color) => {
      useDevToolsStore.getState().receiveColor(color);
    });

    const offTranslationStatus = window.api.on(IPC_EVENTS.TRANSLATION_STATUS_CHANGED, ({ tabId, status }) => {
      useTranslationStore.getState().setTabStatus(tabId, status);
      if (status === 'translated') toast('Página traducida', 'success');
    });

    const offTranslationError = window.api.on(IPC_EVENTS.TRANSLATION_ERROR, ({ message }) => {
      toast(message, 'error');
    });

    const offTabNavigated = window.api.on(IPC_EVENTS.TAB_NAVIGATED, ({ tabId }) => {
      // Resetear al navegar (icono desaparece durante la carga)
      useTranslationStore.getState().setTabStatus(tabId, 'neutral');
    });

    // Detectar idioma cuando la página TERMINA de cargar (DOM ready)
    const offTabLoading = window.api.on(IPC_EVENTS.TAB_LOADING_CHANGED, ({ tabId, loading }) => {
      if (!loading) void window.api.translation.detectLang({ tabId });
    });

    const offClusterRelay = window.api.on(IPC_EVENTS.CLUSTER_RELAY, ({ action, payload }) => {
      const runtime = useRuntimeStore.getState();
      const windowId = runtime.currentWindowId;
      if (windowId === null) return;
      const activeTabId = windowId !== null ? (runtime.activeTabIdByWindow[windowId] ?? null) : null;
      const workspaceId = useWorkspacesStore.getState().activeWorkspaceId;
      const nodes = workspaceId ? (useTreeStore.getState().nodesByWorkspace[workspaceId] ?? []) : [];
      const tabNode = nodes.find((n) => n.id === activeTabId && n.kind === 'tab');
      const currentUrl = tabNode?.kind === 'tab' ? tabNode.url : '';

      if (action === 'screenshot-start') {
        // Capture background snapshot (WCV still visible) then enter mode-select overlay
        void (async () => {
          const bgRes = await window.api.screenshot.captureVisible();
          const bg = bgRes.ok ? bgRes.data.dataUrl : undefined;
          useScreenshotStore.getState().startCapture(bg);
        })();
      } else if (action === 'screenshot-visible') {
        void (async () => {
          // Capture while WCV is still visible, then open editor directly.
          // Never re-capture after startCapture: the WCV is at HIDDEN_BOUNDS then.
          const res = await window.api.screenshot.captureVisible();
          if (!res.ok) return;
          const bg = res.data.dataUrl;
          useScreenshotStore.getState().startCapture(bg);
          useScreenshotStore.getState().openEditor(bg);
        })();
      } else if (action === 'screenshot-region') {
        useScreenshotStore.getState().setRegionSelect();
      } else if (action === 'screenshot-fullpage') {
        void (async () => {
          useScreenshotStore.getState().startCapture(); // hides WCV before capture
          const res = await window.api.screenshot.captureFullPage();
          if (res.ok) useScreenshotStore.getState().openEditor(res.data.dataUrl);
          else useScreenshotStore.getState().close();
        })();
      } else if (action === 'reader') {
        if (!activeTabId || !currentUrl) return;
        if (currentUrl.startsWith('vela://reader')) {
          try {
            const params = new URLSearchParams(new URL(currentUrl).search);
            const source = params.get('source');
            if (source) void window.api.nav.goto({ id: activeTabId, url: source });
          } catch { /* ignore */ }
        } else {
          const readerUrl = `vela://reader?source=${encodeURIComponent(currentUrl)}`;
          void window.api.window.openUrlInNewTab({ url: readerUrl });
        }
      } else if (action === 'secure-tab') {
        const tabUrl = (payload as Record<string, unknown>)?.url as string | undefined;
        void window.api.tab.createSecure({ url: tabUrl });
      } else if (action === 'devmode') {
        const rect = clusterRegistry.getToolsRect();
        if (!rect) return;
        void window.api.devmode.openPopup({
          windowId,
          activeTabId,
          currentUrl,
          devtoolsActive: useDeviceEmulationStore.getState().active,
          anchorRect: { right: rect.right, bottom: rect.bottom },
        });
      } else if (action === 'adblocker') {
        if (!activeTabId) return;
        const rect = clusterRegistry.getStatusRect();
        if (!rect) return;
        void window.api.adblocker.openPanel({
          tabId: activeTabId,
          anchorRect: { right: rect.right, bottom: rect.bottom },
        });
      } else if (action === 'cookies') {
        if (!currentUrl) return;
        const rect = clusterRegistry.getStatusRect();
        if (!rect) return;
        void window.api.cookies.openPanel({
          windowId,
          url: currentUrl,
          anchorRect: { right: rect.right, bottom: rect.bottom },
        });
      } else if (action === 'vault') {
        if (!activeTabId) return;
        const rect = clusterRegistry.getStatusRect();
        if (!rect) return;
        let domain = '';
        try { domain = new URL(currentUrl).hostname; } catch { /* ignore */ }
        void window.api.vault.openAutofillModal({
          windowId,
          tabId: activeTabId,
          domain,
          anchorRect: { right: rect.right, bottom: rect.bottom },
        });
      } else if (action === 'hide-icon') {
        const { iconId } = payload as { iconId?: string };
        if (iconId) void useUrlBarStore.getState().setVisible(iconId as UrlBarIconId, false);
      } else if (action === 'open-settings-urlbar') {
        void window.api.window.openUrlInNewTab({ url: 'vela://settings#appearance' });
      }
    });

    return () => {
      offColorPicked();
      offWorkspace(); offProfile(); offSnapshot(); offSelectionSaved(); offAddNodeMenu(); offDownloads();
      offUpdateModalOpen(); offUpdateDevMode();
      offUpdateChecking(); offUpdateAvailable(); offUpdateNotAvailable();
      offUpdateProgress(); offUpdateDownloaded(); offUpdateError();
      offClusterRelay();
      offNotificationsChanged(); offPermissionPending(); offPermissionChanged(); offNotificationCenterOpen();
      offTranslationStatus();
      offTranslationError();
      offTabNavigated();
      offTabLoading();
    };
  }, []);

  useEffect(() => {
    themeManager.setTheme(theme);
  }, [theme]);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-red-400"
        style={{ background: '#0e0f12' }}>
        Error al inicializar: {error.message}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-[var(--vela-fg-muted)]"
        style={{ background: '#0e0f12' }}>
        Cargando…
      </div>
    );
  }

  if (profilesLoaded && profiles.length === 0 && archived.length === 0) {
    return (
      <>
        <WelcomeScreen />
        <Toaster />
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden" style={{ minWidth: 0 }}>
          <DeviceToolbar />
          <WebContentArea />
        </div>
        <NotificationCenter />
      </div>

      <WorkspaceSelector />
      <WorkspaceModal />
      <ProfileModal />
      <UnlockModal />
      <MruModal />
      <TabSwitcherModal />
      <CommandPalette />
      <ResourcesModal />
      <DevToolsModal />
      <UpdateModal />
      <SplitResizer />
      <SplitFocusIndicators />
      <ScreenshotOverlay />
      <ContextMenu />
      <Toaster />
      <GestureTrail ref={gestureTrailRef} />
    </div>
  );
}
