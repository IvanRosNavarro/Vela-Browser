export const migration001 = `

-- Usuarios: solo email, sin datos personales.
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER
);

-- Tokens de magic link (se invalidan al usar).
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id)
             ON DELETE CASCADE,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

-- Sesiones de dispositivo (TTL: 90 días).
CREATE TABLE IF NOT EXISTS device_sessions (
  token        TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id)
               ON DELETE CASCADE,
  device_name  TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

-- Perfiles sync (uno por perfil de Vela).
CREATE TABLE IF NOT EXISTS sync_profiles (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id)
             ON DELETE CASCADE,
  name_ct    BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Entidades sincronizadas (blobs cifrados E2EE).
-- Last-write-wins por entity_type + id.
CREATE TABLE IF NOT EXISTS sync_entities (
  id          TEXT NOT NULL,
  profile_id  TEXT NOT NULL REFERENCES sync_profiles(id)
              ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  data_ct     BLOB,
  -- NULL si deleted = 1.
  updated_at  INTEGER NOT NULL,
  -- Timestamp del cliente (para LWW).
  deleted     INTEGER NOT NULL DEFAULT 0,
  server_seq  INTEGER NOT NULL DEFAULT 0,
  -- Autoincremento lógico asignado en router.ts.
  PRIMARY KEY (profile_id, entity_type, id)
);

CREATE INDEX IF NOT EXISTS idx_entities_profile_seq
  ON sync_entities(profile_id, server_seq);

-- Secuencias por perfil para server_seq atómico.
CREATE TABLE IF NOT EXISTS profile_sequences (
  profile_id TEXT PRIMARY KEY
             REFERENCES sync_profiles(id)
             ON DELETE CASCADE,
  last_seq   INTEGER NOT NULL DEFAULT 0
);

-- Documentos Yjs para quick_notes (uno por workspace).
CREATE TABLE IF NOT EXISTS sync_ydocs (
  workspace_id TEXT NOT NULL,
  profile_id   TEXT NOT NULL REFERENCES sync_profiles(id)
               ON DELETE CASCADE,
  doc_ct       BLOB NOT NULL,
  updated_at   INTEGER NOT NULL,
  server_seq   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, workspace_id)
);

-- Vault cifrado (un blob por perfil).
CREATE TABLE IF NOT EXISTS sync_vaults (
  profile_id TEXT PRIMARY KEY
             REFERENCES sync_profiles(id)
             ON DELETE CASCADE,
  vault_ct   BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  server_seq INTEGER NOT NULL DEFAULT 0
);

`;
