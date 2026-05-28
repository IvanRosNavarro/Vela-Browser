# ADR 0036 — Quick Notes en SQLite con debounce

**Fecha**: 2026-05-14
**Estado**: Aceptado
**Sub-fase**: 4E

## Contexto

Las Quick Notes son un bloque de texto libre por workspace en `vela://newtab`.
El usuario puede tomar apuntes rápidos sin cambiar de contexto. Las notas deben
sobrevivir reinicios de Vela y estar disponibles offline.

## Decisión

Tabla `quick_notes` en `profile.db`, creada en migración 008:

```sql
CREATE TABLE IF NOT EXISTS quick_notes (
  workspace_id TEXT PRIMARY KEY,
  content      TEXT NOT NULL DEFAULT '',
  updated_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
```

- Una fila por workspace. Si no existe fila, la nota está vacía.
- `workspace_id` como PK: no hay notas "huérfanas"; se borran en cascada si
  el workspace se elimina (FK con `ON DELETE CASCADE`).
- Debounce de 500 ms en el renderer antes de emitir `notes:save`. Esto evita
  escrituras en SQLite por cada tecla y mantiene la latencia de IPC baja.
- El renderer recibe la nota al cambiar de workspace vía `notes:get` (respuesta
  síncrona en el mismo IPC request-reply).

### IPC

- `notes:get { workspaceId }` → `{ content: string }`
- `notes:save { workspaceId, content }` → `{ ok: true }`

## Alternativas descartadas

- **localStorage**: no disponible en el renderer de Vela (política de no usar
  almacenamiento web; todo pasa por SQLite en main). Ver convenciones en
  CLAUDE.md.
- **Archivo de texto por workspace**: más complejo de gestionar (path, permisos,
  limpieza al borrar workspace). SQLite ya está abierto y es transaccional.
- **IndexedDB en el renderer**: misma razón que localStorage. El renderer no
  persiste estado; todo vive en main.

## Consecuencias

- En Fase 2 las notas se sincronizarán vía Yjs como `Y.Text` por workspace.
  La columna `content` actúa como snapshot inicial al abrir el perfil en un
  dispositivo nuevo; Yjs resolverá conflictos de edición concurrente.
- El debounce de 500 ms significa que si Vela se cierra forzosamente en esa
  ventana, los últimos cambios se pierden. Aceptable para notas rápidas.
