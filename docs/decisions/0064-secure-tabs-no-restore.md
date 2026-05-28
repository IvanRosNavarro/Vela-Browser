# ADR 0064 — Las tabs blindadas no se restauran ni sincronizan

## Estado
Aceptado — Fase 5.0.4

## Contexto
Al cerrar y reabrir Vela, el `TabManager` restaura las tabs de la sesión anterior. Las tabs blindadas deben ser completamente efímeras por diseño.

## Decisión
Las tabs blindadas:
- NO se persisten en la tabla `tree_nodes` de `profile.db`.
- NO generan previews ni entradas en la tabla `history`.
- NO se incluyen en el payload de sync de Fase 2.
- NO se restauran en el arranque siguiente.
- NO disparan el evento `state:tab-created` hacia el renderer con `restorable: true`.

El campo `secure: true` en el objeto de tab en memoria es la bandera que aplica todas estas exclusiones.

## Consecuencias
**Ventajas:**
- Garantía de efimería por diseño; no se puede filtrar accidentalmente.
- Sin cambios en el flujo de restauración: las tabs blindadas simplemente no están en la lista a restaurar.

**Desventajas:**
- Si el usuario tenía tabs blindadas con trabajo en curso y Vela crashea, las pierde. Comportamiento esperado y documentado.
