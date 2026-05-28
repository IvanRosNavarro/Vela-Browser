import type { Section } from '../lib/router';
import { useSettings } from '../lib/useSettings';
import { SettingsSidebar } from './SettingsSidebar';
import { SettingsContent } from './SettingsContent';

interface Props {
  section: Section;
  onNavigate: (s: Section) => void;
}

export function SettingsLayout({ section, onNavigate }: Props) {
  const settings = useSettings();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--vela-bg-app)]">
      <SettingsSidebar section={section} onNavigate={onNavigate} />
      <SettingsContent section={section} settings={settings} />
    </div>
  );
}
