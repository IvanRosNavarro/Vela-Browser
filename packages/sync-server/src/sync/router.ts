import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDb, nextSeq } from '../db/database';
import { notifyPeers } from './websocket';

export const syncRouter = Router();
syncRouter.use(requireAuth);

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
    LIMIT 1000
  `).all(profile_id, sinceSeq);

  const seqRow = db.prepare(`
    SELECT last_seq FROM profile_sequences
    WHERE profile_id = ?
  `).get(profile_id) as { last_seq: number } | undefined;

  res.json({
    entities,
    current_seq: seqRow?.last_seq ?? 0,
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

  const db = getDb();
  const profile = db.prepare(`
    SELECT id FROM sync_profiles
    WHERE id = ? AND user_id = ?
  `).get(profile_id, req.userId);

  if (!profile) {
    return res.status(403).json({ error: 'Perfil no encontrado' });
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

  notifyPeers(req.userId, req.ws ?? null, {
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

  notifyPeers(req.userId, null, { profile_id, server_seq: seq });

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

  notifyPeers(req.userId, null, { profile_id, server_seq: seq });

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
