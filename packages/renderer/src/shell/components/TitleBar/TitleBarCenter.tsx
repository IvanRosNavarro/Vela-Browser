import type { CSSProperties } from 'react';
import { AddressBar } from '../../../components/AddressBar';
import { DragRegion } from './DragRegion';
import { useUiStore } from '../../../stores/uiStore';

export function TitleBarCenter() {
  // PASO 6: cuando el input de la URL está en modo edición, toda la zona
  // central se convierte en no-drag para que un click cercano no arrastre
  // la ventana accidentalmente mientras el usuario escribe.
  const addressBarEditing = useUiStore((s) => s.addressBarEditing);

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        alignItems: 'center',
        minWidth: 0,
        overflow: 'visible',
        // Cuando está editando, toda la zona hereda no-drag del padre.
        ...(addressBarEditing ? { WebkitAppRegion: 'no-drag' } : {}),
      } as CSSProperties}
    >
      {/* Pequeña zona de drag a la izquierda del input (desactivada al editar) */}
      {!addressBarEditing && (
        <DragRegion style={{ width: 8, alignSelf: 'stretch', flexShrink: 0 } as CSSProperties} />
      )}
      {addressBarEditing && (
        <div style={{ width: 8, alignSelf: 'stretch', flexShrink: 0, WebkitAppRegion: 'no-drag' } as CSSProperties} aria-hidden />
      )}

      {/* AddressBar: contiene nav buttons + url input + copy button */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          minWidth: 0,
          WebkitAppRegion: 'no-drag',
        } as CSSProperties}
      >
        <AddressBar />
      </div>

      {/* Zona de drag a la derecha del input (desactivada al editar) */}
      {!addressBarEditing && (
        <DragRegion style={{ width: 8, alignSelf: 'stretch', flexShrink: 0 } as CSSProperties} />
      )}
      {addressBarEditing && (
        <div style={{ width: 8, alignSelf: 'stretch', flexShrink: 0, WebkitAppRegion: 'no-drag' } as CSSProperties} aria-hidden />
      )}
    </div>
  );
}
