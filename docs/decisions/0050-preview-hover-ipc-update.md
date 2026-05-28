# ADR 0050 — Preview hover: tab-preview:update sin hide+show

## Estado
Aceptado — implementado en Fase 4.5.4d

## Contexto
Cuando el usuario mueve el cursor de una tab a otra sin salir del
sidebar, el preview debe cambiar de contenido. La implementación
naive sería `tab-preview:hide` + `tab-preview:show` (con delay), lo
que produce un parpadeo visible y una espera innecesaria.

## Decisión
- Al detectar `mouseenter` en una nueva fila mientras el preview ya
  está visible: emitir `tab-preview:update` en lugar de
  `hide` + `show`.
- `tab-preview:update` actualiza el contenido de la BrowserWindow
  existente (nueva imagen, título, favicon, dominio) sin ocultarla
  ni mostrarla de nuevo.
- El delay de 500ms (ADR 0049) solo se aplica al mostrar el preview
  desde oculto. El `update` es instantáneo.
- La BW de preview se desliza verticalmente a la posición de la nueva
  tab (animación CSS `transition: top 150ms ease`).

## Alternativas descartadas
- **hide + show con delay**: parpadeo visible y 500ms de espera
  innecesaria entre tabs. Descartado.
- **hide + show sin delay**: parpadeo visible. Descartado.

## Consecuencias
- Cambio fluido entre tabs en hover. Sin parpadeo. Sin delay adicional.
- La BW permanece visible durante toda la sesión de hover en el sidebar.
- Se oculta solo cuando el cursor sale del sidebar completamente.
