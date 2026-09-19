-- 021-vault-addresses-cards: direcciones y tarjetas para el autorrelleno,
-- junto a las contraseñas del vault del perfil.
--
-- Mismo esquema de cifrado que password_vault: XChaCha20-Poly1305 IETF con la
-- clave del perfil (ProfileKeyring, solo en memoria), BLOB con formato
-- nonce(24 bytes) || ciphertext+auth_tag.
--
-- A diferencia de password_vault, aquí no queda nada en claro salvo ids y
-- marcas de tiempo: todo el contenido de la entrada (nombre, dirección,
-- teléfono, número de tarjeta, titular, caducidad, etiqueta) va dentro de
-- data_encrypted como JSON. No hay que buscar por ninguno de esos campos sin
-- descifrar: con el perfil bloqueado no se ofrece autorrelleno.
--
-- El CVV no se guarda nunca: no hay columna ni campo para él.

CREATE TABLE vault_addresses (
  id              TEXT PRIMARY KEY,
  data_encrypted  BLOB NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_used_at    INTEGER
);

CREATE TABLE vault_cards (
  id              TEXT PRIMARY KEY,
  data_encrypted  BLOB NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_used_at    INTEGER
);
