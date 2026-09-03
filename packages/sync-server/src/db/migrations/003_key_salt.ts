export const migration003 = `

-- Salt de derivación de la clave de sync, compartido por todos los
-- dispositivos del usuario.
--
-- Hasta v1.0 cada dispositivo generaba su propio salt aleatorio en local, de
-- modo que la MISMA contraseña de sync producía claves AES distintas en cada
-- máquina y el descifrado siempre fallaba. El salt no es secreto (su función
-- es encarecer las tablas precomputadas), así que puede vivir en el servidor
-- sin comprometer el E2EE: lo que nunca sale del dispositivo es la contraseña.
--
-- Es de escritura única: una vez fijado, cambiarlo dejaría ilegibles todos los
-- datos ya cifrados con la clave derivada de él.
CREATE TABLE IF NOT EXISTS user_key_salts (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  salt       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

`;
