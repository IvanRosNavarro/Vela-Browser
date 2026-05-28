import { useEffect } from 'react';
import { themeManager } from '../../shared-ui/theme';
import { NewTabLayout } from './components/NewTabLayout';

export function App() {
  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  return <NewTabLayout />;
}
