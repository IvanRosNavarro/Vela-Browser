-- 001-init: esquema base de profile.db (Fase 3 Prompt 6).
--
-- A partir de Fase 3 cada perfil tiene su propia BD en
-- userData/profiles/{uuid}/profile.db. Aquí viven las tablas que en
-- Fase 1 estaban en vela.db: workspaces, tree_nodes, auto_group_rules,
-- y dos tablas key/value específicas del perfil:
--
--   - profile_metadata: estado del perfil (last-active-workspace,
--     last-active-tab-{ws}, mru:stack-global, ...). NO son ajustes
--     configurables por el usuario.
--   - settings_profile: ajustes que pertenecen a un perfil concreto
--     (ui:theme, mru:scope, search:engine, etc.). Mismo formato
--     key/value pero scope distinto a app_metadata (vela.db) o a
--     profile_metadata.
--
-- El workspace "default" del perfil NO se inserta aquí: lo crea
-- ProfileManager.createProfile vía WorkspaceRepository tras aplicar
-- la migración, para mantener la convención de IDs/posiciones del
-- repositorio.
--
-- password_vault llega en Prompt 7 (cifrado real).

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

CREATE TABLE profile_metadata (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE settings_profile (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
