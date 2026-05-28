# ADR 0037 — Sesiones de historial agrupadas por día + gaps

**Fecha**: 2026-05-14
**Estado**: Aceptado
**Sub-fase**: 4E

## Contexto

`vela://history` necesita organizar las entradas de navegación en "sesiones"
que el usuario pueda restaurar. El campo `session_id` en la tabla `history`
ya existe (generado al arrancar Vela), pero solo identifica la sesión en curso.
Para sesiones pasadas de días anteriores, todos los registros de ese día tienen
`session_id` distintos pero no hay forma de saber cuándo se reinició la app.

## Decisión

Doble agrupación:

1. **Por día (SQL)**: `GROUP BY date(visited_at, 'unixepoch', 'localtime')`.
   El repositorio devuelve arrays de entradas por día. Esto es intuitivo ("todo
   lo de ayer", "todo el lunes").

2. **Por gap de 30 min (renderer)**: dentro de un mismo día, el renderer inserta
   separadores visuales cuando el tiempo entre dos entradas consecutivas supera
   30 minutos. Estos separadores son el límite entre "sesiones" restaurables.
   El botón "Restaurar sesión" abre todas las URLs del bloque como nuevas tabs.
   Si hay más de 15 URLs, se pide confirmación.

### HistoryRepository

Métodos principales:
- `search(query, workspaceId?)` → entradas LIKE por url+title, opcionales filtro workspace.
- `getDomainStats(limit)` → GROUP BY hostname con contador y última visita.
- `getForPeriod(from, to, workspaceId?)` → entradas entre dos timestamps.
- `deleteEntry(id)` → elimina una entrada.
- `deleteByDomain(hostname)` → elimina todas las entradas de un dominio.
- `deleteAll()` → trunca la tabla.

### IPC

- `history:search { query, workspaceId? }` → `HistorySuggestion[]`
- `history:get-by-day { date, workspaceId? }` → `HistoryEntry[]`
- `history:get-domain-stats` → `DomainStat[]`
- `history:delete-entry { id }` → `{ ok: true }`
- `history:delete-domain { hostname }` → `{ ok: true }`
- `history:delete-all` → `{ ok: true }`

## Alternativas descartadas

- **Usar `session_id` como agrupación primaria**: funciona para la sesión
  actual, pero las sesiones históricas de días anteriores no tienen información
  de cuándo se reinició la app. El resultado sería grupos arbitrarios e
  imposibles de reconstruir.
- **Almacenar eventos de inicio de sesión en tabla separada**: añade complejidad
  sin beneficio visible para el usuario. La agrupación por día es suficientemente
  intuitiva y más robusta.

## Consecuencias

- La lógica de detección de gaps vive en el renderer; el repositorio solo
  ordena por `visited_at ASC`. Si se necesita paginación futura, la detección
  de gaps debe moverse al repositorio o calcularse en chunks.
- "Restaurar sesión" abre tabs sin activarlas (background), salvo la primera.
  Si el workspace original ya no existe, las tabs se abren en el workspace activo.
