import type { Section } from '../lib/router';
import type { useSettings } from '../lib/useSettings';
import { General } from '../sections/General';
import { Appearance } from '../sections/Appearance';
import { Tabs } from '../sections/Tabs';
import { Search } from '../sections/Search';
import { Profile } from '../sections/Profile';
import { Privacy } from '../sections/Privacy';
import { Shortcuts } from '../sections/Shortcuts';
import { Extensions } from '../sections/Extensions';
import { AI } from '../sections/AI';
import { AdBlocker } from '../sections/AdBlocker';
import { Aparejos } from '../sections/Aparejos';
import { Security } from '../sections/Security';
import { Sync } from '../sections/Sync';
import { About } from '../sections/About';

type SettingsHook = ReturnType<typeof useSettings>;

interface Props {
  section: Section;
  settings: SettingsHook;
}

const TITLES: Record<Section, string> = {
  general:    'General',
  appearance: 'Aspecto',
  tabs:       'Pestañas',
  search:     'Búsqueda',
  profile:    'Perfil',
  privacy:    'Privacidad',
  shortcuts:  'Atajos de teclado',
  extensions: 'Extensiones',
  aparejos:   '⚓ Aparejos',
  ai:         'Inteligencia Artificial',
  adblocker:  'Bloqueador de anuncios',
  security:   'Seguridad',
  sync:       'Sincronización',
  about:      'Acerca de Vela',
};

export function SettingsContent({ section, settings }: Props) {
  if (!settings.loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--vela-fg-muted)]">Cargando…</p>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-8">
        <h1 className="mb-6 text-xl font-semibold text-[var(--vela-fg)]">
          {TITLES[section]}
        </h1>
        {section === 'general'    && <General    settings={settings} />}
        {section === 'appearance' && <Appearance settings={settings} />}
        {section === 'tabs'       && <Tabs       settings={settings} />}
        {section === 'search'     && <Search     settings={settings} />}
        {section === 'profile'    && <Profile    settings={settings} />}
        {section === 'privacy'    && <Privacy    settings={settings} />}
        {section === 'shortcuts'  && <Shortcuts />}
        {section === 'extensions' && <Extensions />}
        {section === 'aparejos'   && <Aparejos />}
        {section === 'ai'         && <AI />}
        {section === 'adblocker'  && <AdBlocker settings={settings} />}
        {section === 'security'   && <Security  settings={settings} />}
        {section === 'sync'       && <Sync />}
        {section === 'about'      && <About />}
      </div>
    </main>
  );
}
