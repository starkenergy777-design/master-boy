import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { apiRouter } from './server/routes.js';
import { db } from './server/db.js';
import { storage } from './server/storage.js';
import { seoRouter } from './server/seo.js';
import { reconcilePendingBogOrders } from './server/bog-checkout-flow.js';
import { durableApiResponses, installGracefulShutdown } from './server/deployment-lifecycle.js';
import { isDeploymentHandoff } from './server/deployment-safety.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  // Support command line arguments (--port, --host) passed by dev runner
  const portArgIndex = process.argv.indexOf('--port');
  const portFromArg = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : NaN;
  const PORT = !isNaN(portFromArg) ? portFromArg : parseInt(process.env.PORT || '3000', 10);

  const hostArgIndex = process.argv.indexOf('--host');
  const hostFromArg = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : undefined;
  const HOST = hostFromArg || process.env.HOST || '0.0.0.0';
  let starting = true;
  app.use((_req, res, next) => {
    if (starting) return res.status(503).set('Retry-After', '3').json({ code: 'DEPLOYMENT_IN_PROGRESS' });
    next();
  });

  // Body parsing middleware
  app.disable('x-powered-by');
  app.use('/api/v1/payments/bog/callback', express.raw({ type: 'application/json', limit: '128kb', inflate: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

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
    const productionCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    const developmentCsp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    res.setHeader('Content-Security-Policy', process.env.NODE_ENV === 'production' ? productionCsp : developmentCsp);
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept-Language, Idempotency-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  let draining = false;
  let persistenceFailed = false;
  app.use(durableApiResponses({
    assertWriter: () => storage.assertDeploymentWriter(),
    persist: () => db.persistRuntimeState(),
    isDraining: () => draining || persistenceFailed,
    onPersistenceFailure: (error) => {
      // A retired instance stays read-only until Render removes it. Do not
      // provoke a restart that would compete with the replacement writer.
      if (isDeploymentHandoff(error)) draining = true;
      else persistenceFailed = true;
      console.error('[MASTER_BOY] Required runtime persistence failed:', error);
    },
  }));

  // Mount API Router under /api/v1
  app.use('/api/v1', apiRouter);

  // Health check and cold-start wake-up endpoints
  app.get('/health', async (req, res) => {
    const durableRequired = process.env.NODE_ENV === 'production' && process.env.REQUIRE_DURABLE_STORAGE !== 'false';
    const durableReady = await storage.checkDatabaseHealth();
    if (durableRequired && (!durableReady || persistenceFailed)) {
      return res.status(503).json({ status: 'NOT_READY', service: 'MASTER_BOY API Server', version: 'v1.4.0', durableStorage: false, timestamp: new Date().toISOString() });
    }
    res.json({ status: 'UP', service: 'MASTER_BOY API Server', version: 'v1.4.0', durableStorage: durableReady, timestamp: new Date().toISOString() });
  });

  app.get('/ping', (req, res) => {
    res.status(200).send('pong');
  });

  // Never answer probes for deployment metadata or repository internals with
  // the SPA shell; those paths must remain unavailable in every environment.
  app.use((req, res, next) => {
    let requestPath = req.path;
    try {
      requestPath = decodeURIComponent(requestPath);
    } catch {
      return res.sendStatus(400);
    }
    if (/(?:^|\/)\.(?:git(?:\/|$)|env(?:[./]|$))/i.test(requestPath)) {
      return res.sendStatus(404);
    }
    next();
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
    app.use(seoRouter(path.resolve(distPath, 'index.html')));
    app.use(express.static(distPath, { maxAge: '1h', index: false }));
    app.use('/api/v1', (req, res, next) => {
      res.status(404).json({ code: 'NOT_FOUND', message: 'API endpoint not found' });
    });
    app.get('*', (req, res) => {
      res.status(404).set('X-Robots-Tag', 'noindex').type('html').send('<!doctype html><html lang="ka"><meta charset="utf-8"><title>გვერდი ვერ მოიძებნა</title><h1>გვერდი ვერ მოიძებნა</h1><a href="/">მასტერ ბოი</a></html>');
    });
  }

  let server!: Server;
  await db.init(async () => {
    server = app.listen(PORT, HOST);
    await once(server, 'listening');
  });
  starting = false;
  console.log(`[MASTER_BOY] Server running on http://${HOST}:${PORT} in ${isProd ? 'production' : 'development'} mode`);
  console.log(`[MASTER_BOY] API v1 base: http://${HOST}:${PORT}/api/v1`);
  // Covers lost redirects and missed notifications without requiring a separate worker service.
  let reconciliation: Promise<void> | undefined;
  const pendingPayments = setInterval(() => {
    if (draining || persistenceFailed || reconciliation) return;
    reconciliation = storage.assertDeploymentWriter().then(() => reconcilePendingBogOrders()).catch(error => {
      if (!isDeploymentHandoff(error)) console.error('[MASTER_BOY] Payment reconciliation unavailable:', error);
    }).finally(() => { reconciliation = undefined; });
  }, 60_000);
  pendingPayments.unref();
  server.on('close', () => clearInterval(pendingPayments));

  const shutdown = installGracefulShutdown({
    stopAdmission: () => { draining = true; storage.stopWriteAdmission(); },
    stopWorkers: () => clearInterval(pendingPayments),
    closeServer: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections();
    }),
    closeStorage: async () => { await reconciliation; await storage.close(); },
  });
  const terminate = () => {
    // Render's default forced shutdown is 30 seconds. Completed responses are
    // already durable; interrupted transactions roll back and BOG reconciles.
    const deadline = setTimeout(() => process.exit(1), 25_000);
    deadline.unref();
    void shutdown().then(() => { clearTimeout(deadline); process.exit(0); }).catch(error => {
      console.error('[MASTER_BOY] Shutdown failed:', error);
      process.exit(1);
    });
  };
  process.once('SIGTERM', terminate);
  process.once('SIGINT', terminate);

  server.on('error', (err: any) => {
    console.error('[MASTER_BOY] Server error:', err);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MASTER_BOY server:', err);
  process.exit(1);
});

