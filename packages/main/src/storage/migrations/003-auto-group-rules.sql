-- 003-auto-group-rules: reglas configurables que mueven una tab recién
-- creada a una carpeta destino dentro del mismo workspace cuando la URL
-- (o el título) coincide con un patrón.
--
-- Modelo:
-- - Cada regla pertenece a un workspace y apunta a un folder de ese
--   workspace como destino.
-- - `priority` es el criterio de orden: la primera regla habilitada que
--   coincide gana. Más bajo = se evalúa antes.
-- - `match_type` discrimina cómo se interpreta `pattern`.

CREATE TABLE auto_group_rules (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pattern          TEXT NOT NULL,
  match_type       TEXT NOT NULL CHECK (match_type IN ('domain','regex','title-contains')),
  target_folder_id TEXT NOT NULL REFERENCES tree_nodes(id) ON DELETE CASCADE,
  priority         INTEGER NOT NULL,
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX idx_auto_group_rules_workspace
  ON auto_group_rules(workspace_id, priority);
