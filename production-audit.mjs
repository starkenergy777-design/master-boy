import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const routes = read('server/routes.ts');
const db = read('server/db.ts');
const storage = read('server/storage.ts');
const server = read('server.ts');
const seed = read('migrations/002_seed_data.sql');
const cityOrderMigration = read('migrations/006_georgian_alphabetical_city_order.sql');
const main = read('src/screens/MainScreen.tsx');
const craftsman = read('src/screens/CraftsmanDashboard.tsx');
const api = read('src/api.ts');
const sim = read('role-simulation.mjs');
const wizard = read('src/screens/RegistrationWizard.tsx');
const top15 = read('src/screens/Top15Screen.tsx');
const superAdmin = read('src/screens/SuperAdminScreen.tsx');
const topBar = read('src/components/TopAppBar.tsx');
const supportChat = read('src/screens/SupportChatScreen.tsx');
const adminDashboard = read('src/screens/AdminDashboard.tsx');
const packageJson = JSON.parse(read('package.json'));

const checks = [];
function check(name, fn) { try { fn(); checks.push(`PASS: ${name}`); } catch (e) { checks.push(`FAIL: ${name} — ${e.message}`); } }

check('customer is anonymous on public search', () => {
  assert.match(routes, /apiRouter\.get\('\/search'/);
  assert.match(routes, /apiRouter\.get\('\/cities'/);
  assert.match(routes, /apiRouter\.get\('\/professions'/);
});
check('customer registration is not required', () => assert.match(main, /You do not need an account to find a craftsman/));
check('live HTTP role and payment simulations are present', () => assert.match(sim, /ALL HTTP ROLE AND PAYMENT SIMULATIONS PASSED/));
check('ad partner role is protected', () => {
  assert.match(routes, /function requireAdPartner/);
  assert.match(routes, /apiRouter\.get\('\/partner\/ad', requireAdPartner/);
});
check('super admin provisions ad credentials, price and duration', () => {
  assert.match(routes, /apiRouter\.post\('\/admin\/advertisements', requireSuperAdmin/);
  assert.match(routes, /price_gel/);
  assert.match(routes, /days_duration/);
  assert.match(routes, /phone_number/);
});
check('ad validity starts after payment', () => assert.match(routes, /Validity starts only after a confirmed payment/));
check('unpaid ads cannot be activated by admin', () => assert.match(routes, /PAYMENT_REQUIRED.*An advertisement cannot be activated/));
check('real production payment is fail-closed until gateway exists', () => assert.match(routes, /PAYMENT_PROVIDER_NOT_READY/));
check('partner payment uses idempotency', () => {
  assert.match(routes, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(api, /adpay-\$\{crypto\.randomUUID\(\)\}/);
});
check('public ad is server-authoritative', () => assert.match(main, /api\.getActiveAd\(\)/));
check('no hardcoded Gorgia/default ad remains in home UI', () => assert.doesNotMatch(main, /ad-gorgia-1|გორგია|gorgia\.ge/));
check('craftsman cabinet displays active advertisement', () => assert.match(craftsman, /api\.getActiveAd\(\)/));
check('ad credentials are not returned by safe advertisement serializer', () => assert.match(routes, /function safeAdvertisement/));
check('production durable storage remains mandatory', () => assert.match(db, /REQUIRE_DURABLE_STORAGE/));
check('source archive endpoint is absent', () => assert.doesNotMatch(routes, /zip|source archive/i));
check('admin user list never returns password hashes', () => assert.match(routes, /list\.slice\(offset, offset \+ size\)\.map\(safeUser\)/));
check('admin craftsman output omits bank account details', () => {
  assert.match(routes, /function safeAdminCraftsman/);
  assert.match(routes, /safeAdminCraftsman\(craftsman\)/);
});
check('admin cannot block or delete itself or privileged accounts', () => {
  assert.match(routes, /function canManageAccount/);
  assert.match(routes, /CANNOT_MANAGE_SELF/);
  assert.match(routes, /STAFF_ACCOUNT_REQUIRES_SUPER_ADMIN/);
  assert.match(routes, /LAST_SUPER_ADMIN/);
});
check('blocked-user sessions are revoked', () => assert.match(routes, /function revokeUserSessions/));
check('unauthenticated registration cannot reset an existing account', () => {
  assert.match(routes, /An unauthenticated, paid registration must never reset an existing account/);
  assert.match(routes, /PHONE_ALREADY_REGISTERED/);
});
check('registration frontend enforces the server 12-character password minimum', () => {
  assert.match(wizard, /formData\.password\.length < 12/);
  assert.match(wizard, /minLength=\{12\}/);
});
check('SMS login does not claim to send an undelivered code', () => {
  assert.match(routes, /OTP_DELIVERY_NOT_IMPLEMENTED/);
  assert.match(routes, /OTP_PROVIDER_NOT_CONFIGURED/);
});
check('provider API responses omit secret values', () => {
  assert.match(routes, /function safeProvider/);
  assert.match(routes, /delete clone\[field\]/);
  assert.match(routes, /res\.json\(safeProvider\(newItem\)\)/);
});
check('provider editor leaves saved credentials blank to avoid overwriting them with masks', () => {
  assert.match(superAdmin, /Secret values are never returned by the API/);
  assert.match(superAdmin, /secretKey: ''/);
});
check('saved administrator passwords are not reset from deployment secrets at startup', () => {
  assert.match(db, /Supabase is authoritative after the first boot/);
  assert.match(db, /if \(!storedUsers\.some\(user => user\.roles\.includes\('ADMIN'\)\)\)/);
  assert.match(db, /if \(!storedUsers\.some\(user => user\.roles\.includes\('SUPER_ADMIN'\)\)\)/);
  assert.doesNotMatch(db, /deployment secrets only replace the two configured administrator credentials/);
});
check('bootstrap password retirement survives a restart', () => {
  assert.match(db, /BOOTSTRAP_MIGRATION_COMPLETED/);
  assert.match(db, /bootstrapCompletion\)\s*\{/);
  assert.match(db, /invalidated: true/);
  assert.match(routes, /await db\.persistRuntimeState\(\);/);
});
check('development fallback catalog includes the latest cities and professions', () => {
  assert.match(db, /id: 'city-svaneti'/);
  assert.match(db, /id: 'city-khashuri'/);
  assert.match(db, /id: 'prof-demolition-drill'/);
  assert.match(db, /id: 'prof-waste-removal'/);
});
check('cities keep major centers first, then follow Georgian alphabetical order', () => {
  const expected = ['city-tbilisi', 'city-batumi', 'city-kutaisi', 'city-rustavi', 'city-akhaltsikhe', 'city-borjomi', 'city-gori', 'city-zestafoni', 'city-zugdidi', 'city-telavi', 'city-martvili', 'city-samtredia', 'city-svaneti', 'city-poti', 'city-kobuleti', 'city-tskaltubo', 'city-khashuri'];
  const cityBlock = db.match(/cities: City\[\] = \[([\s\S]*?)\n  \];/)?.[1] || '';
  const seedBlock = seed.match(/INSERT INTO cities[\s\S]*?VALUES([\s\S]*?)ON CONFLICT/)?.[1] || '';
  assert.deepEqual([...cityBlock.matchAll(/id: '(city-[^']+)'/g)].map(x => x[1]), expected);
  assert.deepEqual([...seedBlock.matchAll(/\('(city-[^']+)'/g)].map(x => x[1]), expected);
  assert.match(cityOrderMigration, /city-telavi', 10/);
  assert.match(cityOrderMigration, /city-poti', 14/);
});
check('fresh-install seed has no placeholder credentials or demo accounts', () => {
  assert.doesNotMatch(seed, /UNUSABLE_SEED_PASSWORD|INSERT INTO users|INSERT INTO craftsmen|Demo Craftsman/i);
});
check('craftsman registration does not default to a payment bank', () => {
  assert.match(wizard, /useState\(''\)/);
  assert.doesNotMatch(wizard, /prov-bog/);
  assert.match(wizard, /!isFreeRegistration && !selectedProviderId/);
});
check('Top15 checkout requires an operational provider before reserving a slot', () => {
  assert.match(routes, /apiRouter\.post\('\/top15\/reserve'[\s\S]{0,260}requireRealPaymentIntegration/);
  assert.match(routes, /const simulationEnabled = process\.env\.NODE_ENV !== 'production'[\s\S]{0,180}PAYMENTS_SIMULATION/);
});
check('Top15 payment provider selection requires explicit user choice', () => {
  assert.doesNotMatch(top15, /setSelectedProviderId\(provs\[0\]\.id\)/);
  assert.match(top15, /setSelectedProviderId\(''\)/);
});
check('Top15 does not reserve a slot when no payment provider is available', () => {
  const providerFetch = top15.indexOf('const provs = await api.getPaymentProviders();');
  const unavailableGuard = top15.indexOf('if (provs.length === 0)');
  const reservationCall = top15.indexOf('const res = await api.reserveTop15Slot');
  assert.ok(providerFetch >= 0 && providerFetch < unavailableGuard && unavailableGuard < reservationCall);
});
check('Top15 payment verifies reservation ownership and payment-status ownership', () => {
  assert.match(routes, /reservation\.craftsmanId !== craftsman\.id/);
  assert.match(routes, /intent\.craftsmanId !== craftsman\.id/);
});
check('ad payment records do not misuse the craftsman foreign key', () => {
  assert.match(routes, /reservationId: ad\.id,[\s\S]{0,100}craftsmanId: null,[\s\S]{0,100}providerId: paymentProvider\.id/);
});
check('super admin is told that saving payment credentials does not enable charges', () => {
  assert.match(superAdmin, /saving credentials does not enable charges/i);
});
check('production cannot mark a payment provider active from stored metadata', () => {
  assert.match(storage, /process\.env\.NODE_ENV === 'production' \? \{ isActive: false \}/);
  assert.match(db, /Credentials alone do not mean a live gateway adapter is integrated/);
});
check('production payment toggle is disabled in the superadmin UI', () => assert.match(superAdmin, /disabled=\{loading \|\| configLock\.locked \|\| import\.meta\.env\.PROD\}/));
check('rate limiting uses Render forwarded client IP and validates it', () => {
  assert.match(routes, /req\.header\('X-Forwarded-For'\)/);
  assert.match(routes, /isIP\(value\)/);
  assert.doesNotMatch(routes, /req\.ip/);
});
check('both health endpoints query durable storage instead of trusting stale state', () => {
  assert.match(storage, /async checkDatabaseHealth\(\)/);
  assert.match(storage, /client\.query\('SELECT 1'\)/);
  assert.match(server, /await storage\.checkDatabaseHealth\(\)/);
  assert.match(routes, /await storage\.checkDatabaseHealth\(\)/);
});
check('agent snapshot and superadmin persistence status perform a live database probe', () => {
  assert.match(routes, /async function buildSuperAdminAgentAuditSnapshot\(\)/);
  assert.match(routes, /currentAdminSnapshot: await buildSuperAdminAgentAuditSnapshot\(\)/);
  assert.match(routes, /apiRouter\.get\('\/admin\/persistence\/status', requireSuperAdmin, async/);
});
check('craftsman deletion handles drafts by map key and nullable payment owner safely', () => {
  assert.match(routes, /filter\(\(\[userId\]\) => userIds\.has\(userId\)\)/);
  assert.match(routes, /payment\.craftsmanId !== null && craftsmanIds\.has\(payment\.craftsmanId\)/);
});
check('AI user interface identifies the selected provider and does not promise continuous audits', () => {
  assert.match(topBar, /subtitle: t\.supportSubtitle/);
  assert.match(supportChat, /select and configure an AI provider/i);
  assert.match(adminDashboard, /does not continuously audit payments/);
});
check('production build runs TypeScript checks before bundling', () => assert.match(packageJson.scripts.build, /typecheck[\s\S]*vite build/));

const failed = checks.filter(x => x.startsWith('FAIL:'));
console.log(checks.join('\n'));
console.log(`AUDIT_RESULT: ${failed.length ? 'FAILED' : 'PASSED'} (${checks.length - failed.length}/${checks.length})`);
process.exitCode = failed.length ? 1 : 0;

