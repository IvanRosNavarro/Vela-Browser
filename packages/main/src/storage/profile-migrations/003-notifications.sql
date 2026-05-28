-- 003-notifications: tabla de notificaciones web por perfil (Sub-fase 4C.3).
--
-- Cada perfil almacena sus propias notificaciones en esta tabla.
-- Los permisos por origin se guardan en settings_profile bajo la clave
-- 'notifications:permissions' como JSON (NotificationPermission[]).
-- Las reglas de silencio se guardan en 'notifications:silence-rules'.

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  origin      TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  icon        TEXT,
  timestamp   INTEGER NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  tab_id      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_notifications_origin
  ON notifications(origin);
CREATE INDEX idx_notifications_read
  ON notifications(read, timestamp DESC);
