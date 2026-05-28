# ADR 0018 — URL bar: modos con prefijo

**Estado:** Aceptado
**Fase:** Sub-fase 4C.2
**Fecha:** 2026-05-12

## Contexto

La URL bar de Vela partía de una barra clásica: navegar a URL o buscar con el motor configurado. Para
la Sub-fase 4C se planteó añadir acceso rápido a tabs abiertas, historial, comandos del registry y
motores de búsqueda alternativos desde la misma barra, sin botones extra.

Se evaluaron dos modelos de diseño:

### Modelo A — Barra única tipo Vivaldi
La barra detecta el contexto automáticamente desde el primer carácter. Sin prefijos explícitos; el
modo se infiere de la entrada. Ventaja: invisible para el usuario. Desventaja: la inferencia puede
ser sorprendente (¿"github" es una URL, una búsqueda o el nombre de una tab abierta?) y es difícil
de extender sin heurísticas frágiles.

### Modelo C — Modos explícitos con prefijo (elegido)
El usuario escribe un carácter especial al inicio para activar un modo. Sin prefijo: comportamiento
clásico (URL / búsqueda). Con prefijo: modo específico. Cada modo muestra un chip de color que
confirma el estado activo.

## Decisión

Se implementa el **Modelo C** con los siguientes prefijos:

| Prefijo | Modo       | Descripción                                      |
|---------|------------|--------------------------------------------------|
| `>`     | `command`  | Comandos del registry central                    |
| `#`     | `history`  | Búsqueda en historial (stub en 4C; real en 4E)   |
| `@`     | `tabs`     | Tabs abiertas en todos los workspaces            |
| `!`     | `engine`   | Motor de búsqueda por alias (`!gh`, `!ddg`, …)   |

## Razones

- **Evolutivo sin reescritura**: la URL bar ya existía. Los modos se superponen a la lógica
  existente sin romper nada. El modo `history` real (Sub-fase 4E) se activa cambiando el stub
  sin tocar la detección de prefijos.
- **Predecible**: el usuario ve exactamente qué modo está activo gracias al chip. No hay
  inferencia silenciosa.
- **Convergencia futura opcional**: si en Fase 4.5 se decide unificar la barra y la paleta de
  comandos (`Ctrl+Shift+P`), el Modelo C facilita la transición: el modo `>` ya tiene la
  semántica de paleta.

## Implementación

La función `detectMode(input, customEngines)` en
`packages/renderer/src/components/AddressBar/useAddressBar.ts` lee el primer carácter de la
entrada y devuelve un objeto `ModeInfo { mode, query, engineAlias?, engineObj? }`.

Los atajos `Ctrl+Shift+T` (modo `@` / tabs) y `Ctrl+Shift+H` (modo `#` / historial) están
registrados en el command registry central y abren la URL bar con el prefijo ya escrito.

Los motores de búsqueda con alias (`!`) se configuran en `vela://settings#search`. La lista de
aliases builtin se define en `packages/shared/src/search.ts`.

## Consecuencias

- Añadir un nuevo modo requiere: (1) un carácter prefijo libre, (2) una entrada en
  `MODE_PREFIXES` en `useAddressBar.ts`, (3) lógica de sugerencias para ese modo.
- `Ctrl+Shift+P` sigue reservado para el command palette de Fase 4.5 (ADR 0006). El modo `>`
  de la URL bar es distinto: se activa desde la barra, no desde el atajo global.
- El modo `#` muestra un stub hasta Sub-fase 4E, cuando se añade la tabla `history` con
  `workspaceId` y se completa la búsqueda real.
