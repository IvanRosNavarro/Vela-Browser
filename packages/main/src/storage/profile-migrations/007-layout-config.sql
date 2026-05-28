ALTER TABLE workspaces
  ADD COLUMN layout_config TEXT;
-- JSON serializado de WindowLayout. NULL = single panel.
