import { useEffect } from 'react';
import { themeManager } from '../../shared-ui/theme';
import { HistoryLayout } from './components/HistoryLayout';

export function App() {
  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  return <HistoryLayout />;
}
