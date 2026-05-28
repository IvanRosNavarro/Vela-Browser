-- 004-profiles: tabla `profiles` en la BD principal (vela.db).
--
-- A partir de Fase 3, vela.db SOLO contiene metadatos globales:
--   - app_metadata, schema_migrations (existentes)
--   - profiles (nuevo)
--
-- Las tablas workspaces, tree_nodes y auto_group_rules pasan a vivir en la
-- BD de cada perfil (userData/profiles/{uuid}/profile.db). Esa migración la
-- hace el Prompt 8 cuando se mueven los datos del perfil "default" actual.
--
-- partition_id es estable de por vida del perfil: corresponde a la
-- session.fromPartition(...) de Electron; cambiarlo dejaría huérfana toda
-- la sesión del navegador. El UNIQUE lo garantiza a nivel de BD.

CREATE TABLE profiles (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  icon                  TEXT,
  color                 TEXT,
  position              TEXT NOT NULL,
  partition_id          TEXT NOT NULL UNIQUE,
  has_master_password   INTEGER NOT NULL DEFAULT 0,
  password_hint         TEXT,
  archived              INTEGER NOT NULL DEFAULT 0,
  last_used_at          INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX idx_profiles_position ON profiles(position) WHERE archived = 0;
