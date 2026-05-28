-- Columna para recordar la URL con la que se fijó una Carga (pinned tab).
-- Permite "Restaurar Carga" (navegar a la URL original) y mostrar indicador visual
-- cuando el tab ha navegado a otra URL distinta de la que fue anclado.
ALTER TABLE tree_nodes ADD COLUMN pinned_url TEXT;

-- Columna ancla en profile_favorites: la URL con la que se creó el Ancla.
-- La columna url existente pasa a ser la URL de navegación actual (efímera en WCV,
-- persistida aquí para restaurar en siguientes sesiones).
-- anchor_url es la URL "canónica" del Ancla; url la URL de última sesión.
ALTER TABLE profile_favorites ADD COLUMN anchor_url TEXT;
UPDATE profile_favorites SET anchor_url = url WHERE anchor_url IS NULL;
