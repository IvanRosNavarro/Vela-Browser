# ADR 0069 — Icono unificado ti-code para herramientas de desarrollador

## Contexto

En los prompts 5.0.5 (Userscripts) y 5.0.6 (Bug Snapshot) se añadieron herramientas de desarrollador. Cada una podría tener su propio icono en la URL bar, pero eso saturaria la barra con iconos avanzados que la mayoría de usuarios nunca usa.

## Decisión

Se usa un único icono `ti-code` en la URL bar como punto de entrada unificado para herramientas de desarrollador:

- **Oculto por defecto** (feature avanzada — se activa en Aspecto > Barra de direcciones).
- **Estado**: opacity 0.4 sin scripts activos, opacity 1.0 + accent con scripts activos en la URL actual.
- **Click**: abre `DevModeModal` (React portal con overlay — el modal cubre el WCV).
- **DevModeModal** agrupa:
  - Lista de scripts activos para la URL actual (con toggle enable/disable).
  - Botón "Capturar snapshot de bug".
  - Botón "Modo responsive" (abre DevTools en modo detach).

### Accesos secundarios que se mantienen

- Scripts: command palette → "Abrir gestor de scripts" + `vela://scripts`.
- Bug Snapshot: command palette → "Capturar snapshot de bug".

### Futuras herramientas de dev

Se añadirán como botones en `DevModeModal`, no como iconos nuevos en la URL bar.

## Consecuencias

- La URL bar no crece con iconos de herramientas avanzadas.
- El usuario que no conoce la feature nunca la verá (oculto por defecto).
- El modo responsive pasa a tener dos puntos de entrada: TitleBar (siempre visible) y DevModeModal (solo si el icono está habilitado).
