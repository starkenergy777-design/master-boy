import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Embedded PostgreSQL and the actual storage method; no external database.
process.env.NODE_ENV = 'test';
for (const key of Object.keys(process.env)) if (/DATABASE|SUPABASE|PGHOST|PGPASSWORD/.test(key)) delete process.env[key];
const { StorageService } = await import('../.audit-build/storage.js');
const postgres = await PGlite.create();
const store = new StorageService();
let failAudit = false;
let heldDelete;
let reachedDelete;
const query = async (sql, args) => {
  if (heldDelete && sql.startsWith('DELETE FROM public.craftsmen')) { reachedDelete(); await heldDelete; }
  if (failAudit && sql.startsWith('INSERT INTO public.audit_logs')) throw new Error('isolated audit failure');
  const result = await postgres.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
store.pool = { query, connect: async () => ({ query, release() {} }) };
const audit = suffix => ({ id: `audit-${suffix}`, actorType: 'USER', actorId: 'admin', action: 'DELETE_CRAFTSMAN', targetType: 'CRAFTSMAN', targetId: suffix, createdAt: new Date().toISOString() });
async function rows(table) { return (await postgres.query(`SELECT * FROM public.${table} ORDER BY 1`)).rows; }
try {
  const initial = (await readFile(new URL('../migrations/001_initial_schema.sql', import.meta.url), 'utf8'))
    .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
  await postgres.exec(initial);
  for (const migration of ['003_advertisements_schema.sql','004_runtime_storage.sql','011_hard_delete_craftsmen_and_reconcile_top15.sql','012_admin_share_percentage.sql','015_financial_terms_and_cases.sql','017_bog_payment_checkout.sql']) {
    await postgres.exec(await readFile(new URL('../migrations/' + migration, import.meta.url), 'utf8'));
  }
  await postgres.exec(`
    INSERT INTO cities(id,name_ka,name_ru,name_en,lat,lng) VALUES('city','Test','Test','Test',41,44);
    INSERT INTO professions(id,name_ka,name_ru,name_en) VALUES('profession','Test','Test','Test');
    INSERT INTO users(id,phone,password_hash,roles) VALUES('admin','+995555100001','hash','{SUPER_ADMIN}'),('target-user','+995555100002','hash','{CRAFTSMAN}'),('other-user','+995555100003','hash','{CRAFTSMAN}');
    INSERT INTO craftsmen(id,user_id,name,phone,city_id,profession_id) VALUES('target','target-user','Target','+995555100002','city','profession'),('other','other-user','Other','+995555100003','city','profession');
    INSERT INTO craftsman_photos(id,craftsman_id,url) VALUES('target-photo','target','https://example.com/a.jpg'),('other-photo','other','https://example.com/b.jpg');
    INSERT INTO craftsman_drafts(user_id,step,data) VALUES('target-user',2,'{}'),('other-user',2,'{}');
    INSERT INTO craftsman_listings(id,craftsman_id,city_id,profession_id,status,starts_at,expires_at) VALUES('target-listing','target','city','profession','ACTIVE',NOW(),'2027-05-24'),('other-listing','other','city','profession','ACTIVE',NOW(),'2027-05-25');
    INSERT INTO top15_reservations(id,craftsman_id,city_id,profession_id,expires_at) VALUES('target-reservation','target','city','profession','2026-11-27'),('other-reservation','other','city','profession','2026-11-27');
    INSERT INTO top15_memberships(id,craftsman_id,city_id,profession_id,expires_at) VALUES('target-membership','target','city','profession','2026-12-25'),('other-membership','other','city','profession','2026-12-26');
    INSERT INTO support_messages(id,craftsman_id,sender,body) VALUES('target-message','target','CRAFTSMAN','test'),('other-message','other','CRAFTSMAN','test');
    INSERT INTO ai_reports(id,report_type,craftsman_id) VALUES('target-report','HEALTH','target'),('other-report','HEALTH','other');
    INSERT INTO payment_intents(id,craftsman_id,provider,amount_minor,idempotency_key,status) VALUES('target-payment','target','prov-bog',1000,'target-key','SUCCEEDED'),('other-payment','other','prov-bog',1000,'other-key','SUCCEEDED'),('ad-payment',NULL,'prov-bog',5000,'ad-key','SUCCEEDED');
    INSERT INTO financial_cases(id,craftsman_id,payment_intent_id,reason,description) VALUES('target-case','target','target-payment','OTHER','Test evidence retained.');
    INSERT INTO audit_logs(id,actor_type,actor_id,action) VALUES('historic','USER','admin','EXISTING_EVENT');
  `);
  const tables = ['users','craftsmen','craftsman_photos','craftsman_drafts','craftsman_listings','top15_reservations','top15_memberships','support_messages','ai_reports','payment_intents','financial_cases','audit_logs'];
  const before = Object.fromEntries(await Promise.all(tables.map(async table => [table, await rows(table)])));
  let published = false;
  failAudit = true;
  await assert.rejects(store.deleteCraftsmanAccount(['target'], ['target-user'], audit('failed'), () => false, () => { published = true; }), /isolated audit failure/);
  assert.equal(published, false);
  for (const table of tables) assert.deepEqual(await rows(table), before[table], `${table} must survive a rolled-back deletion`);
  failAudit = false;
  await assert.rejects(store.deleteCraftsmanAccount(['target'], ['target-user'], audit('pending'), () => true, () => { published = true; }), error => error.code === 'BOG_ACCOUNT_PAYMENT_PENDING');
  assert.equal(published, false);
  const deletion = store.deleteCraftsmanAccount(['target'], ['target-user'], audit('target'), () => false, () => { published = true; });
  await deletion;
  assert.equal(published, true);
  for (const table of ['craftsmen','craftsman_photos','craftsman_listings','top15_reservations','top15_memberships','support_messages','ai_reports']) {
    const remaining = await rows(table);
    assert.equal(remaining.length, 1, `${table} removes only the target`);
    assert.deepEqual(remaining, before[table].filter(row => row.id.startsWith('other')));
  }
  assert.deepEqual(await rows('users'), before.users.filter(row => row.id !== 'target-user'));
  assert.deepEqual(await rows('craftsman_drafts'), before.craftsman_drafts.filter(row => row.user_id !== 'target-user'));
  assert.deepEqual(await rows('payment_intents'), before.payment_intents.map(row => row.id === 'target-payment' ? { ...row, craftsman_id: null } : row));
  assert.deepEqual(await rows('financial_cases'), before.financial_cases);
  const afterAudit = await rows('audit_logs');
  assert.equal(afterAudit.length, 2);
  assert.deepEqual(afterAudit.find(row => row.id === 'historic'), before.audit_logs[0]);
  console.log('PASS: actual PostgreSQL cascades remove only the target; payment and dispute evidence, other profiles, expiries and audit history survive');

  // A queued snapshot must freeze after the delete publishes, so it cannot
  // revive an account whose targeted transaction has just committed.
  const otherUser = { id: 'other-user', phone: '+995555100003', password: 'hash', roles: ['CRAFTSMAN'], status: 'ACTIVE', createdAt: new Date().toISOString() };
  const otherCraftsman = { id: 'other', userId: otherUser.id, name: 'Other', phone: otherUser.phone, cityId: 'city', professionId: 'profession', status: 'ACTIVE', photos: [], createdAt: otherUser.createdAt, updatedAt: otherUser.createdAt };
  const state = { users: new Map([[otherUser.id, otherUser]]), craftsmen: new Map([['other',otherCraftsman]]), craftsmanDrafts: new Map(), top15Prices: new Map(), top15Reservations: new Map(), top15Memberships: new Map(), paymentIntents: new Map(), craftsmanListings: new Map(), advertisements: new Map(), supportMessages: [], aiReports: [], auditLog: [], listingPurgeLog: [] };
  let releaseDelete;
  heldDelete = new Promise(resolve => { releaseDelete = resolve; });
  const reached = new Promise(resolve => { reachedDelete = resolve; });
  const queuedDeletion = store.deleteCraftsmanAccount(['other'], ['other-user'], audit('other'), () => false, () => {
    state.users.delete('other-user'); state.craftsmen.delete('other');
  });
  await reached;
  const queuedSnapshot = store.saveRuntimeState(state);
  releaseDelete();
  await queuedDeletion;
  heldDelete = undefined;
  await queuedSnapshot;
  assert.equal((await rows('craftsmen')).length, 0);
  assert.equal((await rows('users')).length, 0);
  console.log('PASS: the existing persistence queue cannot revive a committed deletion with a stale snapshot');
} finally {
  await postgres.close();
}
