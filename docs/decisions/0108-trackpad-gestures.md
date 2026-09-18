# ADR 0108 — Gestos de trackpad

- Estado: aceptado
- Fecha: 2026-09-18
- Versión: v0.2.6

## Contexto

Vela no respondía a ningún gesto de trackpad:

- **Swipe de dos dedos para atrás/adelante**. Chrome lo implementa con la
  navegación por *overscroll* del navegador, que Electron no expone: ni
  evento, ni `webPreferences`, ni switch de Chromium que la active en un
  `WebContentsView`. El único gesto nativo es el `swipe` de `BrowserWindow`,
  que solo existe en macOS y solo con tres dedos si el sistema está
  configurado así.
- **Pellizcar para ampliar**. Electron desactiva el zoom visual por defecto.
- **Cambiar de workspace deslizando sobre la sidebar**, el gesto de Arc que
  el carrusel de v0.2.3 dejaba a medio camino.

La web no ve la fase de un gesto de trackpad (dedos apoyados, levantados,
inercia): solo recibe eventos `wheel` con `deltaX`/`deltaY`.

## Decisión

- **`SwipeTracker`** (`packages/shared/src/gestures/swipe.ts`) reconstruye el
  gesto a partir de los `wheel`. Es lógica pura, sin DOM ni dependencias, y
  la usan el preload de las pestañas y la sidebar. Reglas:
  - El gesto termina tras 150 ms sin eventos.
  - Cuenta como horizontal si |dx| ≥ 1,5·|dy| en los primeros 12 px.
  - Se consulta a quien lo usa (`canConsume`) una sola vez por gesto. Si la
    página puede absorber el desplazamiento, el gesto es suyo hasta el final.
  - Queda ligado a su dirección inicial: al volver atrás se cancela, no se
    convierte en el contrario.
  - Se arma a los 140 px. Confirma al soltar, o sin esperar a los 280 px:
    la inercia de un swipe decidido llega enseguida, y esperar a que se
    agote retrasaba la navegación de forma visible.
  - Se descarta el primer evento con un salto entero ≥ 100 px (rueda
    inclinable). Quien lo usa descarta además los eventos con Ctrl
    (pellizco) y con Shift (scroll horizontal con la rueda).
- **Swipe en pestañas**: el preload `webTab.ts` escucha `wheel` pasivo en la
  fase de burbuja de `window`, para ver el `defaultPrevented` de mapas y
  carruseles. Solo actúa si ningún contenedor bajo el cursor ni la página
  pueden desplazarse más en esa dirección. Al empezar cada gesto pide a main
  `trackpad:get-state` (ajuste, `canGoBack`, `canGoForward`); al confirmar
  envía `trackpad:navigate`.
- **La burbuja se pinta dentro de la propia página**: un elemento propio
  (`vela-swipe-indicator`) con estilos `!important` y shadow DOM cerrado.
  Así no compite con el WCV y no hace falta overlay ni `BrowserWindow`. Se
  construye con la API del DOM, sin `innerHTML` ni `<style>`, para pasar las
  CSP estrictas y Trusted Types de las webs.
- **Los canales `trackpad:*` no llevan `guardTrustedFrame`**: los invoca el
  preload de las pestañas. A cambio solo atienden a un WebContents que sea
  pestaña del usuario, y solo mueven el historial de esa misma pestaña, que
  es lo que la página ya puede hacer con `history.back()`.
- **Pellizco**: `TrackpadGestures` (`packages/main/src/gestures/`) aplica
  `setVisualZoomLevelLimits(1, 3)` a cada pestaña en cada `dom-ready`, porque
  los límites viven en el renderer y navegar a otro sitio puede cambiar de
  proceso. Zoom visual, no de página: amplía hacia el punto del gesto sin
  recolocar el contenido y se pierde al navegar. Al cambiar el ajuste se
  reaplica a todas las pestañas sin recargar.
- **Sidebar**: `useWorkspaceSwipe` usa el mismo tracker con umbral de 70 px
  y confirma al armarse. Ejecuta `workspace.next` / `workspace.previous`, así
  que se comporta como los atajos, y el carrusel da la respuesta visual.
- **Ajustes** en `vela://settings#shortcuts`, globales y activos por
  defecto: `gestures:trackpad-navigation`, `gestures:pinch-zoom` y
  `ui:workspace-swipe`. Este último es global aunque empiece por `ui:`, para
  aprovechar `UI_SETTINGS_CHANGED` y que la shell lo aplique al momento.
- El preload importa el tracker por subruta (`@vela/shared/gestures/swipe`)
  para no meter zod en `webTab.js`. Por eso el alias de Vite del preload
  resuelve ahora subrutas de `@vela/shared`.

## Consecuencias

- Los umbrales se fijaron sin trackpad físico. Hay que ajustarlos con uso real
  en Windows y macOS: están todos en `DEFAULT_SWIPE_OPTIONS` y en
  `SIDEBAR_SWIPE`.
- No hay swipe sobre iframes (el listener vive en el main frame), ni en las
  páginas `vela://` (usan el preload interno, compartido con la shell), ni en
  el sidebar flotante.
- Una web que escuche `wheel` en `window` y haga `preventDefault` después que
  nuestro listener no bloquea el swipe. Los listeners sobre el documento o sobre
  elementos, que son la norma, sí.
