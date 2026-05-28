import { useEffect } from 'react';
import { themeManager } from '../../shared-ui/theme';
import { FavoritesLayout } from './components/FavoritesLayout';

export function App() {
  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  return <FavoritesLayout />;
}
