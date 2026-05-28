# ADR-0027 — Tab Switcher Modal

## Estado
Aceptado — Sub-fase 4D, Prompt 4.2 (2026-05-13)

## Contexto
La URL bar tenía un modo `@` para buscar pestañas abiertas con sugerencias inline. Esta
experiencia era limitada: no agrupaba por workspace, no mostraba tabs cerradas recientemente
y compartía espacio con el campo de texto de la URL.

## Decisión
Sustituir el modo `@` inline por un **Tab Switcher Modal** dedicado:
- `Ctrl+Shift+A` y `Ctrl+Shift+T` abren la modal.
- El modo `@` en la URL bar muestra el chip visual 150 ms y luego abre la modal (alias visual).
- La modal agrupa tabs por workspace (activo primero, resto por MRU), ofrece fuzzy search y
  muestra las últimas tabs cerradas de la sesión.

## Consecuencias
- Mejor UX: más espacio, agrupación clara, navegación por teclado completa.
- El comando `tab.reopenClosed` (Ctrl+Shift+T) ahora abre la modal en vez de reabrir
  directamente la última tab cerrada. La funcionalidad de reabrir sigue disponible dentro
  de la sección "Cerradas recientemente" de la modal.
- `addressBar.openTabsMode` pierde su `defaultShortcut`; el atajo pasa a `tabSwitcher.open`.
