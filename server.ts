import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/routes.js';
import { db } from './server/db.js';
import { storage } from './server/storage.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  await db.init();
  const app = express();
  // Support command line arguments (--port, --host) passed by dev runner
  const portArgIndex = process.argv.indexOf('--port');
  const portFromArg = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : NaN;
  const PORT = !isNaN(portFromArg) ? portFromArg : parseInt(process.env.PORT || '3000', 10);

  const hostArgIndex = process.argv.indexOf('--host');
  const hostFromArg = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : undefined;
  const HOST = hostFromArg || process.env.HOST || '0.0.0.0';

  // Body parsing middleware
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Security/CORS headers
  app.use((req, res, next) => {
    const rawConfiguredOrigin = process.env.APP_ORIGIN || process.env.APP_URL || '';
    let configuredOrigin = '';
    try {
      configuredOrigin = rawConfiguredOrigin ? new URL(rawConfiguredOrigin).origin : '';
    } catch {
      configuredOrigin = '';
    }
    const origin = req.headers.origin;
    if (configuredOrigin && origin === configuredOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (!configuredOrigin && process.env.NODE_ENV !== 'production') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept-Language, Idempotency-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Persist only mutating API requests. GET requests must never rewrite the entire
  // runtime snapshot: that creates unnecessary Firestore traffic and can overwrite
  // a newer snapshot after a read.
  const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (req.path.startsWith('/api/v1/') && mutatingMethods.has(req.method) && res.statusCode < 500) {
        void db.persistRuntimeState().catch((err) => console.error('[MASTER_BOY] Runtime persistence failed:', err));
      }
    });
    next();
  });

  // Mount API Router under /api/v1
  app.use('/api/v1', apiRouter);

  // Health check and cold-start wake-up endpoints
  app.get('/health', (req, res) => {
    const durableRequired = process.env.NODE_ENV === 'production' && process.env.REQUIRE_DURABLE_STORAGE !== 'false';
    const durableReady = storage.getStatus().firestoreConnected;
    if (durableRequired && !durableReady) {
      return res.status(503).json({ status: 'NOT_READY', service: 'MASTER_BOY API Server', version: 'v1.4.0', durableStorage: false, timestamp: new Date().toISOString() });
    }
    res.json({ status: 'UP', service: 'MASTER_BOY API Server', version: 'v1.4.0', durableStorage: durableReady, timestamp: new Date().toISOString() });
  });

  app.get('/ping', (req, res) => {
    res.status(200).send('pong');
  });

  // Check environment (dev vs prod)
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from dist in production
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { maxAge: '1h', index: false }));
    app.use('/api/v1', (req, res, next) => {
      res.status(404).json({ code: 'NOT_FOUND', message: 'API endpoint not found' });
    });
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`[MASTER_BOY] Server running on http://${HOST}:${PORT} in ${isProd ? 'production' : 'development'} mode`);
    console.log(`[MASTER_BOY] API v1 base: http://${HOST}:${PORT}/api/v1`);
  });

  server.on('error', (err: any) => {
    console.error('[MASTER_BOY] Server error:', err);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MASTER_BOY server:', err);
  process.exit(1);
});
