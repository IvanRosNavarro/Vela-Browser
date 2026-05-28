# ADR-0030 — Modo @ en URL bar como alias del Tab Switcher

## Estado
Aceptado — Sub-fase 4D, Prompt 4.2 (2026-05-13)

## Contexto
El modo `@` de la URL bar era el punto de entrada a la búsqueda de tabs abiertas.
Ahora que existe la Tab Switcher Modal, hay que decidir qué hace el `@`.

## Decisión
El modo `@` actúa como **alias de apertura** de la Tab Switcher Modal:
1. El usuario escribe `@` en la URL bar.
2. El chip visual de modo `@` aparece 150 ms (feedback inmediato).
3. La URL bar se limpia y la modal se abre.
4. No se muestran sugerencias inline de tabs.

El mismo comportamiento aplica cuando `addressBar.openTabsMode` se activa
desde el command registry (aunque sin shortcut propio).

## Consecuencias
- Experiencia coherente: `@` y `Ctrl+Shift+A` llevan al mismo sitio.
- La URL bar se simplifica: el modo `tabs` deja de requerir IPC `suggest.query`
  con filtro `open-tab`.
- El chip visual de 150 ms evita el salto brusco: el usuario ve confirmación de
  que su `@` fue reconocido antes de que la modal aparezca.
