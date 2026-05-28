# ADR 0038 — Vista de grafo del historial aplazada a post-1.0

**Fecha**: 2026-05-14
**Estado**: Aplazado
**Sub-fase**: 4E

## Contexto

Una vista de grafo del historial mostraría las relaciones de navegación entre
páginas (qué páginas se visitaron desde qué otras, qué búsquedas llevaron a qué
sitios). Sería un differenciador visual frente a Chrome y Firefox.

## Decisión

La vista de grafo se aplaza a post-1.0.

## Razones

1. **Datos no disponibles**: la tabla `history` no almacena el campo `referrer`
   (qué URL originó la navegación). Sin ese campo no se puede reconstruir el
   grafo de navegación. Añadirlo ahora requiere una migración más y cambios en
   el hook `did-navigate` de `TabManager`.

2. **Librería de visualización**: renderizar un grafo interactivo requiere una
   librería (d3-force, cytoscape.js, react-flow). Cada una añade peso al bundle
   y su licencia debe revisarse contra GPL-3.0. El coste de evaluación e
   integración no está justificado para MVP.

3. **Coste desproporcionado**: la implementación estimada es 2-3 semanas para
   un único usuario en MVP. La agrupación por día y la vista de dominios cubren
   el 90% de los casos de uso reales.

## Plan si se retoma

1. Añadir columna `referrer TEXT` a `history` (migración nueva).
2. Registrar `event.referrer` en el hook `did-navigate` de `TabManager`.
3. Evaluar licencias: d3-force (ISC ✓), cytoscape.js (MIT ✓), react-flow
   (MIT ✓). Cualquiera es compatible con GPL-3.0.
4. Añadir ruta `/graph` en `vela://history` con el componente de visualización.

## Consecuencias

Ninguna para Sub-fase 4E. El campo `referrer` no se añade ahora; si en el futuro
se decide implementar el grafo, habrá que backfill con `NULL` para entradas
anteriores a la migración.
