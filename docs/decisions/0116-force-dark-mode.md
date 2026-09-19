# ADR 0116 — Modo oscuro forzado con Dark Reader

- Estado: aceptado
- Fecha: 2026-09-19
- Versión: v0.2.7

## Contexto

No había forma de oscurecer las webs que no traen tema oscuro. Se valoraron
tres motores: el flag `WebContentsForceDark` de Chromium (global y exige
reiniciar), un filtro CSS invert (calidad pobre) y Dark Reader. Se eligió
Dark Reader.

## Decisión

- **Dependencia** `darkreader` 4.9.132 (MIT, versión exacta) en el
  `package.json` raíz. Vite la mete dentro de `webTab.js`, así que el preload
  sigue siendo compatible con `sandbox: true`. `darkreader`, `malevic` y
  `@rollup` se excluyen del empaquetado en `electron-builder.config.cjs`
  porque no se usan en tiempo de ejecución.
- **Corre en el preload de la pestaña** (`packages/preload/src/darkMode.ts`),
  en el mundo aislado de `contextIsolation`. Se descartó ejecutarlo desde main
  con `executeJavaScriptInIsolatedWorld`: no es fiable en qué documento cae
  durante una navegación, y `dom-ready` llega tarde.
- **Sin destello**: al arrancar cada documento el preload pregunta al main de
  forma síncrona (`darkmode:get-state-sync`) y activa Dark Reader antes del
  primer pintado.
- **Hojas de otro origen**: `setFetchMethod` las pide al main
  (`darkmode:fetch`) sin credenciales, solo a URLs públicas
  (`isPublicHttpUrl`), sin redirecciones, solo `text/css` e `image/*`, con tope
  de 4 MB y solo para pestañas de usuario con el modo activo.
- **Webs que ya son oscuras**: se mide el fondo computado de `body`/`html` y el
  `color-scheme` con las hojas de Dark Reader pausadas; si ya era oscura, se
  retira, salvo excepción «Siempre oscuro».
- **Ajustes por perfil**, que se sincronizan: `darkmode:web` (Desactivado,
  Siempre, Seguir el tema de Vela), `darkmode:brightness`,
  `darkmode:contrast` y `darkmode:sites` (excepciones por host, válidas para
  subdominios). Se aplican en caliente al cambiar ajustes, tema de Vela o tema
  del SO. Lógica pura en `@vela/shared/darkmode/policy.ts`.
- **Por sitio** desde el menú contextual y el comando `darkmode.toggleSite`.
- Los canales `darkmode:*` no llevan `guardTrustedFrame` porque los invoca el
  preload de la pestaña; validan que el emisor sea una pestaña de usuario y su
  frame principal.

## Consecuencias

- Los iframes no se oscurecen.
- En webs cuya CSP prohíbe scripts inline, las reglas CSS-in-JS quedan sin
  adaptar (Dark Reader inyecta un proxy de CSSOM inline).
- Los ajustes recibidos por sync se aplican en la siguiente navegación.
- Cada documento web hace una llamada IPC síncrona breve al arrancar.
- El icono en la barra de URL queda pendiente.
