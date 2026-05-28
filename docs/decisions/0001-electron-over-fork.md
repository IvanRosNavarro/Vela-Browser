# ADR 0001 — Electron como wrapper en lugar de hacer un fork de Chromium

- Estado: aceptado
- Fecha: 2026-05-06
- Fase: 0 — Cimientos
- Nota: la versión exacta de Electron se decide en el ADR 0002 y puede
  cambiar a lo largo del proyecto. Este ADR cubre la decisión de usar
  Electron como wrapper, no la versión.

## Contexto

Vela es un navegador de escritorio inspirado en Arc y Zen. Los navegadores
contemporáneos suelen seguir uno de tres caminos:

1. **Fork de Chromium** (Brave, Vivaldi, Opera, Arc en su origen): control
   total sobre el motor, pero requiere mantener un fork de un proyecto de
   millones de líneas, integrar parches de seguridad upstream cada pocas
   semanas, y construir una infraestructura de build pesada (depot_tools,
   GN/Ninja, varios días de compilación por release inicial).
2. **Wrapper sobre Chromium vía Electron / CEF / WebView2**: se delega el
   motor a un runtime mantenido por terceros, y la app se concentra en UX,
   organización de pestañas, sincronización, etc.
3. **Motor propio** (Servo, Ladybird, Gecko): inviable para un equipo
   pequeño con horizonte de meses.

Vela arranca con un equipo reducido y necesita iterar rápido en producto
(workspaces, pestañas verticales, sidebar, IA, sincronización E2EE). El motor
de renderizado es una commodity para el alcance de Vela: no aspiramos a
diferenciarnos por motor sino por organización y flujo de trabajo.

## Decisión

Usaremos **Electron** como runtime (versión exacta tracked en
`package.json`; ver ADR 0002 para la versión inicial y la política de bumps).
Cada pestaña web será un `WebContentsView` (la API moderna que reemplaza a
`BrowserView`). El proceso principal será la única fuente de verdad para
estado persistente; el renderer se limita a UI.

No haremos fork de Chromium. No mantendremos parches sobre el motor.

## Consecuencias

### Positivas
- Coste de mantenimiento bajo: las actualizaciones de Chromium llegan vía
  bumps de versión de Electron, no rebases dolorosos.
- Time to market acortado: podemos enfocar al equipo en producto en lugar de
  build infrastructure.
- Ecosistema maduro: `electron-builder`, `electron-updater`,
  `electron-chrome-extensions` cubren empaquetado, autoactualización y carga
  de extensiones de Chrome Web Store sin reinventar nada.
- IPC tipado main↔renderer es un patrón ya conocido y documentado.

### Negativas
- Sin acceso a APIs internas de Chromium: ciertas integraciones profundas
  (gestor de procesos a nivel renderer, hooks en el pipeline de red) no son
  posibles sin parchear Electron, lo cual no haremos.
- Bundle más pesado que un binario nativo: cada release embebe el runtime de
  Electron (~150 MB). Asumido.
- Dependencia del ciclo de releases de Electron: si Electron retrasa una
  versión, retrasa también nuestra integración de parches de seguridad de
  Chromium. Mitigación: seguir la rama estable y hacer bumps puntuales.
- Algunas APIs cambian entre versiones de Electron (p. ej. la deprecación
  de `BrowserView` en favor de `WebContentsView`). Hay que vigilarlo en los
  changelogs antes de cada bump.

## Alternativas descartadas

- **Tauri**: usa el WebView del sistema operativo (WebKit en macOS/Linux,
  WebView2 en Windows). Inconsistencias de motor entre plataformas, y
  WebKit en Linux está rezagado respecto a Chromium. Descartado para un
  navegador, donde la coherencia del motor de renderizado es crítica.
- **Fork de Chromium**: descartado por coste de mantenimiento (ver Contexto).
- **Reusar el código de Arc, Zen u otros**: licencias incompatibles o
  proyectos no diseñados para reutilización.

## Revisión

Revisar esta decisión si:
- Necesitamos modificar comportamiento del motor de red (p. ej. inyectar
  ad-blocking nativo a nivel pipeline) y los hooks de Electron resultan
  insuficientes.
- Electron deja de mantener actualizaciones rápidas de Chromium.
- El equipo crece lo suficiente como para que un fork sea sostenible.
