import { useCallback, useEffect, useState } from 'react';
import type { SettingsKey, SettingsScope } from '@vela/shared';

export type SettingsMap = Partial<Record<SettingsKey, unknown>>;

const DEFAULTS: SettingsMap = {
  'startup:restore-tabs': true,
  'startup:page': 'previous',
  'startup:custom-url': '',
  'updates:auto-check': true,
  'search:engine': 'duckduckgo',
  'search:customUrl': '',
  'search:suggestions': true,
  'privacy:block-third-party-cookies': false,
  'privacy:do-not-track': false,
  'privacy:dns-over-https': false,
  'privacy:doh-provider': 'cloudflare',
  'mru:scope': 'workspace',
  'mru:behavior': 'modal',
  'tabs:last-tab-action': 'new-tab',
  'tabs:confirm-close-window': false,
  'tabs:activate-new': true,
  'tabs:discard-enabled': true,
  'tabs:discard-timeout': 60,
  'tabs:discard-audio': true,
  'tabs:discard-forms': true,
  'tabs:discard-pinned': true,
  'tabs:discard-whitelist': '',
  'tabs:new-tab-page': 'newtab',
  'tabs:auto-collapse-folders': false,
  'ui:glassmorphism': false,
  'ui:glassmorphism-intensity': 60,
  'ui:glassmorphism-opacity': 60,
  'media:widget-enabled': true,
  'media:tab-indicator': true,
};

export function useSettings() {
  const [values, setValues] = useState<SettingsMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void window.api.settings.getAll({}).then((res) => {
      if (res.ok) setValues(res.data as SettingsMap);
      setLoaded(true);
    });
  }, []);

  const get = useCallback(
    <T>(key: SettingsKey, fallback: T): T => {
      const v = values[key] ?? DEFAULTS[key];
      return v !== undefined && v !== null ? (v as T) : fallback;
    },
    [values],
  );

  const set = useCallback(
    async (key: SettingsKey, value: unknown, scope?: SettingsScope) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      await window.api.settings.set({ key, value, ...(scope ? { scope } : {}) });
    },
    [],
  );

  return { get, set, loaded };
}
