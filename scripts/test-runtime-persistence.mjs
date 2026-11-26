import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { durableApiResponses, installGracefulShutdown } from '../.audit-build/deployment-lifecycle.js';
import { DeploymentHandoffError } from '../.audit-build/deployment-safety.js';

// Execute the production middleware with mounted Express routes and isolated state.
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
let draining = false;
let retired = false;
let failPersistence = false;
app.use(durableApiResponses({
  assertWriter: async () => { if (retired) throw new DeploymentHandoffError(); },
  persist: async () => { if (failPersistence) throw new Error('isolated database failure'); await db.persistRuntimeState(); },
  isDraining: () => draining,
  onPersistenceFailure() { draining = true; },
}));
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
  assert.equal(saved, true, 'successful registration response must follow durable commit');
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
  failPersistence = true;
  const failed = await fetch(origin + '/api/v1/auth/craftsman/register', { method: 'POST' });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).code, 'PERSISTENCE_UNAVAILABLE');
  console.log('PASS: failed persistence returns a real failure instead of an acknowledged registration');
  failPersistence = false;
  draining = false;
  retired = true;
  const fenced = await fetch(origin + '/api/v1/auth/craftsman/register', { method: 'POST' });
  assert.equal(fenced.status, 503);
  assert.equal((await fenced.json()).code, 'DEPLOYMENT_IN_PROGRESS');
  assert.equal(writes, 2);
  retired = false;
  draining = true;
  assert.equal(await request('/api/v1/auth/craftsman/register'), 503);
  assert.equal(writes, 2);
  console.log('PASS: retired and draining servers reject new mutations before handlers run');
  const events = [];
  let finishServer;
  const drain = installGracefulShutdown({
    stopAdmission: () => events.push('stop-admission'),
    stopWorkers: () => events.push('stop-workers'),
    closeServer: () => new Promise(resolve => { events.push('wait-http'); finishServer = resolve; }),
    closeStorage: async () => { events.push('flush-and-close-storage'); },
  });
  const first = drain();
  assert.equal(drain(), first);
  assert.deepEqual(events, ['stop-admission', 'stop-workers', 'wait-http']);
  finishServer();
  await first;
  assert.deepEqual(events, ['stop-admission', 'stop-workers', 'wait-http', 'flush-and-close-storage']);
  console.log('PASS: shutdown waits for in-flight HTTP/persistence before closing database connections, once only');
} finally {
  await queuedWrite;
  await new Promise(resolve => server.close(resolve));
}
