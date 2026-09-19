# ADR 0113 — Silenciar pestañas y selección múltiple

- Estado: aceptado
- Fecha: 2026-09-19
- Versión: v0.2.7

## Contexto

Vela detectaba el audio de las pestañas pero no podía silenciarlas, y no había
forma de actuar sobre varias pestañas a la vez.

## Decisión

### Silenciar

- `TabManager` guarda las pestañas silenciadas en memoria y llama a
  `setAudioMuted`. Si la pestaña aún no tiene vista, se silencia al crearla.
  **No se persiste** entre reinicios, como en Chrome.
- Canales `tab:set-muted` (en bloque) y `tab:get-muted`; evento
  `state:tab-muted-changed` con la lista completa.
- El indicador de audio de `TabRow` pasa a ser un botón de altavoz; el clic no
  activa la pestaña. Ítem en el menú contextual único (`tabContextMenu.ts`) y
  en el del sidebar flotante.
- Comando `tab.toggleMute` **sin atajo**: Chrome no trae ninguno y Ctrl+M lo
  usan muchas webs.

### Selección múltiple

- Ctrl+clic alterna; Shift+clic selecciona el rango en el orden visible del
  árbol, desde la última pulsada o desde la activa; clic normal limpia.
- **Escape**: la tabla de atajos lo consume para `nav.stop`, así que `nav.stop`
  también limpia la selección. Un comando propio con Escape chocaría en la
  `ShortcutTable`.
- La selección vive solo en el renderer (`tabSelectionStore`); la lógica pura
  (rango, poda, hueco de soltado) está en `@vela/shared/selection/`.
- Menú contextual en bloque: cerrar, nueva carpeta, mover a workspace,
  silenciar, duplicar y suspender. Arrastrar una seleccionada mueve todas.
- **Operaciones en bloque en main**, cada una en una transacción:
  `TreeNodeRepository.moveMany` (valida ciclos y hueco, emite `entity:changed`
  también por los descendientes que cambian de workspace), `groupIntoFolder` y
  `deleteMany`. `TabManager.closeTabs` emite un solo `TREE_CHANGED` por
  workspace; la limpieza de `closeTab` se extrajo a `teardownTab`.

## Consecuencias

- En Cargas y Anclas no hay botón de altavoz; se silencian desde el menú.
- Al arrastrar una selección solo se desplaza visualmente la fila agarrada.
- Duplicar y suspender en bloque van pestaña a pestaña.
