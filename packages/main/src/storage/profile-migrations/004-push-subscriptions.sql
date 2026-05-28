-- 004-push-subscriptions: suscripciones push por perfil + campo source (Sub-fase 4C.3b).
--
-- push_subscriptions almacena los datos de suscripción que Chromium genera al llamar
-- pushManager.subscribe(). Las claves p256dh y auth_secret se guardan para mostrar
-- información al usuario y como registro de qué subscripciones existen; el cifrado
-- real de los mensajes push lo hace Chromium internamente.
-- Ver ADR 0015, 0016.

CREATE TABLE push_subscriptions (
  id            TEXT PRIMARY KEY,
  origin        TEXT NOT NULL UNIQUE,
  endpoint      TEXT NOT NULL,
  p256dh_key    BLOB NOT NULL,
  auth_secret   BLOB NOT NULL,
  created_at    INTEGER NOT NULL,
  last_push_at  INTEGER
);

CREATE INDEX idx_push_subscriptions_origin
  ON push_subscriptions(origin);

-- Añade campo source a notifications para distinguir notificaciones web directas
-- ('web', Notification API) de notificaciones enviadas por Service Worker push ('push').
ALTER TABLE notifications
  ADD COLUMN source TEXT NOT NULL DEFAULT 'web';
