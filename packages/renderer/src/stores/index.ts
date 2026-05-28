import { useEffect, useState } from 'react';
import { call } from '../lib/ipc';
import { initSubscriptions } from './subscriptions';
import { useProfilesStore } from './profilesStore';
import { useRuntimeStore } from './runtimeStore';
import { useTreeStore } from './treeStore';
import { useUiStore } from './uiStore';
import { useWorkspacesStore } from './workspacesStore';
import { useReaderStore } from './readerStore';
import { useExtensionActionsStore } from './extensionActionsStore';
import { useLayoutStore } from './layoutStore';
import { useMediaStore } from './mediaStore';
import { useGesturesStore } from './gesturesStore';
import { useFavoritesStore } from './favoritesStore';
import { useAparejosStore } from './aparejosStore';
import { useUrlBarStore } from './urlBarStore';
import { useTitleBarIconStore } from './titleBarIconStore';
import { useSyncStore } from './syncStore';
import { useMultiWindowStore } from './multiWindowStore';

export * from './workspacesStore';
export * from './treeStore';
export * from './runtimeStore';
export * from './uiStore';
export * from './workspaceModalStore';
export * from './overlayStore';
export * from './rulesStore';
export * from './toastStore';
export * from './addressBarStore';
export * from './profilesStore';
export * from './profileModalStore';
export { initSubscriptions } from './subscriptions';
export * from './readerStore';
export * from './deviceEmulationStore';
export * from './extensionActionsStore';
export * from './layoutStore';
export * from './mediaStore';
export * from './tabSwitcherStore';
export * from './gesturesStore';
export * from './favoritesStore';
export * from './resourcesStore';
export * from './aparejosStore';
export * from './urlBarStore';
export * from './titleBarIconStore';
export * from './syncStore';
export * from './multiWindowStore';

export interface BootstrapResult {
  ready: boolean;
  error: Error | null;
}

export function useBootstrap(): BootstrapResult {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      try {
        const cleanup = initSubscriptions();
        cleanups.push(cleanup);

        // context() devuelve windowId + profileId del frame: cada renderer
        // pertenece a un perfil concreto durante toda su vida. Lo guardamos
        // en runtimeStore para que cualquier consumidor pueda preguntar
        // "¿qué perfil sirve esta ventana?" sin volver a IPC.
        const ctx = await call(() => window.api.context());
        if (cancelled) return;
        useRuntimeStore.getState().setFrameContext(ctx);
        // ACTIVE_TAB_CHANGED se emite antes de que el renderer tenga listeners: inicializar desde context.
        if (ctx.activeTabId !== null) {
          useRuntimeStore.getState().setActiveTab(ctx.windowId, ctx.activeTabId);
        }

        await Promise.all([
          useWorkspacesStore.getState().hydrate(),
          useUiStore.getState().hydrate(),
          useProfilesStore.getState().hydrate(),
          useReaderStore.getState().hydratePrefs(),
          useExtensionActionsStore.getState().hydrate(),
          useLayoutStore.getState().hydrate(),
          useMediaStore.getState().hydrate(),
          useGesturesStore.getState().hydrate(),
          useFavoritesStore.getState().hydrate(),
          useTreeStore.getState().hydrateAnchored(),
          useAparejosStore.getState().hydrate(),
          useUrlBarStore.getState().hydrate(),
          useTitleBarIconStore.getState().hydrate(),
          useSyncStore.getState().hydrate(),
          useMultiWindowStore.getState().hydrate(),
        ]);
        if (cancelled) return;

        const activeId = useWorkspacesStore.getState().activeWorkspaceId;
        if (activeId) {
          await useTreeStore.getState().hydrateWorkspace(activeId);
        }
        if (cancelled) return;

        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return { ready, error };
}
