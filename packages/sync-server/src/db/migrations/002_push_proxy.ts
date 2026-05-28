export const migration002 = `

-- Tokens de push proxy: un token por (user, profile, origin).
-- El servidor recibe payloads cifrados en /push/:token y los reenvía al WS del user.
CREATE TABLE IF NOT EXISTS push_proxy_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id)
             ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  origin     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, profile_id, origin)
);

`;
