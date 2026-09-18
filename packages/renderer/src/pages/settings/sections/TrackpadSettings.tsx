import { SettingRow, SettingSection } from '../components/SettingRow';
import { Toggle } from '../components/controls/Toggle';
import { useSettings } from '../lib/useSettings';

export function TrackpadSettings() {
  const { get, set, loaded } = useSettings();
  if (!loaded) return null;

  return (
    <SettingSection title="Gestos de trackpad">
      <SettingRow
        label="Deslizar con dos dedos para ir atrás o adelante"
        description="Cuando la página no puede desplazarse más en horizontal, aparece una flecha en el borde; suelta al rellenarse para navegar."
      >
        <Toggle
          value={get<boolean>('gestures:trackpad-navigation', true)}
          onChange={(v) => void set('gestures:trackpad-navigation', v)}
        />
      </SettingRow>
      <SettingRow
        label="Pellizcar para ampliar"
        description="Amplía hacia el punto del gesto sin recolocar la página. Se pierde al navegar."
      >
        <Toggle
          value={get<boolean>('gestures:pinch-zoom', true)}
          onChange={(v) => void set('gestures:pinch-zoom', v)}
        />
      </SettingRow>
      <SettingRow
        label="Deslizar sobre la sidebar para cambiar de workspace"
        description="Hacia la izquierda, el siguiente; hacia la derecha, el anterior."
      >
        <Toggle
          value={get<boolean>('ui:workspace-swipe', true)}
          onChange={(v) => void set('ui:workspace-swipe', v)}
        />
      </SettingRow>
    </SettingSection>
  );
}
