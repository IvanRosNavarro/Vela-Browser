# ADR 0012 — Estrategia de title bar: overlay en Windows, semáforos en macOS, botones custom en Linux

## Estado
Aceptado — Sub-fase 4A (mayo 2026).

## Contexto

Vela necesita un title bar que:

1. Sea arrastrable (mover la ventana).
2. Aloje la barra de direcciones y controles de navegación.
3. Se integre correctamente con los botones del SO en cada plataforma.
4. Sea estilizable para responder a los temas de la app.

### Restricciones por plataforma

- **Windows**: los Snap Layouts de Windows 11 requieren que el botón
  maximizar sea el botón nativo del sistema (o que el overlay lo
  cubra con un área específica). Un botón 100 % custom no activa el
  menú de Snap. Además, el color del marco de la ventana (DWM) puede
  actualizarse vía `BrowserWindow.setTitleBarOverlay`.
- **macOS**: los semáforos (close / minimize / zoom) tienen
  comportamiento nativo no reimplementable de forma fidedigna
  (gestos, estados de focus de Mission Control, etc.). Intentar
  reemplazarlos siempre produce regresiones.
- **Linux**: no existe un estándar de decoraciones de ventana; cada
  compositor (GNOME/KDE/XFWM) hace lo suyo. La opción más
  predecible es dibujar los 3 botones en el renderer y usar
  `frame: false`.

### Alternativas evaluadas

| Estrategia | Descripción | Veredicto |
|---|---|---|
| **Full custom en las 3 plataformas** | `frame: false` + botones React | Roto en macOS (semáforos) y Windows (Snap Layouts) |
| **Nativo en las 3 plataformas** | Title bar del SO, sin personalización | Sin integración visual; la barra de direcciones queda debajo |
| **`titleBarStyle: 'hidden'` + `trafficLightPosition` (macOS)** | Solo macOS: semáforos en custom position | No aplica a Windows/Linux; requiere solución diferente por plataforma |
| **Overlay en Windows, semáforos en macOS, custom en Linux** *(elegida)* | Cada plataforma recibe la solución más adecuada | Mayor complejidad condicional pero sin regresiones nativas |

## Decisión

Se adopta una **estrategia diferenciada por plataforma**:

### Windows — `titleBarOverlay`

```js
// BrowserWindow options
titleBarStyle: 'hidden',
titleBarOverlay: {
  color: themePrimaryColor,
  symbolColor: themeTextColor,
  height: TITLEBAR_HEIGHT,
}
```

- Los botones nativas de Windows (minimizar / maximizar / cerrar)
  quedan superpuestos como overlay sobre el renderer.
- El área de arrastre se marca con `-webkit-app-region: drag` en CSS;
  los controles interactivos (botones, inputs) tienen
  `-webkit-app-region: no-drag`.
- `BrowserWindow.setTitleBarOverlay({ color, symbolColor })` se llama
  cada vez que el tema activo cambia, para que el DWM de Windows
  actualice el color del marco y los iconos de los botones.
- Los Snap Layouts funcionan porque el botón maximizar sigue siendo
  el overlay nativo del sistema.

### macOS — `titleBarStyle: 'hiddenInset'` + `trafficLightPosition`

```js
titleBarStyle: 'hiddenInset',
trafficLightPosition: { x: 12, y: (TITLEBAR_HEIGHT - 12) / 2 },
```

- Los semáforos se mantienen nativos en su posición habitual.
- El resto del title bar es React; la región a la izquierda de los
  semáforos es arrastrable.
- No se llama a `setTitleBarOverlay` en macOS (no tiene efecto).

### Linux — `frame: false` + botones custom

```js
frame: false,
```

- Se renderizan 3 botones en React (minimizar / maximizar / cerrar)
  que llaman a `BrowserWindow.minimize()`, `maximize()` /
  `unmaximize()` y `close()` vía IPC.
- El evento `maximize` / `unmaximize` del BrowserWindow actualiza el
  icono del botón central.
- Sin decoraciones del compositor: la ventana dibuja su propio borde
  con CSS `border-radius` y `box-shadow`.

### Fullscreen (todas las plataformas)

Al entrar en fullscreen (`F11` / `View > Fullscreen`), la shell
React oculta el componente `TitleBar` con una clase CSS. Al salir,
lo restaura. El main emite `window:fullscreen-change` vía IPC para
que el renderer actualice su estado.

## Consecuencias

- El módulo `packages/main/src/window/createMainWindow.ts` lee
  `process.platform` y elige las opciones de `BrowserWindow`
  correspondientes.
- El componente `TitleBar` del renderer recibe una prop `platform`
  (inyectada vía preload desde `process.platform`) y renderiza la
  variante correcta.
- Cuando el tema cambia, el store del renderer llama a
  `window.velaApi.setTitleBarOverlay(color, symbolColor)` — el
  preload lo reenvía al main solo en Windows; en otros OS es no-op.
- El sistema queda abierto para refinar el diseño por plataforma sin
  cambiar la arquitectura: basta con editar el componente
  correspondiente o los parámetros de `BrowserWindow`.
