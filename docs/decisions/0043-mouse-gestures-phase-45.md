# ADR 0043 — Gestos de ratón adelantados a Fase 4.5

## Estado
Aceptado — implementado en Fase 4.5.4b

## Contexto
Los gestos de ratón estaban planificados para post-1.0. Se adelantan a
Fase 4.5 porque la implementación es **renderer puro** (sin dependencias
nativas del SO), lo que la hace viable sin bloqueos de plataforma y sin
añadir complejidad de packaging.

## Decisión
- Detección en el renderer vía `pointerdown(button === 2)` +
  `pointermove` + `pointerup`.
- Umbral mínimo de 60px por segmento (configurable a 100px+).
- Segmentación de trazos: cada cambio de dirección ≥45° inicia un nuevo
  segmento.
- 6 gestos predefinidos:
  - ← : navegar atrás
  - → : navegar adelante
  - ↑ : nueva pestaña
  - ↓ : cerrar pestaña activa
  - ↑→ : reabrir última tab cerrada
  - ↓← : abrir Tab Switcher
- `GestureTrail` renderiza el trazo con `canvas` superpuesto usando el
  color `--vela-accent`.
- Estado en `gesturesStore` (Zustand).
- Configurables en `vela://settings#shortcuts`: umbral, trazo on/off,
  añadir/editar/eliminar gestos, resetear a defaults.
- Con Split View activo, `nav.back`/`nav.forward` aplica al panel
  enfocado.
- Si el patrón no se reconoce: el botón derecho actúa normalmente
  (menú contextual). Sin doble menú cuando sí se ejecuta un gesto.

## Alternativas descartadas
- **Detección en main (preload + IPC)**: innecesaria; los eventos de
  puntero son accesibles desde el renderer. Descartada.
- **Biblioteca nativa por plataforma**: añade dependencia nativa y
  asimetría en el packaging. Descartada.

## Consecuencias
- Gestos disponibles en Windows, macOS y Linux sin código específico
  de plataforma.
- Swipe de trackpad se mantiene en post-1.0 (ADR 0044) por asimetría
  de soporte.
- Limitación conocida: la detección solo inicia desde la chrome de Vela
  (shell). No se activa desde dentro del WCV.
