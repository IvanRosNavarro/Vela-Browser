# ADR 0042 — Mejora del fuzzy matcher con bonus por consecutivos y positions

## Estado
Aceptado — implementado en Fase 4.5.4

## Contexto
El `fuzzyMatch` / `fuzzyFilter` de `packages/renderer/src/lib/fuzzy.ts`
(implementado para el Tab Switcher en ADR 0029) usaba un algoritmo simple
que no distinguía matches por inicio de palabra ni consecutivos. El command
palette requería un ranking más preciso para ser útil con 40+ comandos.

## Decisión
- La implementación interna de `lib/fuzzy.ts` se sustituye por un
  algoritmo con:
  - **Bonus por inicio de palabra**: match en primera letra de cada
    palabra puntúa más.
  - **Bonus por consecutivos**: caracteres del query que aparecen
    seguidos en el target puntúan más.
  - **Campo `positions`**: el resultado incluye los índices de los
    caracteres coincidentes para que la UI pueda resaltarlos.
- La **interfaz pública** (`fuzzyMatch(query, target)` →
  `{ score, positions }` y `fuzzyFilter(query, items, key)`) no cambia,
  preservando compatibilidad con Tab Switcher y otros consumers.
- Tab Switcher Modal usa `positions` para resaltar los caracteres
  coincidentes con `<mark>`.

## Alternativas descartadas
- **Biblioteca externa** (fuse.js, uFuzzy): añade dependencia; la
  interfaz pública es estable y la implementación es reemplazable sin
  cambiar los consumers. Descartado.
- **Mantener implementación simple**: ranking insuficiente para el
  command palette con 40+ comandos. Descartado.

## Consecuencias
- Tab Switcher y Command Palette muestran caracteres coincidentes
  resaltados.
- En Fase 5 se puede sustituir la implementación de nuevo sin cambiar
  los consumers.
- No reemplazar `fuzzyMatch`/`fuzzyFilter` sin actualizar todos los
  consumers si cambia la interfaz.
