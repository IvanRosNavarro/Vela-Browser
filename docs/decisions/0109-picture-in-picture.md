# ADR 0109 — Imagen en imagen automática

- Estado: aceptado
- Fecha: 2026-09-19
- Versión: v0.2.7

## Contexto

Vela no tenía imagen en imagen (PiP) de ningún tipo. Arc y Zen la activan solos
al salir de una pestaña que reproduce vídeo, y es lo que se espera de un
navegador centrado en pestañas. `requestPictureInPicture()` exige activación de
usuario, y el WCV de una pestaña oculta se reduce a 1×1 px (`HIDDEN_BOUNDS`).

## Decisión

- **`TabManager` informa del conjunto de pestañas visibles** de cada ventana con
  el hook `onVisibleTabsChanged`: la activa en modo single y las de cada panel
  en Split View. Se llama al final de `recalculateBounds` y de
  `setWorkspaceForWindow`, y con `null` en `detachWindow`. Un overlay (paleta,
  modales) no cuenta como dejar de ver la pestaña.
- **`PipManager`** (`packages/main/src/media/`) compara con el conjunto anterior:
  - Si una pestaña deja de verse, espera 150 ms (absorbe Ctrl+Tab y el cierre de
    la activa), comprueba que siga oculta en todas las ventanas y paneles y que
    esté sonando, recorre todos los frames (`framesInSubtree`, también iframes
    de otro origen) y pide PiP del vídeo más grande con
    `WebFrameMain.executeJavaScript(…, true)`: el `userGesture` aporta la
    activación, como en los controles multimedia (ADR 0033).
  - Si vuelve a verse, sale de PiP solo si entró automáticamente.
- **Criterios** (lógica pura en `pipPolicy.ts`, con tests): reproduciéndose, ni
  silenciado ni a volumen 0 (fuera los autoplay mudos), no en bucle sin audio,
  al menos 200×112 px y sin `disablePictureInPicture`. Con la vista a 1×1 px se
  usa el tamaño intrínseco del vídeo.
- **Estado real** lo informa el preload (`enterpictureinpicture` /
  `leavepictureinpicture` → `media:pip-changed`). `DiscardManager` no descarta
  una pestaña en PiP. Las pestañas suspendidas se alcanzan con
  `TabManager.getLiveViewForTab()`.
- **Manual**: ítem en el menú contextual de vídeos (el frame viaja como
  `processId` + `frameToken` y main comprueba que es de esa pestaña), botón en el
  popup multimedia (`media:toggle-pip`) y comando `media.pictureInPicture` sin
  atajo.
- Ajuste global `media:auto-pip`, activo por defecto.

## Consecuencias

- No hace falta ninguna `webPreference` ni switch de Chromium.
- Con «Descartar pestañas al cambiar de workspace» activo, el PiP automático no
  actúa al cambiar de workspace: las pestañas se destruyen antes.
- Minimizar la ventana o cambiar de aplicación no activa el PiP.
- Si se cierra un PiP abierto dentro de un iframe, main no se entera hasta
  volver a la pestaña o navegar (el preload solo corre en el frame principal).
