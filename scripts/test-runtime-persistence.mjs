import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import express from 'express';

// Execute the production middleware with mounted Express routes and isolated state.
const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
const middleware = source.slice(
  source.indexOf("  const mutatingMethods = "),
  source.indexOf('  // Mount API Router'),
);
assert.ok(middleware.includes("res.on('finish'"));
const app = express();
let writes = 0;
let queuedWrite = Promise.resolve();
let saved = false;
let accepted = false;
const db = {
  persistRuntimeState() {
    writes++;
    queuedWrite = queuedWrite.then(() => new Promise(resolve => {
      setTimeout(() => { saved = true; resolve(); }, 15);
    }));
    return queuedWrite;
  },
};
new Function('app', 'db', middleware)(app, db);
const router = express.Router();
router.post('/auth/craftsman/register', (_req, res) => {
  res.status(201).json({ registered: true });
});
router.post('/craftsmen/me/financial-terms/accept', async (_req, res) => {
  await queuedWrite;
  if (!saved) return res.status(404).json({ code: 'NOT_FOUND' });
  accepted = true;
  res.json({ accepted });
});
router.get('/craftsmen/me/financial-terms', (_req, res) => res.json({ accepted }));
router.post('/admin/providers/payment/prov-bog/verify', (_req, res) => res.json({ verified: true }));
router.post('/payments/bog/callback/live', (_req, res) => res.json({ received: true }));
router.post('/unavailable', (_req, res) => res.sendStatus(503));
app.use('/api/v1', router);
app.post('/outside-api', (_req, res) => res.sendStatus(200));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
async function request(path, method = 'POST') {
  const response = await fetch(origin + path, { method });
  await response.text();
  return response.status;
}
try {
  assert.equal(await request('/api/v1/auth/craftsman/register'), 201);
  assert.equal(await request('/api/v1/craftsmen/me/financial-terms/accept'), 200);
  await queuedWrite;
  assert.equal(saved, true);
  assert.equal(accepted, true);
  assert.equal(writes, 2);
  for (const [path, method] of [
    ['/api/v1/craftsmen/me/financial-terms', 'GET'],
    ['/api/v1/admin/providers/payment/prov-bog/verify', 'POST'],
    ['/api/v1/payments/bog/callback/live', 'POST'],
    ['/outside-api', 'POST'],
    ['/api/v1/unavailable', 'POST'],
  ]) {
    await request(path, method);
  }
  assert.equal(writes, 2);
  console.log('PASS: mounted registration persists before queued consent, and excluded requests do not save runtime state');
} finally {
  await queuedWrite;
  await new Promise(resolve => server.close(resolve));
}
