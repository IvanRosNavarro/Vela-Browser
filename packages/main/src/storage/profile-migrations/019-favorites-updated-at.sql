-- 019: no-op. FavoritesRepository detects updated_at at runtime via
-- pragma_table_info and adapts all INSERT/UPDATE/SELECT statements accordingly.
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS is not supported in this SQLite version.
SELECT 1;
