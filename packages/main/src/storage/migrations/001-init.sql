-- 001-init: bootstrap mínimo de Vela.
-- Por ahora solo creamos la tabla de metadatos. La usamos para guardar la
-- versión de Vela con la que se escribió el fichero (entre otras cosas que
-- vendrán). Las migraciones de tabs, workspaces, history, etc. llegan en
-- fases posteriores.
CREATE TABLE app_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
