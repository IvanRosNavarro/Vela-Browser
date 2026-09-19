# ADR 0111 — Zoom de página

- Estado: aceptado
- Fecha: 2026-09-19
- Versión: v0.2.7

## Contexto

Vela no tenía zoom de página: ni Ctrl+rueda, ni Ctrl+=/−/0, ni zoom recordado
por sitio. El zoom visual por pellizco (ADR 0108) es otra cosa y se mantiene.

## Decisión

- **`ZoomManager`** (`packages/main/src/zoom/`) se engancha a cada pestaña en
  `onTabViewWired`, traduce `zoom-changed` (Ctrl+rueda) a los escalones de
  Chrome (25–500 %), persiste el factor y lo reaplica en `did-navigate`.
- **Por sitio y por perfil** en `zoom:per-site` (mapa host→factor; 100 % borra
  la entrada). La clave es el hostname exacto, sin puerto y sin quitar `www.`:
  es la granularidad del `HostZoomMap` de Chromium, que ya propaga el zoom entre
  pestañas del mismo host en memoria. Con otra clave, lo guardado y lo que
  muestra Chromium divergirían.
- **No se sincroniza** (`zoom:` en `NON_SYNCABLE_PREFIXES`): depende de la
  pantalla de cada equipo.
- **Comandos** `zoom.in` (Ctrl+=), `zoom.out` (Ctrl+-) y `zoom.reset` (Ctrl+0).
- **Alias por carácter** (`ShortcutTable.registerKeyAlias`): la tabla casa por
  tecla física, y Ctrl+= solo acierta con distribución de EE. UU. Los alias
  casan por `input.key`, así que Ctrl con «+», «=», «-» o «0» funciona en
  cualquier distribución y en el teclado numérico. Solo se consultan si ningún
  atajo físico coincide y no se registran si el usuario borró el atajo.
- **Indicador** en la barra de URL (icono configurable `zoom`) solo cuando no es
  100 %; abre el popup nativo `vela://zoom-popup` con −, %, + y Restablecer.
  Fila de zoom en el menú de Vela.
- **Páginas `vela://`** tienen zoom recordado por página. En `file:`, `about:` y
  similares se puede ampliar, pero no se recuerda.
- **Pestañas fantasma** heredan el zoom guardado, pero lo que cambian no se
  escribe en el perfil: delataría qué sitios se visitaron.
- `urlbar:get-config` completa las configuraciones guardadas con los iconos que
  les falten, para que los iconos nuevos aparezcan a quien ya tenía la barra
  configurada.

## Consecuencias

- En macOS Chromium no emite `zoom-changed`: Ctrl+rueda no hace zoom (igual que
  Chrome en Mac); los atajos sí.
- Touchpads no precisos emulan el pellizco con Ctrl+rueda real, indistinguible:
  en esos equipos el pellizco cambia también el zoom de página, como en Chrome.
- En teclado español, Ctrl+' también aleja (tecla física `Minus`).
