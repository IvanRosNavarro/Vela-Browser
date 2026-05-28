# ADR-0029 — Fuzzy matching simplificado hasta Fase 4.5

## Estado
Aceptado — Sub-fase 4D, Prompt 4.2 (2026-05-13)

## Contexto
El Tab Switcher necesita filtrar tabs por texto. Se necesita un matcher que soporte
búsquedas aproximadas (typos tolerantes) sin añadir dependencias externas.

## Decisión
Implementar `fuzzyMatch` / `fuzzyFilter` en `packages/renderer/src/lib/fuzzy.ts`
con una lógica simplificada:
1. Substring exacto → score 100 (máxima prioridad).
2. Caracteres en orden con bonus por consecutivos.
3. Penalización por longitud de target vs query.

La **interfaz** (`fuzzyMatch(query, target): { match, score }` y `fuzzyFilter`) se
considera **estable**: en Fase 4.5 se sustituirá la implementación interna por el
matcher del command palette sin cambiar la firma.

## Consecuencias
- Cero dependencias externas nuevas.
- Búsquedas como "gtiub" → GitHub funcionan gracias al match por orden de caracteres.
- En Fase 4.5 se reemplaza solo el body de `fuzzyMatch`; los consumidores no cambian.
