import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { once } from 'node:events';

// Actual HTTP routes and persistence middleware, with an isolated delayed SQL
// adapter. Never read credentials, contact a bank, or write to a live database.
process.env.NODE_ENV = 'test';
for (const key of Object.keys(process.env)) if (/DATABASE|SUPABASE|PGHOST|PGPASSWORD/.test(key)) delete process.env[key];
const [{ default: express }, { apiRouter }, { db, hashPassword }, { storage }, { durableApiResponses }] = await Promise.all([
  import('express'), import('../.audit-build/routes.js'), import('../.audit-build/db.js'),
  import('../.audit-build/storage.js'), import('../.audit-build/deployment-lifecycle.js'),
]);
const baseline = process.argv.includes('--baseline');
let queries = 0;
let snapshots = 0;
let failSql = false;
let heldCommit;
let reachedCommit;
let retired = false;
const query = async sql => {
  queries++;
  await new Promise(resolve => setTimeout(resolve, 1));
  if (failSql && sql.startsWith('DELETE FROM public.craftsmen')) throw new Error('isolated delete failure');
  if (sql === 'COMMIT' && heldCommit) { reachedCommit(); await heldCommit; }
  return { rows: [], rowCount: 1 };
};
storage.pool = { query, connect: async () => ({ query, release() {} }) };
const persist = db.persistRuntimeState.bind(db);
db.persistRuntimeState = async () => { snapshots++; await persist(); };
const app = express();
app.use(express.json());
app.use(durableApiResponses({
  assertWriter: async () => { if (retired) throw Object.assign(new Error('retired'), { code: '55000', message: 'DEPLOYMENT_WRITER_RETIRED' }); },
  persist: () => db.persistRuntimeState(), isDraining: () => false,
  onPersistenceFailure: error => { throw error; },
}));
app.use('/api/v1', apiRouter);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
const password = 'Isolated-test-password-123';
const passwordHash = hashPassword(password);
const originalBootstrap = db.bootstrap;
db.bootstrap = { ...db.bootstrap, enabled: false };
function account(role, suffix = role) {
  const user = { id: `latency-${suffix}`, phone: `+9955559${String(db.users.size).padStart(5, '0')}`, password: passwordHash, roles: [role], status: 'ACTIVE', createdAt: new Date().toISOString() };
  db.users.set(user.id, user);
  if (role === 'CRAFTSMAN') db.craftsmen.set(user.id, {
    id: user.id, userId: user.id, name: 'Isolated latency fixture', phone: user.phone,
    cityId: 'city-tbilisi', professionId: 'prof-plumber', status: 'ACTIVE', photos: [],
    phoneVisible: true, createdAt: user.createdAt, updatedAt: user.createdAt,
  });
  return user;
}
async function request(path, { method = 'POST', body, token } = {}) {
  const before = { queries, snapshots, time: performance.now() };
  const response = await fetch(origin + path, { method, headers: {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = { status: response.status, body: await response.json(), queries: queries - before.queries, snapshots: snapshots - before.snapshots, ms: Math.round(performance.now() - before.time) };
  return result;
}
const measurements = [];
try {
  const superadmin = account('SUPER_ADMIN');
  const craftsman = account('CRAFTSMAN');
  let adminToken;
  for (const user of [craftsman, superadmin]) {
    const login = await request('/auth/password/login', { body: { phone: user.phone, password } });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, user.id);
    assert.ok(db.sessions.has(login.body.sessionToken));
    if (!baseline) assert.equal(login.snapshots, 0, 'session-only login must not rewrite all business tables');
    measurements.push({ action: `${user.roles[0]} login`, queries: login.queries, snapshots: login.snapshots, ms: login.ms });
    const logout = await request('/auth/logout', { token: login.body.sessionToken });
    assert.equal(logout.status, 200);
    assert.equal(db.sessions.has(login.body.sessionToken), false);
    assert.equal((await request('/auth/me', { method: 'GET', token: login.body.sessionToken })).status, 401);
    if (!baseline) {
      assert.equal(logout.snapshots, 0, 'logout must revoke the session without rewriting all business tables');
      const repeated = await request('/auth/logout', { token: login.body.sessionToken });
      assert.equal(repeated.status, 401);
      assert.equal(repeated.snapshots, 0, 'an already revoked session must not cause a global write');
    }
    measurements.push({ action: `${user.roles[0]} logout`, queries: logout.queries, snapshots: logout.snapshots, ms: logout.ms });
  }
  const invalid = await request('/auth/password/login', { body: { phone: craftsman.phone, password: 'wrong' } });
  assert.equal(invalid.status, 401);
  if (!baseline) assert.equal(invalid.snapshots, 0);
  adminToken = 'latency-admin-session';
  db.sessions.set(adminToken, { userId: superadmin.id, createdAt: Date.now() });
  const deleted = await request(`/admin/craftsmen/${craftsman.id}`, { method: 'DELETE', token: adminToken });
  assert.equal(deleted.status, 200);
  assert.equal(db.craftsmen.has(craftsman.id), false);
  assert.equal(db.users.has(craftsman.id), false);
  measurements.push({ action: 'craftsman deletion', queries: deleted.queries, snapshots: deleted.snapshots, ms: deleted.ms });
  if (!baseline) {
    assert.equal(deleted.snapshots, 0, 'targeted deletion must not run a global snapshot');
    assert.ok(deleted.queries < 20, 'deletion SQL work must be bounded independently of unrelated accounts and prices');
    const pendingUser = account('CRAFTSMAN', 'pending-payment');
    db.paymentIntents.set('pending-order', { id: 'pending-order', craftsmanId: pendingUser.id, status: 'PENDING', providerCheckout: {} });
    const blocked = await request(`/admin/craftsmen/${pendingUser.id}`, { method: 'DELETE', token: adminToken });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.snapshots, 0);
    assert.equal(db.users.has(pendingUser.id), true);
    db.paymentIntents.delete('pending-order');
    const failing = account('CRAFTSMAN', 'failed-delete');
    db.sessions.set('latency-failing-session', { userId: failing.id, createdAt: Date.now() });
    failSql = true;
    const failed = await request(`/admin/craftsmen/${failing.id}`, { method: 'DELETE', token: adminToken });
    failSql = false;
    assert.equal(failed.status, 503);
    assert.equal(failed.body.code, 'ADMIN_MUTATION_NOT_PERSISTED');
    assert.equal(db.craftsmen.has(failing.id), true);
    assert.equal(db.users.has(failing.id), true);
    assert.equal(db.sessions.has('latency-failing-session'), true);
    assert.equal(db.auditLog.some(entry => entry.action === 'DELETE_CRAFTSMAN' && entry.targetId === failing.id), false);
    let releaseCommit;
    heldCommit = new Promise(resolve => { releaseCommit = resolve; });
    const committing = new Promise(resolve => { reachedCommit = resolve; });
    let replied = false;
    const pending = request(`/admin/craftsmen/${failing.id}`, { method: 'DELETE', token: adminToken }).then(result => { replied = true; return result; });
    await committing;
    assert.equal(replied, false, 'success must wait for the durable delete commit');
    assert.equal(db.users.has(failing.id), true, 'uncommitted deletion must not be published in memory');
    releaseCommit();
    assert.equal((await pending).status, 200);
    heldCommit = undefined;
    assert.equal(db.users.has(failing.id), false);
    assert.equal(db.sessions.has('latency-failing-session'), false);
    retired = true;
    const fenced = await request('/auth/password/login', { body: { phone: superadmin.phone, password } });
    assert.equal(fenced.status, 503);
    assert.equal(fenced.body.code, 'DEPLOYMENT_IN_PROGRESS');
    retired = false;
    // Bootstrap creates persistent account/audit data and still needs a snapshot.
    db.bootstrap = { ...originalBootstrap, enabled: true, phone: superadmin.phone, password };
    const bootstrap = await request('/auth/password/login', { body: { phone: superadmin.phone, password } });
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.snapshots, 1);
  }
  console.log(JSON.stringify({ mode: baseline ? 'before' : 'after', seededPrices: db.top15Prices.size, measurements }, null, 2));
  console.log('PASS: login/logout sessions, bounded durable deletion, failure preservation, commit ordering and deployment admission');
} finally {
  await new Promise(resolve => server.close(resolve));
}
