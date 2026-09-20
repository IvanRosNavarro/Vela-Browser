-- 007-profile-sync-link: qué perfil de la cuenta sincroniza cada perfil local.
--
-- El vínculo real vive en `settings_profile` de cada profile.db
-- (`sync:remote-profile-id`), pero esa tabla solo se puede leer con el perfil
-- ABIERTO — y con contraseña maestra, ni eso. Para poder enseñar la cuenta
-- completa ("estos perfiles tienes en el servidor, estos están en este
-- equipo") hace falta el mapeo a mano en vela.db. Es una copia de solo
-- lectura para la interfaz: la fuente de verdad sigue siendo el perfil.
--
-- sync_paused pausa la sincronización de un perfil sin desvincularlo: se
-- consulta al abrirlo, así que también vale para perfiles cerrados.

ALTER TABLE profiles ADD COLUMN remote_profile_id TEXT;
ALTER TABLE profiles ADD COLUMN sync_paused INTEGER NOT NULL DEFAULT 0;
