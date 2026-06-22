import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { setupWebSocket } from './sync/websocket';
import { syncRouter } from './sync/router';
import { authRouter } from './auth/magic-links';
import { pushRouter } from './push/router';
import { initDatabase } from './db/database';

const PORT = parseInt(process.env.PORT ?? '3001');
const DB_PATH = process.env.DB_PATH ?? '/data/sync.db';

async function main(): Promise<void> {
  initDatabase(DB_PATH);

  const app = express();

  // Necesario para que req.ip sea la IP real del cliente cuando
  // el servidor corre detrás de un proxy inverso (Traefik/nginx).
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));

  // CORS para el cliente Vela.
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? '';
    const allowed = (process.env.ALLOWED_ORIGINS ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);

    // vela:// se compara con startsWith (no tiene host después del scheme).
    // HTTP(S) URLs se comparan con igualdad exacta para evitar
    // que http://localhost.attacker.com pase el filtro.
    const isAllowed = allowed.some(a =>
      a.startsWith('vela://') ? origin.startsWith(a) : origin === a
    );

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,DELETE,OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization'
      );
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check (sin auth).
  app.get('/health', (_, res) => {
    res.json({
      status: 'ok',
      version: '0.1.0',
      uptime: process.uptime(),
    });
  });

  app.use('/auth', authRouter);
  app.use('/sync', syncRouter);
  app.use('/push', pushRouter);

  // 404 para rutas no encontradas.
  app.use((_, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Manejador de errores final: NUNCA devolver el stack al cliente (Express en
  // modo no-production lo filtraría). Se registra el detalle solo en el servidor.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] error no controlado:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal error' });
  });

  const server = createServer(app);
  setupWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Vela Sync Server v1.0.0 running on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
