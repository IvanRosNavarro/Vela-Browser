-- 022-vault-tombstones: lápidas de las entradas borradas del vault.
--
-- El vault viaja por sincronización como un blob con lo que existe ahora. Sin
-- lápidas, borrar una contraseña en un dispositivo no se propagaba: el otro
-- equipo hacía upsert de lo que le llegaba, no encontraba nada que dijese "esto
-- se ha borrado", y en su siguiente subida la resucitaba para todos.
--
-- Solo se guarda el id y cuándo se borró. Ni el dominio ni el usuario: la
-- lápida no debe filtrar qué credencial existió. `kind` distingue a qué tabla
-- pertenecía (password | address | card) para aplicar el borrado en la
-- correcta al recibirla.
--
-- Se podan al cabo de 90 días (VAULT_TOMBSTONE_TTL_MS): pasado ese plazo, un
-- dispositivo que lleve tanto tiempo sin sincronizar tiene problemas mayores
-- que una entrada resucitada.

CREATE TABLE vault_tombstones (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('password', 'address', 'card')),
  deleted_at INTEGER NOT NULL
);

CREATE INDEX idx_vault_tombstones_deleted_at ON vault_tombstones(deleted_at);
