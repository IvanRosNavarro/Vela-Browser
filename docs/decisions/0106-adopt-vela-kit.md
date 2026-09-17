# 0106 — Adoptar vela-kit, la base común de las aplicaciones Vela

Fecha: 2026-09-17
Estado: aceptado

## Contexto

Vela FTP nació copiando del navegador el logger, el guard de IPC, la CSP, los
temas, los toasts, el fuzzy matching, el registro de comandos, las migraciones
de SQLite y la title bar. Para no mantener dos copias que diverjan, esas piezas
se extrajeron a **vela-kit** (`IvanRosNavarro/Vela-Kit`, GPL-3.0-only): un único
paquete con subpaths (`vela-kit/logger`, `vela-kit/ipc`, `vela-kit/theme`…),
publicado como TypeScript fuente y consumido como dependencia git fijada a un
tag. Al extraerlas cambió la API (inyección de dependencias en lugar de
`window.api`, errores tipados, genéricos), así que adoptar el kit en el
navegador no es un simple cambio de import.

El navegador está en producción: la adopción no puede cambiar el
comportamiento.

## Decisión

Adoptar `vela-kit` (`#v0.3.0`) en `@vela/main` y `@vela/renderer` donde encaja
sin cambios de comportamiento. Cada módulo del navegador queda como **fachada**
con la misma API pública, de modo que sus consumidores (40+ handlers IPC, las
páginas internas, los stores) no se tocan.

### Adoptado

| Módulo del navegador | Del kit | Notas |
|---|---|---|
| `main/src/logger.ts` | `vela-kit/logger` | `initLogger()` fija `fileBaseName: 'vela'`: mismos `vela.log` y `vela.YYYY-MM-DD.log`, misma rotación. |
| `main/src/ipc/validate.ts` | `createFrameGuard` | `trustedPrefixes: ['vela://', 'file://']` y el origen exacto del dev server. `isTrustedFrame`/`guardTrustedFrame` se mantienen. El error lanzado pasa a ser `UntrustedFrameError` (subclase de `Error`; mismo aviso en el log). |
| `main/src/security/csp.ts` | `BASE_DEV_CSP`/`BASE_PROD_CSP` + `extendCsp` | `buildCspHeader(isDev)` se mantiene. `csp.test.ts` compara la cabecera con una copia literal de las políticas anteriores por conjuntos de directivas y fuentes. |
| `main/src/storage/db.ts`, `ProfileMigrationRunner.ts` | `transaction`, `migrationsFromGlob` | Mismo filtrado `NNN-nombre.sql` y orden. `transaction` se reexporta desde `db.ts`. |
| `main/src/window/createMainWindow.ts` | `titleBarWindowOptions` | Mismos valores: overlay de 32 px `#1a1a1a`/`#e0e0e0` en Windows, `hiddenInset` en macOS, `hidden` en el resto. |
| `main/src/index.ts` (`onWindowOpened`) | `watchMaximized` | Sustituye los dos listeners `maximize`/`unmaximize` que emiten `WINDOW_MAXIMIZED_CHANGED`. |
| `renderer/src/shared-ui/theme` | `ThemeManager`, temas builtin, `validateCustomCss` | `VelaThemeManager` extiende el del kit con `loadAndApply` (tema, temas custom, material, tipografía y CSS custom desde ajustes) y sincroniza el overlay DWM vía `onTitleBarColors` solo en `win32`. Los 8 temas builtin eran idénticos y salen del kit. El validador usa `allowedUrlSchemes: ['vela:']`. `variables.ts` se queda: sus valores de ejemplo difieren y solo se usan sus claves. |
| `renderer/src/stores/toastStore.ts`, `components/Toaster` | `toast`, `useToastStore`, `Toaster` | `toast()` devuelve ahora el id (antes `void`). El `Toaster` del kit usa estilos en línea equivalentes a las clases de Tailwind; única diferencia visual: la sombra (`0 10px 15px -3px rgba(0,0,0,.3)` frente a `shadow-lg`). |
| `renderer/src/lib/fuzzy.ts` | `fuzzyMatch`, `fuzzyFilter`, `highlightMatch` | Implementación idéntica; la interfaz de ADR 0042 no cambia. |

### No adoptado

- **`commands` y `shortcuts`** (`CommandRegistry`, `ShortcutTable`,
  `attachShortcuts`). No encajan sin cambios observables:
  - el parser del kit acepta `Home`, `End`, `PageUp` y `PageDown`; el del
    navegador los rechaza, así que `shortcuts:set` pasaría a aceptar
    combinaciones que hoy devuelve como `INVALID_SHORTCUT`;
  - `attachShortcuts` del kit invoca el comando en una microtarea en lugar de
    síncronamente, y no limpia el estado de edición de la barra de direcciones
    al desengancharse;
  - `InvalidCommandArgsError` no incluye el mensaje de zod, que hoy llega al log
    vía `mapError`.
  Lo específico del navegador (combos de sistema por modificador, alias
  `Ctrl+R`/`Ctrl+F5`/`Ctrl+E`, `mruCommit` al soltar Ctrl, paso de Escape con la
  barra de direcciones o el find bar activos) seguiría viviendo en el navegador,
  así que el ahorro es pequeño frente al riesgo en el camino del teclado.
- **`applyMigrations`/`openDatabase`**: el navegador registra con prefijos
  distintos (`[storage]`, `[profile-db]`), anota las ya aplicadas en debug y
  un resumen final; `ProfileMigrationRunner` y `upsertAppVersion` añaden lógica
  propia. Solo se toman `transaction` y `migrationsFromGlob`.
- **`TitleBar`** (componente): la de la shell (`shell/components/TitleBar/`)
  aloja descargas, favoritos, multimedia, split view y acciones de extensiones
  sobre el material acrílico; no es el marco genérico del kit.
- **`ErrorBoundary`**: el de `renderer/src/main.tsx` usa colores fijos (botón
  `#4f8ef7`) y el del kit variables del tema; cambiaría la pantalla de error.
- El resto de `vela-kit/ipc` (`ok`/`fail`, `validatePayload`, errores de
  dominio): los handlers usan los tipos de `@vela/shared` y el `mapError` propio
  con más códigos. Sin beneficio claro.

## Distribución y desarrollo

- Dependencia: `"vela-kit": "github:IvanRosNavarro/Vela-Kit#v0.3.0"` en
  `packages/main` y `packages/renderer`. Se compila dentro de los bundles de
  Vite (no queda ningún `require('vela-kit')` en `main/dist`), por eso **no** va
  en el `package.json` raíz que empaqueta electron-builder. No añade
  dependencias de runtime: `electron`, `react`, `zod` y `zustand` son peers que
  ya aporta el navegador.
- `pnpm kit:link [ruta]` / `pnpm kit:unlink`: enlaza una copia local del kit con
  una junction en `node_modules` sin tocar el lockfile (`pnpm link` lo
  reescribe). El CI falla si `pnpm-lock.yaml` enlaza `vela-kit` a `link:`.
- El renderer declara `resolve.dedupe: ['react', 'react-dom', 'zustand']` y
  permite la carpeta real del kit en `server.fs.allow`.
- Subir de versión el kit = cambiar el tag en ambos `package.json`,
  `pnpm install`, typecheck, tests y build, en un PR propio.
- El CI de vela-kit compila y prueba `main` de este repositorio con el kit de
  cada cambio (typecheck, tests de main comparados con el resultado del tag
  fijado, y build), así que un cambio del kit que rompa el navegador falla allí
  antes de publicarse.

## Consecuencias

- Un arreglo en el logger, el guard de IPC, la CSP base, los temas o el fuzzy
  llega a las dos apps desde un solo sitio, pero al navegador solo cuando sube
  el tag.
- Para añadir un tema builtin hay que hacerlo en el kit (antes bastaba con un
  fichero en `shared-ui/theme/themes/`).
- Las directivas propias de la CSP (Anthropic, `vela:`, `vela-preview:`,
  `ws://cert-error`) siguen definiéndose aquí.
- El validador de CSS custom sigue existiendo solo en el renderer: no hay
  validación equivalente en main antes de persistir `ui:custom-css` (situación
  previa, anotada en `docs/pending.md`).
