-- 017-favorites-v2: carpetas y jerarquía en profile_favorites.
--
-- type: 'bookmark' (por defecto, compatibilidad) | 'folder'.
--   Las carpetas tienen url NULL; los bookmarks mantienen su URL.
--
-- parent_id: FK a la propia tabla. NULL = raíz. ON DELETE SET NULL
--   para que al borrar una carpeta los hijos suban a raíz en vez de
--   eliminarse en cascada.

ALTER TABLE profile_favorites ADD COLUMN type TEXT NOT NULL DEFAULT 'bookmark';
ALTER TABLE profile_favorites ADD COLUMN parent_id TEXT;
