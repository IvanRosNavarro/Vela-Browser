# ADR-0028 — Buffer en memoria de tabs cerradas recientemente

## Estado
Aceptado — Sub-fase 4D, Prompt 4.2 (2026-05-13)

## Contexto
La Tab Switcher Modal necesita mostrar las tabs cerradas durante la sesión actual.
Se evaluaron dos enfoques: persistir en SQLite o mantener un buffer en memoria.

## Decisión
Buffer **en memoria** en `TabManager`, máximo 10 entradas por ventana (FIFO).
Almacena: `tabId`, `url`, `title`, `favicon`, `workspaceId`, `closedAt`.

## Motivación
- Dato efímero de sesión: el usuario espera que "tabs cerradas recientemente" haga
  referencia a la sesión actual, no a sesiones antiguas.
- No justifica el coste de una tabla SQLite + migración + ciclo de vida del historial.
- El historial completo a largo plazo (Sub-fase 4E) cubre el caso de recuperación
  de tabs de sesiones anteriores.

## Consecuencias
- El buffer se vacía al reiniciar Vela. Comportamiento esperado y documentado.
- No se sincroniza en Fase 2 (por diseño: es estado local de sesión).
- `tabs:recently-closed` IPC devuelve el buffer. `tabs:reopen` elimina la entrada
  al reabrir, manteniendo el buffer limpio.
