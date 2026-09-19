import { useEffect } from 'react';
import { IPC_EVENTS } from '@vela/shared';
import { useHashRoute } from './lib/router';
import { SettingsLayout } from './components/SettingsLayout';
import { themeManager } from '../../shared-ui/theme';
import { useUiStore } from '../../stores/uiStore';
import { useAparejosStore } from '../../stores/aparejosStore';
import { useUrlBarStore } from '../../stores/urlBarStore';
import { useTitleBarIconStore } from '../../stores/titleBarIconStore';
import { useSyncStore } from '../../stores/syncStore';

export function App() {
  const { section, navigate } = useHashRoute();
  const hydrate = useUiStore((s) => s.hydrate);

  useEffect(() => {
    themeManager.initialize();
    void Promise.all([
      hydrate(),
      useAparejosStore.getState().hydrate(),
      useUrlBarStore.getState().hydrate(),
      useTitleBarIconStore.getState().hydrate(),
      useSyncStore.getState().hydrate(),
    ]);
    return () => themeManager.destroy();
  }, [hydrate]);

  // vela://settings no monta initSubscriptions (solo la shell lo hace), así que sin
  // esto el aviso de login del sync no llegaba a esta página y había que recargarla
  // para que el paso "esperando al enlace" avanzara.
  useEffect(() => {
    const sync = useSyncStore.getState;
    const offs = [
      window.api.on(IPC_EVENTS.SYNC_CALLBACK_RECEIVED, (payload) => sync().setPendingToken(payload.token)),
      window.api.on(IPC_EVENTS.SYNC_STATUS_CHANGED, (payload) => sync().updateStatus(payload.status)),
      window.api.on(IPC_EVENTS.SYNC_SESSION_EXPIRED, () => sync().markSessionExpired()),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return <SettingsLayout section={section} onNavigate={navigate} />;
}
