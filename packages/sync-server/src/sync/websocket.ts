import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { getDb } from '../db/database';

// userId → Set de conexiones activas.
const connections = new Map<string, Set<WebSocket>>();

// Token de sesión con el que se autenticó cada conexión. Permite no reenviarle
// a un dispositivo el aviso de un cambio que acaba de escribir él mismo.
const connectionTokens = new WeakMap<WebSocket, string>();

export function setupWebSocket(server: Server): void {
  // maxPayload acotado: el único mensaje entrante esperado es {token}. Sin esto
  // el default son 100 MB, lo que permitiría a un cliente enviar un frame enorme.
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

  wss.on('connection', (ws) => {
    let userId: string | null = null;

    // Si el cliente no se autentica en 10 s, cerramos: evita acumular
    // conexiones sin autenticar (DoS de recursos).
    const authTimeout = setTimeout(() => {
      if (!userId && ws.readyState === WebSocket.OPEN) {
        ws.close(4008, 'Auth timeout');
      }
    }, 10_000);
    if (typeof authTimeout.unref === 'function') authTimeout.unref();

    // El cliente envía su token al conectar.
    ws.once('message', (data) => {
      try {
        const { token } = JSON.parse(data.toString()) as { token: string };
        const db = getDb();
        const session = db.prepare(`
          SELECT user_id FROM device_sessions
          WHERE token = ? AND expires_at > ?
        `).get(token, Date.now()) as { user_id: string } | undefined;

        if (!session) {
          ws.close(4001, 'Unauthorized');
          return;
        }

        userId = session.user_id;
        clearTimeout(authTimeout);

        if (!connections.has(userId)) {
          connections.set(userId, new Set());
        }
        connections.get(userId)!.add(ws);
        connectionTokens.set(ws, token);

        ws.send(JSON.stringify({ type: 'connected' }));
      } catch {
        ws.close(4002, 'Bad request');
      }
    });

    const cleanup = (): void => {
      if (userId) {
        connections.get(userId)?.delete(ws);
        if (connections.get(userId)?.size === 0) {
          connections.delete(userId);
        }
      }
      clearInterval(pingInterval);
      clearTimeout(authTimeout);
    };

    ws.on('close', cleanup);

    // Ping cada 30s para mantener viva la conexión.
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30_000);
  });
}

export function broadcastPush(
  userId: string,
  profileId: string,
  origin: string,
  payloadB64: string,
): void {
  const userConns = connections.get(userId);
  if (!userConns) return;

  const msg = JSON.stringify({
    type: 'push:notification',
    profile_id: profileId,
    origin,
    payload_b64: payloadB64,
  });

  for (const ws of userConns) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

/**
 * Avisa a los dispositivos del usuario de que hay cambios que bajar.
 *
 * `excludeToken` es el token del dispositivo que ha escrito: se le excluye
 * porque ya tiene el cambio. Notificárselo hacía que cada push disparase su
 * propio pull, y con varios perfiles de la misma cuenta abiertos a la vez el
 * ciclo no paraba nunca.
 */
export function notifyPeers(
  userId: string,
  excludeToken: string | null,
  payload: { profile_id: string; server_seq: number }
): void {
  const userConns = connections.get(userId);
  if (!userConns) return;

  const msg = JSON.stringify({
    type: 'sync:changes',
    profile_id: payload.profile_id,
    server_seq: payload.server_seq,
  });

  for (const ws of userConns) {
    if (excludeToken !== null && connectionTokens.get(ws) === excludeToken) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}
