# ADR 0056 — Panel del ad blocker como BrowserWindow hijo

## Estado
Aceptado — Fase 5.0.2

## Contexto
El panel del ad blocker muestra el contador de bloqueos, el desglose por categoría y el toggle de excepción por sitio. Necesita renderizarse sobre el WebContentsView activo, que es una capa nativa de Electron.

## Decisión
Implementar el panel como `BrowserWindow` hijo de la ventana principal (`parent: mainWindow, frame: false, transparent: true, focusable: true`), igual que el preview hover de Fase 4.5.

## Consecuencias
**Ventajas:**
- El WCV no tapa el panel (son capas nativas del mismo nivel jerárquico).
- Sin necesidad de `useOverlayStore` ni recálculo de bounds.
- Se cierra por blur (el usuario hace clic fuera).

**Desventajas:**
- Requiere IPC para enviar datos de bloqueo al panel.
- Al cambiar de workspace el panel debe reposicionarse o cerrarse.

**Alternativa descartada:** DOM del renderer. El WCV siempre tapa el HTML, incluso con z-index alto. No viable sin ocultar el WCV completamente.
