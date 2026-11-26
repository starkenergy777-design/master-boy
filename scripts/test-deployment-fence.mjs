import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { DeploymentWriter, DeploymentHandoffError, isDeploymentHandoff } from '../.audit-build/deployment-safety.js';

// Embedded PostgreSQL only. Never use a connection string from the environment.
for (const key of Object.keys(process.env)) if (/DATABASE|SUPABASE|PGHOST|PGPASSWORD|BOG_|TBC_/.test(key)) delete process.env[key];
const require = createRequire(process.env.DEPLOYMENT_TEST_TOOLS || new URL('../package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const postgres = await PGlite.create();
const tables = ['users','craftsmen','craftsman_photos','craftsman_drafts','top15_prices','craftsman_listings','top15_reservations','top15_memberships','payment_intents','advertisements','support_messages','ai_reports','audit_logs','listing_purge_logs','financial_cases','system_config','server_secrets'];
const results = [];
const pass = name => { results.push(name); console.log('PASS: ' + name); };

// PGlite has one backend. Serialize logical client sessions so SET LOCAL and
// transactions cannot interleave in the harness. Production row-lock semantics
// are expressed by the migration's FOR SHARE / FOR UPDATE, not simulated here.
let lastClient = Promise.resolve();
async function connect() {
  const previous = lastClient;
  let release;
  lastClient = new Promise(resolve => { release = resolve; });
  await previous;
  return {
    query: async (sql, values) => { const r = await postgres.query(sql, values); return { ...r, rowCount: r.affectedRows ?? r.rows?.length ?? 0 }; },
    release,
  };
}
const pool = { connect, query: async (sql, values) => { const c = await connect(); try { return await c.query(sql, values); } finally { c.release(); } } };
async function legacy(sql, role = 'masterboy_app') {
  const c = await pool.connect();
  try { await c.query('BEGIN'); await c.query(`SET LOCAL ROLE ${role}`); await c.query(sql); await c.query('COMMIT'); }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}
const beforeListing = '2027-05-24T14:07:27.932Z';
const beforeTop15 = '2026-12-25T15:03:47.287Z';

try {
  await postgres.exec('CREATE ROLE masterboy_app; CREATE ROLE masterboy_runtime; GRANT masterboy_app TO masterboy_runtime; CREATE ROLE anon; CREATE ROLE authenticated;');
  for (const name of tables) await postgres.exec(`CREATE TABLE public.${name}(id text PRIMARY KEY, expires_at timestamptz, starts_at timestamptz, status text); GRANT SELECT,INSERT,UPDATE,DELETE ON public.${name} TO masterboy_app;`);
  await postgres.query('INSERT INTO public.craftsman_listings(id,expires_at) VALUES($1,$2)', ['listing-existing', beforeListing]);
  await postgres.query('INSERT INTO public.top15_memberships(id,expires_at) VALUES($1,$2)', ['top15-existing', beforeTop15]);
  const original = await postgres.query('SELECT id,expires_at FROM public.top15_memberships');
  const missingSchemaWriter = new DeploymentWriter();
  await assert.rejects(missingSchemaWriter.claim(pool), error => error.code === '42P01');
  assert.deepEqual((await postgres.query('SELECT id,expires_at FROM public.top15_memberships')).rows, original.rows);
  pass('missing deployment migration fails startup without changing existing positions');

  await postgres.exec(await readFile(new URL('../migrations/019_deployment_writer_fence.sql', import.meta.url), 'utf8'));
  const expiries = await postgres.query('SELECT expires_at FROM public.craftsman_listings UNION ALL SELECT expires_at FROM public.top15_memberships');
  assert.deepEqual(expiries.rows.map(r => r.expires_at.toISOString()), [beforeListing, beforeTop15]);
  pass('deployment migration preserves existing 180-day and 30-day expiry timestamps exactly');
  await legacy("UPDATE public.top15_memberships SET status='ACTIVE'");
  pass('installing the migration alone does not stop the existing commercial release');

  const failedFirstActivation = new DeploymentWriter();
  await assert.rejects(failedFirstActivation.initialize(pool, async () => { throw new Error('first activation failed'); }), /first activation failed/);
  assert.equal((await postgres.query('SELECT enforced FROM masterboy_deploy.writer_control')).rows[0].enforced, false);
  await legacy("UPDATE public.top15_memberships SET status='ACTIVE'");
  pass('failed first activation leaves legacy access unchanged instead of disabling the commercial site');

  const first = new DeploymentWriter();
  await first.claim(pool);
  await assert.rejects(legacy('DELETE FROM public.top15_memberships'), error => error.code === '55000');
  pass('after activation the unfenced legacy writer is rejected at the database boundary');
  await assert.rejects(legacy('DELETE FROM public.top15_memberships', 'masterboy_runtime'), error => error.code === '55000');
  pass('the actual Supavisor login role cannot bypass the fence if an old session loses SET ROLE');
  const oldDb = first.wrap(pool);
  await first.assertActive(pool);
  const failedBoot = new DeploymentWriter();
  await assert.rejects(failedBoot.initialize(pool, async () => {
    const startupDb = failedBoot.wrap(pool);
    await startupDb.query("UPDATE public.craftsman_listings SET expires_at='2030-01-01' WHERE id='listing-existing'");
    const nested = await startupDb.connect();
    try {
      await nested.query('BEGIN');
      await nested.query("UPDATE public.top15_memberships SET expires_at='2030-02-01' WHERE id='top15-existing'");
      await nested.query('COMMIT');
    } finally { nested.release(); }
    throw new Error('isolated hydration failure');
  }), /isolated hydration failure/);
  await first.assertActive(pool);
  assert.equal((await postgres.query("SELECT expires_at FROM public.craftsman_listings WHERE id='listing-existing'")).rows[0].expires_at.toISOString(), beforeListing);
  assert.equal((await postgres.query("SELECT expires_at FROM public.top15_memberships WHERE id='top15-existing'")).rows[0].expires_at.toISOString(), beforeTop15);
  pass('failed hydration rolls back ownership and nested startup writes, preserving both original timers');
  await assert.rejects(failedBoot.initialize(pool, async () => {}, async () => {
    assert.equal(failedBoot.startup.getStore(), undefined);
    throw new Error('isolated listen failure');
  }), /isolated listen failure/);
  await first.assertActive(pool);
  pass('failed HTTP binding also restores the original writer; HTTP never inherits the startup connection');
  await oldDb.query('INSERT INTO public.payment_intents(id,status) VALUES($1,$2)', ['paid-before-deploy','SUCCEEDED']);
  const replacement = new DeploymentWriter();
  await replacement.claim(pool);
  const activeDb = replacement.wrap(pool);
  await replacement.assertActive(pool);
  await assert.rejects(first.assertActive(pool), DeploymentHandoffError);
  pass('replacement becomes the sole writer and the former process cannot admit mutations');

  await activeDb.query('INSERT INTO public.top15_memberships(id,expires_at,status) VALUES($1,$2,$3)', ['new-paid-top15', '2026-12-26T10:00:00Z', 'ACTIVE']);
  await assert.rejects(oldDb.query('DELETE FROM public.top15_memberships WHERE NOT (id=ANY($1::text[]))', [['top15-existing']]), isDeploymentHandoff);
  assert.equal((await postgres.query("SELECT count(*)::int AS n FROM public.top15_memberships WHERE id='new-paid-top15'")).rows[0].n, 1);
  pass('retired full snapshot cannot delete a newly paid Top15 position');

  const extended = '2027-11-20T14:07:27.932Z';
  await activeDb.query('UPDATE public.craftsman_listings SET expires_at=$1 WHERE id=$2', [extended, 'listing-existing']);
  await assert.rejects(oldDb.query('UPDATE public.craftsman_listings SET expires_at=$1 WHERE id=$2', [beforeListing, 'listing-existing']), isDeploymentHandoff);
  assert.equal((await postgres.query("SELECT expires_at FROM public.craftsman_listings WHERE id='listing-existing'")).rows[0].expires_at.toISOString(), extended);
  pass('retired snapshot cannot shorten a paid listing renewal');

  // A transaction-pool reconnect has no trusted session context. The fixed
  // old token is still rejected; a new connection cannot become a new owner.
  await assert.rejects(first.wrap(pool).query('DELETE FROM public.payment_intents'), isDeploymentHandoff);
  assert.equal((await postgres.query('SELECT count(*)::int AS n FROM public.payment_intents')).rows[0].n, 1);
  pass('reconnecting retired process cannot erase confirmed payment history');

  const client = await activeDb.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE public.top15_memberships SET status=$1 WHERE id=$2', ['ACTIVE', 'new-paid-top15']);
    await client.query('COMMIT');
  } finally { client.release(); }
  assert.equal((await postgres.query("SELECT coalesce(current_setting('masterboy.writer_token',true),'') AS token")).rows[0].token, '');
  pass('explicit and single-statement transactions set local writer context without leaking it');

  // Exercise the real production StorageService, not just hand-written SQL.
  // These extra fixture columns match the targeted payment method's existing
  // schema. The only migration under test remains the unmodified SQL 019.
  await postgres.exec(`
    CREATE TYPE payment_status AS ENUM ('PENDING','SUCCEEDED','FAILED','REFUNDED');
    ALTER TABLE public.payment_intents ADD COLUMN reservation_id text, ADD COLUMN craftsman_id text,
      ADD COLUMN provider text, ADD COLUMN amount_minor integer, ADD COLUMN currency text,
      ADD COLUMN idempotency_key text, ADD COLUMN provider_transaction_id text,
      ADD COLUMN created_at timestamptz, ADD COLUMN updated_at timestamptz,
      ADD COLUMN financial_terms_version text, ADD COLUMN financial_terms_accepted_at timestamptz,
      ADD COLUMN product_type text, ADD COLUMN service_starts_at timestamptz,
      ADD COLUMN service_ends_at timestamptz, ADD COLUMN provider_checkout jsonb;
    ALTER TABLE public.top15_memberships ADD COLUMN craftsman_id text, ADD COLUMN city_id text,
      ADD COLUMN profession_id text, ADD COLUMN payment_id text, ADD COLUMN created_at timestamptz;
  `);
  process.env.NODE_ENV = 'test';
  const { StorageService } = await import('../.audit-build/storage.js');
  const priorStorage = new StorageService(), nextStorage = new StorageService();
  priorStorage.pool = pool;
  nextStorage.pool = pool;
  process.env.NODE_ENV = 'production';
  try {
    await priorStorage.claimDeploymentWriter();
    const membership = { id: 'real-storage-member', craftsmanId: 'fixture-craftsman', cityId: 'fixture-city', professionId: 'fixture-profession', startsAt: '2026-11-26T10:00:00Z', expiresAt: '2026-12-26T10:00:00Z', status: 'ACTIVE' };
    const intent = { id: 'real-storage-payment', craftsmanId: membership.craftsmanId, providerId: 'prov-bog', amountMinor: 100, currency: 'GEL', idempotencyKey: 'offline-unique', status: 'SUCCEEDED', bankPaymentId: 'offline-bank-order', createdAt: membership.startsAt, productType: 'TOP15', serviceStartsAt: membership.startsAt, serviceEndsAt: membership.expiresAt, providerCheckout: { kind: 'TOP15' } };
    await priorStorage.saveBogPayment(intent, { membership }, () => {});
    await nextStorage.claimDeploymentWriter();
    const staleState = Object.fromEntries(['users','craftsmen','craftsmanDrafts','top15Prices','top15Reservations','top15Memberships','paymentIntents','craftsmanListings','advertisements'].map(n => [n,new Map()]));
    Object.assign(staleState, { supportMessages: [], aiReports: [], auditLog: [], listingPurgeLog: [] });
    await assert.rejects(priorStorage.saveRuntimeState(staleState), isDeploymentHandoff);
    const actual = await postgres.query('SELECT m.expires_at,p.status FROM public.top15_memberships m JOIN public.payment_intents p ON p.id=m.payment_id WHERE m.id=$1', [membership.id]);
    assert.equal(actual.rows[0].expires_at.toISOString(), '2026-12-26T10:00:00.000Z');
    assert.equal(actual.rows[0].status, 'SUCCEEDED');
    pass('real saveBogPayment followed by a retired real saveRuntimeState preserves the paid position and payment');
    await assert.rejects(priorStorage.saveBogPayment({ ...intent, id: 'retired-new-payment', idempotencyKey: 'retired-new-payment', status: 'FAILED' }, {}, () => {}), isDeploymentHandoff);
    let deletionPublished = false;
    await assert.rejects(priorStorage.deleteCraftsmanAccount(['fixture-craftsman'], ['fixture-user'],
      { id: 'retired-delete', actorType: 'USER', actorId: 'admin', action: 'DELETE_CRAFTSMAN', targetType: 'CRAFTSMAN', targetId: 'fixture-craftsman', createdAt: membership.startsAt },
      () => false, () => { deletionPublished = true; }), isDeploymentHandoff);
    assert.equal(deletionPublished, false);
    assert.equal((await postgres.query('SELECT status FROM public.payment_intents WHERE id=$1', [intent.id])).rows[0].status, 'SUCCEEDED');
    pass('retired targeted payment and account deletion writes cannot bypass the same deployment fence');
  } finally { process.env.NODE_ENV = 'test'; }

  const snapshotStorage = new StorageService();
  const snapshotState = Object.fromEntries(['users','craftsmen','craftsmanDrafts','top15Prices','top15Reservations','top15Memberships','paymentIntents','craftsmanListings','advertisements'].map(n => [n,new Map()]));
  Object.assign(snapshotState, { supportMessages: [], aiReports: [], auditLog: [], listingPurgeLog: [] });
  snapshotState.users.set('before', { id: 'before', roles: ['CRAFTSMAN'], status: 'ACTIVE', createdAt: '2026-11-26T10:00:00Z' });
  let capturedCraftsmen;
  const snapshotQuery = async (sql, args = []) => {
    if (sql.startsWith('DELETE FROM public.users ')) {
      // Another registration arrives after the users part of the snapshot.
      snapshotState.users.set('during', { id: 'during', roles: ['CRAFTSMAN'], status: 'ACTIVE', createdAt: '2026-11-26T10:00:00Z' });
      snapshotState.craftsmen.set('during-profile', { id: 'during-profile', userId: 'during', photos: [] });
    }
    if (sql.startsWith('DELETE FROM public.craftsmen ')) capturedCraftsmen = args[0];
    return { rows: [], rowCount: 1 };
  };
  snapshotStorage.pool = { connect: async () => ({ query: snapshotQuery, release() {} }) };
  await snapshotStorage.saveRuntimeState(snapshotState);
  assert.deepEqual(capturedCraftsmen, []);
  assert.equal(snapshotState.craftsmen.has('during-profile'), true);
  pass('one queued snapshot remains internally consistent when another request mutates memory during SQL');

  for (const table of tables) await assert.rejects(legacy(`DELETE FROM public.${table} WHERE false`), error => error.code === '55000');
  pass('all runtime tables reject unfenced deletes, even when no row would match');
  await assert.rejects(postgres.exec('SET ROLE anon; SELECT * FROM masterboy_deploy.writer_control;'), error => error.code === '42501');
  await postgres.exec('RESET ROLE');
  pass('public browser role cannot access deployment coordination metadata');
  replacement.stopAdmission();
  await assert.rejects(replacement.assertActive(pool), DeploymentHandoffError);
  pass('shutdown closes new write admission while committed rows remain intact');
  console.log(`DEPLOYMENT_FENCE_RESULT: PASSED (${results.length}/${results.length})`);
} finally { await postgres.close(); }
