-- 012-password-vault-fields: extiende password_vault con carpeta, URL de login
-- y timestamp de último uso (Fase 5 Prompt 5.0.3 — gestor de contraseñas nativo).

ALTER TABLE password_vault ADD COLUMN folder TEXT NOT NULL DEFAULT 'General';
ALTER TABLE password_vault ADD COLUMN login_url TEXT;
ALTER TABLE password_vault ADD COLUMN last_used_at INTEGER;
