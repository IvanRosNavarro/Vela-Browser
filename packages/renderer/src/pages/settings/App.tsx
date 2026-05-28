import { useEffect } from 'react';
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

  return <SettingsLayout section={section} onNavigate={navigate} />;
}
