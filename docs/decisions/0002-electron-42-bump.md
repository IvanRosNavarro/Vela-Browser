# ADR 0002 — Versión inicial de Electron y política de bumps

- Estado: aceptado
- Fecha: 2026-05-06
- Fase: 0 — Cimientos (Paso 3, validación de extensiones)
- Reemplaza la mención a "Electron 30.x" del ADR 0001 y de la primera
  versión del CLAUDE.md.

## Contexto

El esqueleto inicial del monorepo (Fase 0 — Paso 1) y la ventana mínima
(Paso 2) se construyeron con `electron@30.0.9`, que era la versión vigente
cuando se escribió el primer CLAUDE.md. Al entrar en el Paso 3 — validación
de las 4 extensiones del Chrome Web Store que el usuario considera
imprescindibles (Bitwarden, uBlock Origin, Cookie-Editor, Analytics Debugger)
— apareció un blocker técnico:

- Manifest V3 enruta el background de las extensiones a través de
  **service workers**, no de páginas HTML invisibles como en MV2.
- Para que `electron-chrome-extensions` (la integración que usamos para
  cargar extensiones de Chrome Web Store) maneje correctamente esos service
  workers, Electron necesita exponer
  `Session.registerPreloadScript` y `ServiceWorkerMain.ipc`.
- Esa infraestructura aterrizó upstream en **Electron 35.0.0**
  (4 marzo 2025) — PR `electron/electron#44411`.
- Electron 30 quedó por debajo de ese corte: extensiones MV3 no cargan
  bien (Bitwarden y Cookie-Editor están en MV3 desde finales de 2023 y
  2024 respectivamente).

Quedarnos en E30 implicaba aceptar que el navegador no tendría gestor de
contraseñas funcional. Inviable para el público objetivo.

## Decisión

1. **Pinneamos Electron `42.0.0`** como versión inicial del proyecto.
   Es la última stable publicada (5 mayo 2026, EOL programado para el
   22 septiembre 2026 según
   [el calendario oficial de Electron](https://releases.electronjs.org/schedule)).
2. **Política de bumps:** seguimos la línea estable más reciente. Antes
   del EOL de la mayor que tengamos pinneada, abrimos un nuevo ADR
   (`000N-electron-XX-bump.md`) que documente:
   - Versión origen → versión destino.
   - Breaking changes upstream que nos afecten (ver
     `https://github.com/electron/electron/blob/main/docs/breaking-changes.md`).
   - APIs que cambian de comportamiento en nuestro código.
   - Resultado del re-typecheck, re-build y smoke test de `pnpm dev`.
3. **No usamos versiones EOL** ni siquiera transitoriamente. Si el bump
   no se puede hacer a tiempo por algún bloqueo, lo escalamos como
   incidencia, no lo dejamos correr.
4. La versión exacta vive en tres `package.json` y debe ser **idéntica**
   en los tres: raíz (devDep para que `electron .` resuelva desde el bin
   local), `packages/main` (devDep, el único que la consume realmente)
   y `packages/preload` (devDep para los `.d.ts`). pnpm dedupea al store
   `.pnpm/electron@<ver>` así que no hay duplicación real.

## Consecuencias

### Positivas
- Soporte completo para Manifest V3 (service worker preload scripts,
  IPC con SW vía `ServiceWorkerMain.ipc`, registro de preload scripts a
  nivel de session). Desbloquea Bitwarden, Cookie-Editor y cualquier
  extensión MV3 que añadamos en fases posteriores.
- Saltamos 12 mayores de golpe (E30 → E42), pero las APIs que el
  esqueleto actual usa (`app`, `BrowserWindow`, `webContents`,
  `contextBridge`) llevan estables varios mayores. Ninguna ruptura
  detectada en el smoke test.
- Chromium ~142, V8 14.x, Node 22.x. APIs web modernas disponibles desde
  el día uno.

### Negativas
- Ventana de soporte corta (~4-5 meses hasta EOL de E42). Tendremos que
  bumpear con cierta frecuencia. Mitigación: la política de "siempre
  estable más reciente" hace que cada bump sea un salto de 1 mayor, no
  uno gigante como este.
- `electron-builder@24.13.3` — nuestra versión actual del empaquetador
  — fue publicada antes de E42. Cuando lleguemos a producir instaladores
  habrá que comprobar que la rama 24 todavía soporta E42 o, más
  probable, bumpear electron-builder a la rama 26 que ya conoce versiones
  recientes. Anotado para Fase 0 — Paso 5.
- `electron-chrome-extensions` (4.x) ha sido testeada principalmente
  contra E35+. No hemos visto problemas con E42 en el smoke test, pero
  si aparecen incompatibilidades con APIs muy nuevas habrá que vigilar
  el repo upstream.

## Verificación

Tras el bump (este mismo ADR):

- `pnpm install` resuelve sin conflictos. El binario de E42 se descarga
  vía postinstall (autorizado en `pnpm.onlyBuiltDependencies`).
- `pnpm typecheck` pasa los 4 paquetes sin warnings nuevos.
- `pnpm build` produce los mismos tres bundles que con E30, sin cambios
  de tamaño relevantes.
- `pnpm dev` arranca: Vite renderer en :5173, watch builds OK, Electron
  lanza 5 procesos (browser + GPU + utility + renderer + crashpad), DevTools
  abre en modo detach. Sin errores en consola del main.

## Alternativas descartadas

- **E41** (más conservador, EOL 25 ago 2026): añadiría apenas 5 semanas
  más sobre E42 y ya tendríamos que bumpear igualmente en la siguiente
  fase. No compensa.
- **E40** (EOL 30 jun 2026): mismo argumento, menos margen.
- **E39 que pidió originalmente el usuario**: salió de soporte el
  5 mayo 2026, justo el día antes de esta decisión. Descartada.

## Revisión

Este ADR debe revisarse cuando:
- La fecha actual se acerque al EOL de E42 (22 septiembre 2026).
- Aparezcan breaking changes en Electron que impacten nuestras APIs
  centrales (`WebContentsView`, `session`, `contextBridge`).
- `electron-chrome-extensions` deje de soportar la línea de Electron
  que tengamos.
