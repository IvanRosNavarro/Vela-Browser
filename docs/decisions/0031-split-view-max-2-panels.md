# ADR-0031 — Split View: máximo 2 paneles simultáneos

## Estado
Aceptado — Sub-fase 4D, Prompt 4D.1 (2026-05-14)

## Contexto
El diseño original contemplaba un posible grid 2×2 (cuatro paneles simultáneos). Durante la
implementación se evaluó el coste real de gestionar 4 WebContentsView con layouts, URL bars
y estados independientes.

## Decisión
Limitar Split View a **2 paneles simultáneos** (panel A y panel B) en los modos:
- `split-h`: dos paneles lado a lado, divisor vertical arrastrable.
- `split-v`: dos paneles arriba/abajo, divisor horizontal arrastrable.

El modo `single` es el estado por defecto (sin split).

El layout se persiste por workspace en la columna `layout_config` de la tabla `workspaces`
de `profile.db` (migración 007). Al cambiar de workspace, `LayoutManager.restoreLayoutForWorkspace`
aplica el layout guardado.

## Alternativa descartada
**Grid 2×2 (4 paneles)**: complejidad cuadrática de gestión de bounds, focus, URL bars y estado
IPC. El valor para el MVP no justifica ese coste. Aplazado a post-1.0.

## Consecuencias
- `LayoutManager` solo maneja `PanelId = 'a' | 'b'`.
- `TabManager.recalculateBounds()` se llama en: resize de ventana, cambio de ratio,
  cambio de workspace y apertura/cierre de split.
- Al cerrar el split, la tab del panel B permanece en el árbol de la sidebar; no se pierde.
- `Ctrl+Enter` en el Tab Switcher abre la tab en el panel no enfocado.
