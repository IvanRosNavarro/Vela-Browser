import { useEffect } from 'react';
import { themeManager } from '../../shared-ui/theme';
import { AnchorsLayout } from './AnchorsLayout';

export function App() {
  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  return <AnchorsLayout />;
}
