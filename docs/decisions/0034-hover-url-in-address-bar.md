# ADR-0034 — Barra de estado de hover integrada en la URL bar (animación 40/60)

## Estado
Aceptado — Sub-fase 4D, Prompt 4D.4 (2026-05-14)

## Contexto
Al pasar el cursor sobre un enlace en una página web, los navegadores muestran la URL de
destino en una barra de estado fija en el borde inferior de la ventana. Vela necesita una
solución equivalente.

## Alternativas evaluadas

1. **Barra de estado fija en borde inferior**: añade ~20 px de altura permanente a la ventana.
   Visible aunque no haya ningún enlace en hover. Coste de espacio constante.

2. **Animación 40/60 en la URL bar existente** (elegida): cuando hay hover activo, la URL
   actual se comprime al 40% del espacio y la URL de destino aparece en el 60% restante,
   separadas por un indicador `→`. Al salir del hover, la URL vuelve al 100% con fade-out.

3. **Overlay sobre el WCV**: técnicamente imposible sin `useOverlayStore.acquire()`, que
   ocultaría el WCV por completo. No apropiado para un indicador transitorio.

## Decisión
**Opción 2**: animación 40/60 en la URL bar. La barra inferior se aplaza a post-1.0 como
opción configurable para usuarios que la prefieran.

## Implementación
- El preload detecta `mouseover`/`mouseout` sobre elementos `<a>` con debounce de 50 ms.
- Emite `hover-url:set` (con la URL destino y el tabId) y `hover-url:clear` al main.
- El main reenvía al renderer vía `state:hover-url-changed`.
- El renderer filtra por tabId del panel activo (soporte Split View: cada panel tiene su
  propio tabId y actualiza solo su URL bar).
- `HoverUrlDisplay.tsx` renderiza la animación dentro de `AddressBar.tsx`.
- URLs `mailto:`, `javascript:` y anclas `#` no activan la animación.
- El hostname externo (dominio diferente al de la página actual) se muestra con `font-weight 500`
  y opacidad plena. El hostname del mismo dominio aparece atenuado.
- La animación no interrumpe el modo edición de la URL bar.

## Consecuencias
- Reutiliza el espacio existente de la URL bar sin coste de layout.
- La URL actual siempre sigue visible al 40% (no desaparece completamente).
- La barra inferior como opción configurable se añade al backlog de post-1.0.
