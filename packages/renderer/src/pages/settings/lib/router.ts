import { useCallback, useEffect, useState } from 'react';

export type Section =
  | 'general'
  | 'appearance'
  | 'tabs'
  | 'search'
  | 'profile'
  | 'privacy'
  | 'shortcuts'
  | 'extensions'
  | 'aparejos'
  | 'ai'
  | 'adblocker'
  | 'security'
  | 'sync'
  | 'about';

const VALID: ReadonlySet<string> = new Set<Section>([
  'general', 'appearance', 'tabs', 'search', 'profile',
  'privacy', 'shortcuts', 'extensions', 'aparejos', 'ai', 'adblocker', 'security', 'sync', 'about',
]);

function fromHash(): Section {
  const h = window.location.hash.slice(1);
  return VALID.has(h) ? (h as Section) : 'general';
}

export function useHashRoute() {
  const [section, setSection] = useState<Section>(fromHash);

  useEffect(() => {
    function onHashChange() {
      setSection(fromHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((s: Section) => {
    window.location.hash = s;
    setSection(s);
  }, []);

  return { section, navigate };
}
