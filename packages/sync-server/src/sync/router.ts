import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDb, nextSeq } from '../db/database';
import { notifyPeers } from './websocket';

export const syncRouter = Router();
syncRouter.use(requireAuth);

// Tipos de entidad sincronizable conocidos (debe coincidir con los serializers
// del cliente). Cualquier otro entity_type se rechaza para no almacenar basura.
const ALLOWED_ENTITY_TYPES = new Set([
  'workspace',
  'treenode',
  'favorite',
  'user_script',
  'adblocker_exception',
  'setting',
]);

const MAX_ENTITIES_PER_REQUEST = 1000;
const MAX_ENTITY_ID_LEN = 256;
const MAX_DATA_CT_BYTES = 512 * 1024; // por entidad (cifrada)
const MAX_BLOB_B64_LEN = 1_500_000; // ydoc / vault (~1.1 MB binarios)
// Cota de entidades por perfil para evitar agotar el disco del servidor.
const MAX_ENTITIES_PER_PROFILE = 100_000;

// ── Salt de derivación de clave ──────────────────────────────────────────────

// POST /sync/key-salt  { salt } → { salt }
//
// Devuelve SIEMPRE el salt canónico del usuario. El cliente manda un salt
// recién generado; si el usuario ya tenía uno, se ignora y se devuelve el
// existente. Así el primer dispositivo lo fija y todos los demás derivan la
// misma clave a partir de la misma contraseña.
//
// Nunca se sobrescribe: hacerlo dejaría ilegible todo lo ya cifrado.
syncRouter.post('/key-salt', (req, res) => {
  const { salt } = req.body as { salt?: string };
  if (typeof salt !== 'string' || !/^[0-9a-f]{64}$/i.test(salt)) {
    return res.status(400).json({ error: 'salt inválido (se espera hex de 32 bytes)' });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO user_key_salts (user_id, salt, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO NOTHING
  `).run(req.userId, salt.toLowerCase(), Date.now());

  const row = db.prepare(
    'SELECT salt FROM user_key_salts WHERE user_id = ?'
  ).get(req.userId) as { salt: string } | undefined;

  res.json({ salt: row?.salt ?? salt.toLowerCase() });
});

// ── Perfiles ─────────────────────────────────────────────────────────────────

// POST /sync/profiles
syncRouter.post('/profiles', (req, res) => {
  const { id, name_ct } = req.body as {
    id?: string;
    name_ct?: string;
  };
  if (!id || !name_ct) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const db = getDb();
  const now = Date.now();

  db.prepare(`
    INSERT INTO sync_profiles
      (id, user_id, name_ct, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE
    SET name_ct = excluded.name_ct,
        updated_at = excluded.updated_at
  `).run(id, req.userId, name_ct, now, now);

  // Inicializar secuencia para este perfil.
  db.prepare(`
    INSERT INTO profile_sequences (profile_id, last_seq)
    VALUES (?, 0)
    ON CONFLICT DO NOTHING
  `).run(id);

  res.json({ ok: true });
});

// GET /sync/profiles
syncRouter.get('/profiles', (req, res) => {
  const db = getDb();
  const profiles = db.prepare(`
    SELECT id, name_ct, updated_at
    FROM sync_profiles
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(req.userId);
  res.json({ profiles });
});

/** Tope de entidades por respuesta de GET /sync/entities. */
const ENTITIES_PAGE_SIZE = 1000;

// ── Entidades ─────────────────────────────────────────────────────────────────

// GET /sync/entities?profile_id=X&since_seq=N
syncRouter.get('/entities', (req, res) => {
  const { profile_id, since_seq } = req.query;
  if (!profile_id || typeof profile_id !== 'string') {
    return res.status(400).json({ error: 'profile_id requerido' });
  }

  const db = getDb();
  const profile = db.prepare(`
    SELECT id FROM sync_profiles
    WHERE id = ? AND user_id = ?
  `).get(profile_id, req.userId);

  if (!profile) {
    return res.status(403).json({ error: 'Perfil no encontrado' });
  }

  const sinceSeq = parseInt(since_seq as string ?? '0') || 0;

  const entities = db.prepare(`
    SELECT id, entity_type, data_ct,
           updated_at, deleted, server_seq
    FROM sync_entities
    WHERE profile_id = ? AND server_seq > ?
    ORDER BY server_seq ASC
    LIMIT ?
  `).all(profile_id, sinceSeq, ENTITIES_PAGE_SIZE);

  const seqRow = db.prepare(`
    SELECT last_seq FROM profile_sequences
    WHERE profile_id = ?
  `).get(profile_id) as { last_seq: number } | undefined;

  // El cliente guarda `current_seq` como su nuevo punto de partida. Si el lote
  // ha llegado al LIMIT hay más entidades pendientes, así que solo puede
  // avanzar hasta la última entregada: devolverle el `last_seq` del perfil le
  // haría saltarse en silencio todo lo que no cupo.
  const truncated = entities.length >= ENTITIES_PAGE_SIZE;
  const lastDelivered = truncated
    ? (entities[entities.length - 1] as { server_seq: number }).server_seq
    : null;

  res.json({
    entities,
    current_seq: lastDelivered ?? seqRow?.last_seq ?? 0,
    has_more: truncated,
  });
});

// PUT /sync/entities
syncRouter.put('/entities', (req, res) => {
  const { profile_id, entities } = req.body as {
    profile_id?: string;
    entities?: Array<{
      id: string;
      entity_type: string;
      data_ct?: string | null;
      updated_at: number;
      deleted?: boolean;
    }>;
  };

  if (!profile_id || !Array.isArray(entities)) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  if (entities.length > MAX_ENTITIES_PER_REQUEST) {
    return res.status(413).json({ error: 'Demasiadas entidades en una petición' });
  }

  // Validación por entidad: tipo conocido, id acotado y blob acotado.
  for (const entity of entities) {
    if (
      !entity ||
      typeof entity.id !== 'string' ||
      entity.id.length === 0 ||
      entity.id.length > MAX_ENTITY_ID_LEN
    ) {
      return res.status(400).json({ error: 'Entidad con id inválido' });
    }
    if (!ALLOWED_ENTITY_TYPES.has(entity.entity_type)) {
      return res.status(400).json({ error: `entity_type no permitido: ${entity.entity_type}` });
    }
    if (
      entity.data_ct != null &&
      (typeof entity.data_ct !== 'string' || entity.data_ct.length > MAX_DATA_CT_BYTES)
    ) {
      return res.status(413).json({ error: 'Entidad demasiado grande' });
    }
  }

  const db = getDb();
  const profile = db.prepare(`
    SELECT id FROM sync_profiles
    WHERE id = ? AND user_id = ?
  `).get(profile_id, req.userId);

  if (!profile) {
    return res.status(403).json({ error: 'Perfil no encontrado' });
  }

  // Cuota de almacenamiento: limitar el nº total de entidades por perfil.
  const countRow = db.prepare(
    'SELECT COUNT(*) AS n FROM sync_entities WHERE profile_id = ?'
  ).get(profile_id) as { n: number };
  if (countRow.n + entities.length > MAX_ENTITIES_PER_PROFILE) {
    return res.status(507).json({ error: 'Cuota de almacenamiento superada' });
  }

  let maxSeq = 0;

  const upsert = db.prepare(`
    INSERT INTO sync_entities
      (id, profile_id, entity_type, data_ct,
       updated_at, deleted, server_seq)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, entity_type, id)
    DO UPDATE SET
      data_ct    = CASE
        WHEN excluded.updated_at > sync_entities.updated_at
        THEN excluded.data_ct
        ELSE sync_entities.data_ct END,
      updated_at = MAX(excluded.updated_at, sync_entities.updated_at),
      deleted    = CASE
        WHEN excluded.updated_at > sync_entities.updated_at
        THEN excluded.deleted
        ELSE sync_entities.deleted END,
      server_seq = excluded.server_seq
  `);

  const insertMany = db.transaction(() => {
    for (const entity of entities) {
      const seq = nextSeq(profile_id);
      if (seq > maxSeq) maxSeq = seq;
      upsert.run(
        entity.id, profile_id,
        entity.entity_type,
        entity.data_ct ?? null,
        entity.updated_at,
        entity.deleted ? 1 : 0,
        seq
      );
    }
  });

  insertMany();

  notifyPeers(req.userId, req.deviceToken, {
    profile_id,
    server_seq: maxSeq,
  });

  res.json({ ok: true, server_seq: maxSeq });
});

// ── Y.Docs (quick_notes) ──────────────────────────────────────────────────────

// GET /sync/ydocs/:workspace_id?profile_id=X
syncRouter.get('/ydocs/:workspace_id', (req, res) => {
  const { profile_id } = req.query;
  const { workspace_id } = req.params;
  if (!profile_id || typeof profile_id !== 'string') {
    return res.status(400).json({ error: 'profile_id requerido' });
  }

  const db = getDb();

  // Verificar que el perfil pertenece al usuario autenticado.
  const profile = db.prepare(`
    SELECT id FROM sync_profiles WHERE id = ? AND user_id = ?
  `).get(profile_id, req.userId);
  if (!profile) return res.status(403).json({ error: 'Perfil no encontrado' });

  const doc = db.prepare(`
    SELECT doc_ct, server_seq, updated_at
    FROM sync_ydocs
    WHERE profile_id = ? AND workspace_id = ?
  `).get(profile_id, workspace_id) as {
    doc_ct: Buffer;
    server_seq: number;
    updated_at: number;
  } | undefined;

  if (!doc) return res.status(404).json({ error: 'Doc no encontrado' });

  res.json(doc);
});

// PUT /sync/ydocs/:workspace_id
syncRouter.put('/ydocs/:workspace_id', (req, res) => {
  const { workspace_id } = req.params;
  const { profile_id, doc_ct, updated_at } = req.body as {
    profile_id?: string;
    doc_ct?: string;
    updated_at?: number;
  };

  if (!profile_id || !doc_ct) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
  if (typeof doc_ct !== 'string' || doc_ct.length > MAX_BLOB_B64_LEN) {
    return res.status(413).json({ error: 'Documento demasiado grande' });
  }

  const db = getDb();

  // Verificar que el perfil pertenece al usuario autenticado.
  const profile = db.prepare(`
    SELECT id FROM sync_profiles WHERE id = ? AND user_id = ?
  `).get(profile_id, req.userId);
  if (!profile) return res.status(403).json({ error: 'Perfil no encontrado' });

  const seq = nextSeq(profile_id);

  db.prepare(`
    INSERT INTO sync_ydocs
      (workspace_id, profile_id, doc_ct, updated_at, server_seq)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, workspace_id)
    DO UPDATE SET
      doc_ct     = excluded.doc_ct,
      updated_at = excluded.updated_at,
      server_seq = excluded.server_seq
  `).run(workspace_id, profile_id, doc_ct, updated_at ?? Date.now(), seq);

  notifyPeers(req.userId, req.deviceToken, { profile_id, server_seq: seq });

  res.json({ ok: true, server_seq: seq });
});

// ── Vault ─────────────────────────────────────────────────────────────────────

// GET /sync/vault?profile_id=X
syncRouter.get('/vault', (req, res) => {
  const { profile_id } = req.query;
  if (!profile_id || typeof profile_id !== 'string') {
    return res.status(400).json({ error: 'profile_id requerido' });
  }

  const db = getDb();

  // Verificar que el perfil pertenece al usuario autenticado.
  const profile = db.prepare(`
    SELECT id FROM sync_profiles WHERE id = ? AND user_id = ?
  `).get(profile_id, req.userId);
  if (!profile) return res.status(403).json({ error: 'Perfil no encontrado' });

  const vault = db.prepare(`
    SELECT vault_ct, server_seq, updated_at
    FROM sync_vaults WHERE profile_id = ?
  `).get(profile_id) as {
    vault_ct: Buffer;
    server_seq: number;
    updated_at: number;
  } | undefined;

  if (!vault) return res.status(404).json({ error: 'Vault no encontrado' });

  res.json(vault);
});

// PUT /sync/vault
syncRouter.put('/vault', (req, res) => {
  const { profile_id, vault_ct, updated_at } = req.body as {
    profile_id?: string;
    vault_ct?: string;
    updated_at?: number;
  };

  if (!profile_id || !vault_ct) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
  if (typeof vault_ct !== 'string' || vault_ct.length > MAX_BLOB_B64_LEN) {
    return res.status(413).json({ error: 'Vault demasiado grande' });
  }

  const db = getDb();

  // Verificar que el perfil pertenece al usuario autenticado.
  const profile = db.prepare(`
    SELECT id FROM sync_profiles WHERE id = ? AND user_id = ?
  `).get(profile_id, req.userId);
  if (!profile) return res.status(403).json({ error: 'Perfil no encontrado' });

  const seq = nextSeq(profile_id);

  db.prepare(`
    INSERT INTO sync_vaults
      (profile_id, vault_ct, updated_at, server_seq)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      vault_ct   = excluded.vault_ct,
      updated_at = excluded.updated_at,
      server_seq = excluded.server_seq
  `).run(profile_id, vault_ct, updated_at ?? Date.now(), seq);

  notifyPeers(req.userId, req.deviceToken, { profile_id, server_seq: seq });

  res.json({ ok: true, server_seq: seq });
});

// ── Dispositivos ──────────────────────────────────────────────────────────────

// GET /sync/devices
syncRouter.get('/devices', (req, res) => {
  const db = getDb();
  const devices = db.prepare(`
    SELECT
      substr(token, -8) as token_suffix,
      device_name, created_at, last_used_at
    FROM device_sessions
    WHERE user_id = ? AND expires_at > ?
    ORDER BY last_used_at DESC
  `).all(req.userId, Date.now());
  res.json({ devices });
});

// PUT /sync/device-name — actualiza el nombre del dispositivo actual.
syncRouter.put('/device-name', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Nombre inválido' });
  }
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  getDb().prepare(
    'UPDATE device_sessions SET device_name = ? WHERE token = ?'
  ).run(name.trim(), token);
  res.json({ ok: true });
});

// DELETE /sync/devices/:suffix
syncRouter.delete('/devices/:suffix', (req, res) => {
  const db = getDb();
  db.prepare(`
    DELETE FROM device_sessions
    WHERE user_id = ? AND substr(token, -8) = ?
  `).run(req.userId, req.params.suffix);
  res.json({ ok: true });
});

// DELETE /sync/session — logout del dispositivo actual.
syncRouter.delete('/session', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (token) {
    getDb().prepare(
      'DELETE FROM device_sessions WHERE token = ?'
    ).run(token);
  }
  res.json({ ok: true });
});
