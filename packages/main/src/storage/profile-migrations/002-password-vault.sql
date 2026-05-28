-- 002-password-vault: gestor de contraseñas nativo del perfil (Fase 3 Prompt 7).
--
-- Cada fila guarda credenciales cifradas a nivel aplicación con
-- XChaCha20-Poly1305 IETF. La clave de cifrado vive en memoria
-- (ProfileKeyring) y solo está disponible mientras el perfil esté
-- desbloqueado. Las columnas BLOB almacenan ciphertext en el formato
-- nonce(24 bytes) || ciphertext+auth_tag, sin metadata adicional.
--
-- domain/username NO se cifran: necesitamos buscarlos sin descifrar
-- (listForDomain). Si en el futuro se quiere ocultar también el
-- username, tocaría índices invertidos cifrados — fuera de alcance.
--
-- notes_encrypted es nullable porque la mayoría de entradas no
-- llevarán nota.

CREATE TABLE password_vault (
  id                  TEXT PRIMARY KEY,
  domain              TEXT NOT NULL,
  username            TEXT NOT NULL,
  encrypted_password  BLOB NOT NULL,
  notes_encrypted     BLOB,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX idx_password_vault_domain ON password_vault(domain);
