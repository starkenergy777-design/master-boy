import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { apiRouter } from './server/routes.js';
import { db } from './server/db.js';
import { getAiClient, resetAiClient } from './server/gemini.js';

test('super admin chat: authorization, provider failures and isolation', async () => {
  // In-memory fixtures only: no db.init(), database writes, or real AI requests.
  const app = express();
  app.use(express.json());
  app.use('/api/v1', apiRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'CRAFTSMAN'] as const) {
    db.users.set(`test-${role}`, { id: `test-${role}`, phone: 'test', roles: [role], status: 'ACTIVE', createdAt: new Date().toISOString() });
    db.sessions.set(`test-${role}`, { userId: `test-${role}`, createdAt: Date.now() });
  }
  const send = (role?: string, message: unknown = 'როგორ მუშაობს Top 15?') => fetch(`${base}/admin/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'ka', ...(role ? { Authorization: `Bearer test-${role}` } : {}) },
    body: JSON.stringify({ message }),
  });
  try {
    assert.equal((await send()).status, 401);
    assert.equal((await send('ADMIN')).status, 403);
    assert.equal((await send('CRAFTSMAN')).status, 403);
    for (const invalid of ['', ' '.repeat(3), 'x'.repeat(4001), { text: 'wrong type' }]) {
      assert.equal((await send('SUPER_ADMIN', invalid)).status, 400);
    }
    delete process.env.GEMINI_API_KEY;
    db.geminiApiKey = '';
    resetAiClient();
    const missing = await send('SUPER_ADMIN');
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).code, 'AI_NOT_CONFIGURED');

    resetAiClient('test-key-not-a-real-credential');
    const client = getAiClient()!;
    let providerRequest: any;
    client.models.generateContent = async (request: any) => {
      providerRequest = request;
      return { text: 'ტოპ 15-ის ჯავშანი მოქმედებს 3 წუთით.' } as any;
    };
    const messagesBefore = db.supportMessages.length;
    db.configLock.locked = true;
    db.configLock.lockedUntil = new Date(Date.now() + 86400000).toISOString();
    const success = await send('SUPER_ADMIN');
    assert.equal(success.status, 200);
    assert.equal((await success.json()).reply, 'ტოპ 15-ის ჯავშანი მოქმედებს 3 წუთით.');
    assert.equal(providerRequest.contents, 'როგორ მუშაობს Top 15?');
    assert.match(providerRequest.config.systemInstruction, /Reply in ka/);
    assert.equal(providerRequest.config.responseMimeType, undefined);
    assert.equal(db.supportMessages.length, messagesBefore);
    assert.equal((await fetch(`${base}/support/messages`, { headers: { Authorization: 'Bearer test-SUPER_ADMIN' } })).status, 403);
    assert.equal((await fetch(`${base}/cities`)).status, 200);

    client.models.generateContent = async () => { throw new Error('sensitive provider detail'); };
    const failure = await send('SUPER_ADMIN');
    assert.equal(failure.status, 503);
    assert.deepEqual(await failure.json(), { code: 'AI_UNAVAILABLE', message: 'AI_UNAVAILABLE' });
    client.models.generateContent = async () => ({ text: ' ' }) as any;
    assert.equal((await send('SUPER_ADMIN')).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
