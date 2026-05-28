import { useEffect } from 'react';
import { themeManager } from '../../shared-ui/theme';
import { ScriptsLayout } from './components/ScriptsLayout';

export function App() {
  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  return <ScriptsLayout />;
}
