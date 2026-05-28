-- 002-workspaces-tree: modelo jerárquico de Fase 1.
-- Workspaces y un único árbol recursivo `tree_nodes` con `kind` discriminante
-- (folder | tab). Las relaciones padre/hijo se expresan por `parent_id`,
-- no por anidación estructural, para mantenerlo Yjs-friendly de cara a Fase 2.

CREATE TABLE workspaces (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  icon         TEXT,
  color        TEXT,
  position     TEXT NOT NULL,
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE tree_nodes (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id       TEXT REFERENCES tree_nodes(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('folder','tab')),
  position        TEXT NOT NULL,
  name            TEXT,
  color           TEXT,
  icon            TEXT,
  collapsed       INTEGER NOT NULL DEFAULT 0,
  url             TEXT,
  original_title  TEXT,
  favicon         TEXT,
  pinned          INTEGER NOT NULL DEFAULT 0,
  discarded       INTEGER NOT NULL DEFAULT 0,
  last_active_at  INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  CHECK (
    (kind = 'tab'    AND url IS NOT NULL AND original_title IS NOT NULL) OR
    (kind = 'folder' AND url IS NULL)
  ),
  CHECK (pinned = 0 OR parent_id IS NULL)
);

CREATE INDEX idx_tree_nodes_workspace
  ON tree_nodes(workspace_id);
CREATE INDEX idx_tree_nodes_parent
  ON tree_nodes(parent_id);
CREATE INDEX idx_tree_nodes_workspace_parent_position
  ON tree_nodes(workspace_id, parent_id, position);

-- Workspace por defecto. Hasta Fase 3 (multi-perfil) todo cuelga de aquí.
INSERT INTO workspaces (
  id, name, icon, color, position, archived, created_at, updated_at
) VALUES (
  'default', 'Default', NULL, NULL, 'a0', 0,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);
