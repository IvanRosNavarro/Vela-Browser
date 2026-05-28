-- 016-sync: tablas y columnas necesarias para sincronización E2EE (Fase 2).
--
-- sync_pending: cola offline. Cuando el cliente no puede conectar al servidor,
--   las mutaciones locales se encolan aquí. Al reconectar se vacía en bloque.
--   ON CONFLICT REPLACE garantiza LWW en la cola: si la misma entidad se modifica
--   varias veces offline, solo sobrevive la última versión.
--
-- updated_at en profile_favorites y adblocker_exceptions: necesario para el
--   algoritmo LWW. workspaces, tree_nodes y user_scripts ya tienen updated_at
--   desde sus migraciones originales.
--
-- ydoc_state en quick_notes: estado CRDT serializado de Yjs. Se actualiza
--   junto al campo content; permite merge sin pérdida entre dispositivos.
--
-- updated_at en settings_profile: permite sincronizar ajustes de perfil con LWW.

CREATE TABLE IF NOT EXISTS sync_pending (
  entity_type  TEXT    NOT NULL,
  entity_id    TEXT    NOT NULL,
  data_json    TEXT,
  updated_at   INTEGER NOT NULL,
  queued_at    INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

ALTER TABLE profile_favorites ADD COLUMN updated_at INTEGER;
UPDATE profile_favorites SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE adblocker_exceptions ADD COLUMN updated_at INTEGER;
UPDATE adblocker_exceptions SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE quick_notes ADD COLUMN ydoc_state TEXT;

ALTER TABLE settings_profile ADD COLUMN updated_at INTEGER;
