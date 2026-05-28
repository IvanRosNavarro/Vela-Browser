# ADR 0060 — Modales del vault como BrowserWindow hijo

## Estado
Aceptado — Fase 5.0.3

## Contexto
El modal de guardado y el de autocompletado necesitan renderizarse sobre el WebContentsView activo. El mismo problema resuelto en ADRs 0047 y 0056.

## Decisión
Ambas modales (guardado y autocompletado) se implementan como `BrowserWindow` hijo de la ventana principal: `frame: false`, `transparent: true`, `alwaysOnTop: false` (hereda el z-order del padre). Cargan páginas `vela://vault-save` y `vela://vault-fill` respectivamente.

## Consecuencias
**Ventajas:**
- Renderiza sobre el WCV sin conflicto de capas nativas.
- Preload dedicado con `contextBridge` limpio; sin `nodeIntegration`.
- Consistente con el patrón establecido (filepicker, context menu, ad blocker panel).

**Desventajas:**
- Cada modal es una ventana nativa extra con su propio renderer process.
- Se cierra por blur como las demás ventanas popup.
