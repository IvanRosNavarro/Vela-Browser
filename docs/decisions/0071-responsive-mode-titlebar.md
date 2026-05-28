# ADR 0071 — Modo responsive: botón en TitleBar + DevModeModal

## Contexto

El modo responsive (Device Toolbar de Chrome DevTools) es una herramienta de desarrollo útil tanto para desarrolladores web que prueban sitios en Vela como para verificar el comportamiento responsive de páginas internas. Debe ser accesible desde la UI sin abrir DevTools manualmente.

## Decisión

El modo responsive tiene **dos puntos de entrada**:

1. **TitleBar** (`TitleBarRight.tsx`): botón siempre visible junto a Split View, Multimedia y Notificaciones. Usa `useDeviceEmulationStore` (ya implementado). Este punto de entrada es para usuarios que usan el modo responsive frecuentemente.

2. **DevModeModal**: botón "Modo responsive" dentro del modal unificado de herramientas de desarrollador (ADR 0069). Activa/desactiva las DevTools en modo detach mediante los canales IPC `devtools:open-responsive` y `devtools:close-responsive`.

### Implementación en main

Los canales IPC abren las DevTools con `webContents.openDevTools({ mode: 'detach' })`. El Device Toolbar de Chrome es un control interno de las DevTools; para activarlo programáticamente se puede usar CDP `Emulation.setDeviceMetricsOverride`, pero:

- Esto emula métricas sin abrir la UI de DevTools.
- El Device Toolbar visual solo existe dentro de la ventana de DevTools nativa.

**Fallback documentado**: si el usuario quiere el Device Toolbar visual, debe activarlo dentro de DevTools con `Ctrl+Shift+M`. El botón en Vela abre las DevTools en posición correcta; el toggle del Device Toolbar queda en manos del usuario.

## Consecuencias

- El botón del TitleBar ya existía; no requiere cambios adicionales.
- `devtools:open-responsive` / `devtools:close-responsive` son canales nuevos que abren/cierran DevTools del tab activo.
- El DevModeModal muestra el estado activo del botón sincronizado con `useDeviceEmulationStore`.
