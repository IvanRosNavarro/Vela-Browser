# ADR 0090 — Cierre de ventana primaria con secundarias abiertas

**Estado:** Aceptado  
**Fecha:** 2026-05-21

## Contexto

Cuando el usuario cierra la ventana primaria de un perfil y hay ventanas
secundarias abiertas del mismo perfil, la acción puede ser inesperada: cerrar
solo la primaria dejaría ventanas secundarias huérfanas de identidad "primaria".

## Decisión

Al cerrar la ventana primaria con secundarias abiertas se muestra un diálogo de
confirmación:

> "Hay N ventanas adicionales abiertas de este perfil. ¿Cerrar todas?"  
> [Cerrar todas] [Cancelar]

- **Cancelar**: no se cierra ninguna ventana.
- **Cerrar todas**: todas las ventanas del perfil se cierran de forma ordenada.

No existe el concepto de "promover una ventana secundaria a primaria" porque la
designación de primaria solo afecta a este comportamiento de cierre; no cambia
ningún dato del perfil.

Cerrar una ventana secundaria no muestra ningún diálogo.

## Consecuencias

- El usuario nunca pierde ventanas secundarias por accidente al cerrar la primaria.
- No se añade complejidad de "transferencia de primaria": al reiniciar Vela
  siempre abre exactamente una ventana, que toma el UUID del registro `is_primary=1`.
