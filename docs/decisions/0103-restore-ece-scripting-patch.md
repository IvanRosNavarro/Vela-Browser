# 0103 — Restaurar el parche de `chrome.scripting` y `tabs.sendMessage` de ECE

Fecha: 2026-09-04
Estado: aceptado

Revierte parcialmente el ADR 0098.

## Contexto

El ADR 0098 retiró 178 de las 185 líneas del parche de
`electron-chrome-extensions`, dejándolo reducido a `sandbox: false` en el
`PopupView`. El argumento era correcto en abstracto: Electron 42 implementa
`chrome.scripting` y `chrome.tabs.sendMessage` de forma nativa, y las versiones
del parche eran peores —en particular, el wrapper de `sendMessage` descartaba
el callback y dejaba la promesa colgada—.

Lo que ese análisis no tuvo en cuenta es que el parche no era solo una
reimplementación: contenía un **apaño deliberado** para Bitwarden. Su
`sendMessageToTab` devolvía `undefined` de forma incondicional, con este
comentario:

> Return undefined immediately — no content scripts to relay to.
> Bitwarden MV3 will fall back to `scripting.executeScript` when it gets
> undefined here.

Es decir, el relay no pretendía entregar el mensaje: existía para que Bitwarden
descartara la vía de los content scripts y tomara la de `scripting`, que en Vela
sí funcionaba. Al pasar a la `tabs.sendMessage` nativa, Bitwarden deja de hacer
ese fallback y el popup se queda **con la lista de elementos vacía** — el mismo
síntoma que provocaron los tres intentos de keep-alive del service worker
(ADR 0097), y por eso se confundió con ellos.

La verificación de 0098 se hizo "con una extensión de prueba". El ADR 0097 ya
había establecido, tras tres releases fallidas seguidas (v0.1.21, v0.1.22,
v0.1.23), que una extensión sintética **no reproduce este fallo**: no tiene
vault que descifrar ni estado en memoria que perder. Esa condición no se aplicó
al desmontar el parche.

## Decisión

Se restaura el parche completo de v0.1.20:

- `ScriptingAPI` en el proceso main de ECE: `scripting.executeScript`
  (ruta nativa para `files`, relay con función serializada para `func`),
  `insertCSS`, `removeCSS`, y `registerContentScripts` /
  `unregisterContentScripts` / `getRegisteredContentScripts` como no-op.
- `tabs.sendMessage` con el relay que devuelve `undefined` para forzar el
  fallback de Bitwarden.
- `sandbox: false` en el `PopupView`, que ya estaba.

Se conserva **todo lo demás** de v0.1.21: la `ChromeExtensionImpl` completa
(ADR 0098), los atajos de teclado de extensiones (ADR 0099), la deduplicación
una-extensión-una-copia y el i18n de manifiestos. El parche y esos hooks operan
sobre superficies distintas: `packages/main/src/index.ts` no menciona
`scripting`, `sendMessage` ni `executeScript` en ninguna línea.

## Consecuencias

- El popup de Bitwarden vuelve a listar los elementos del vault.
- Se renuncia, de momento, a las implementaciones nativas de Electron 42 para
  esas dos APIs. La crítica técnica del ADR 0098 sigue siendo válida: el
  wrapper de `sendMessage` pierde el callback. La diferencia es que ese defecto
  es tolerable y el popup vacío no lo es.
- El parche reintroduce sus `console.log('[vela-ece] …')`. Se dejan a propósito:
  documentan qué ruta toma Bitwarden en cada llamada y son el único rastro
  disponible cuando el popup falla en una instalación real.

## Regla que queda

Cualquier cambio en el parche de ECE o en la integración con extensiones debe
probarse contra **una instalación real de Bitwarden con sesión iniciada** antes
de publicarse. Ya son cuatro releases (v0.1.21, v0.1.22, v0.1.23 y el
desmontaje del parche) que pasaron la prueba en la máquina de desarrollo o con
una extensión sintética y fallaron en la instalación del usuario. La regla ya
estaba escrita en el ADR 0097; lo que faltó fue aplicarla aquí.
