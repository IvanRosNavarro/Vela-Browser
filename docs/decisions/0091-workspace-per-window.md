# ADR 0091 — Workspace independiente por ventana

**Estado:** Aceptado  
**Fecha:** 2026-05-21

## Contexto

Con múltiples ventanas del mismo perfil, cada ventana necesita poder mostrar un
workspace diferente al mismo tiempo (ej: "Trabajo" en monitor 1, "Personal" en
monitor 2). También es válido que dos ventanas muestren el mismo workspace
simultáneamente.

## Decisión

Cada ventana tiene su propio `workspaceId` asignado, almacenado en:
- **En memoria**: `WindowRegistry.workspaceId` del entry correspondiente.
- **En disco**: columna `workspace_id` de `window_state`.

No existe restricción de "un workspace por ventana". El mismo workspace en dos
ventanas es un caso válido y útil.

Cuando una ventana secundaria se abre sin workspace asignado, el renderer muestra
el `WorkspaceSelector`: un overlay a pantalla completa con las cards de workspaces
disponibles. Al seleccionar uno, el main actualiza `window_state` y `WindowRegistry`,
y el renderer quita el overlay.

El botón de cambio de workspace en la title bar permite cambiarlo más tarde desde
el mismo overlay.

## Consecuencias

- Los cambios en tabs o workspaces se propagan a todas las ventanas (via broadcast).
- Cada ventana filtra en el renderer qué eventos le afectan según su propio
  `windowId`.
- `TabManager.setWorkspaceForWindow` es el único punto de entrada para cambiar el
  workspace activo de una ventana; no hay atajos directos desde el renderer.
