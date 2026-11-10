import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const routes = read('server/routes.ts');
const db = read('server/db.ts');
const storage = read('server/storage.ts');
const server = read('server.ts');
const seed = read('migrations/002_seed_data.sql');
const additionalProfessions = read('migrations/010_add_additional_professions.sql');
const professionOrder = read('server/professionOrder.ts');
const professionPicker = read('src/components/ProfessionPicker.tsx');
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
const indexHtml = read('index.html');

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
  assert.doesNotMatch(routes, /OTP_PROVIDER_NOT_CONFIGURED/);
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
check('all professions stay aligned across database, migration seed, display order, and icons', () => {
  const databaseBlock = db.match(/professions: Profession\[\] = \[([\s\S]*?)\n  \];/)?.[1] || '';
  const databaseIds = [...databaseBlock.matchAll(/id: '(prof-[^']+)'/g)].map((match) => match[1]);
  const sqlIds = [...`${seed}\n${additionalProfessions}`.matchAll(/\('(prof-[^']+)'/g)].map((match) => match[1]);
  const uniqueSqlIds = [...new Set(sqlIds)];
  const priorityIds = [...professionOrder.matchAll(/'((?:prof)-[^']+)'/g)].map((match) => match[1]);
  const iconBlock = professionPicker.match(/const professionIcons: Record<string, LucideIcon> = \{([\s\S]*?)\n\};/)?.[1] || '';
  const customIconBlock = professionPicker.match(/const customProfessionGlyphs: Record<string, React\.FC<CustomProfessionGlyphProps>> = \{([\s\S]*?)\n\};/)?.[1] || '';
  const iconIds = [...`${iconBlock}\n${customIconBlock}`.matchAll(/'(prof-[^']+)'\s*:/g)].map((match) => match[1]);
  const sorted = (values) => [...values].sort();
  assert.equal(databaseIds.length, 20);
  assert.equal(new Set(databaseIds).size, databaseIds.length);
  assert.deepEqual(sorted(uniqueSqlIds), sorted(databaseIds));
  assert.deepEqual(sorted(priorityIds), sorted(databaseIds));
  assert.deepEqual(sorted(iconIds), sorted(databaseIds));
  assert.ok(databaseBlock.match(/id: 'prof-[^']+', name: \{ ka: '[^']+', ru: '[^']+', en: '[^']+' \}/g)?.length === databaseIds.length);
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
check('rate limiting trusts Render edge client IP and restricts XFF fallback to non-production', () => {
  assert.match(routes, /const cloudflareClientIp = req\.header\('CF-Connecting-IP'\)\?\.trim\(\);/);
  assert.match(routes, /if \(process\.env\.NODE_ENV !== 'production'\) \{[\s\S]{0,250}req\.header\('X-Forwarded-For'\)/);
  assert.match(routes, /isIP\(value\)/);
  assert.match(routes, /process\.env\.NODE_ENV !== 'production'[\s\S]{0,140}X-Forwarded-For/);
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
  assert.match(routes, /const snapshot = await buildSuperAdminAgentAuditSnapshot\(\)/);
  assert.match(routes, /currentAdminSnapshot: snapshot/);
  assert.match(routes, /apiRouter\.get\('\/admin\/persistence\/status', requireSuperAdmin, async/);
});
check('accountant agent has read-only context and no administrative action executor', () => {
  assert.match(routes, /You have READ-ONLY access to a server-generated summary/);
  assert.match(routes, /You cannot create, change, delete, block, approve, or configure/);
  assert.doesNotMatch(routes, /runSuperAdminAgentAction|validateAgentAdminAction/);
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
check('public metadata does not advertise stale API versions or a native Android client', () => {
  assert.doesNotMatch(indexHtml, /trusted backend API v1\.2\.0|native Android client experience/i);
  assert.match(indexHtml, /helps people in Georgia find and contact local craftsmen directly/i);
});

check('public login uses one non-enumerating failure response and a dummy password hash', () => {
  const loginStart = routes.indexOf("apiRouter.post(['/auth/password/login'");
  const loginEnd = routes.indexOf('// POST /auth/craftsman/register', loginStart);
  const loginRoute = routes.slice(loginStart, loginEnd);
  assert.match(routes, /const DUMMY_LOGIN_PASSWORD_HASH = hashPassword\(crypto\.randomBytes\(32\)\.toString\('base64url'\)\);/);
  assert.match(routes, /const INVALID_LOGIN_RESPONSE = \{\s*code: 'INVALID_CREDENTIALS',/);
  assert.ok(loginRoute.includes('foundUser?.password || DUMMY_LOGIN_PASSWORD_HASH'));
  assert.ok(loginRoute.includes('json(INVALID_LOGIN_RESPONSE)'));
  assert.ok(!loginRoute.includes('USER_NOT_FOUND'));
});
check('OTP request does not disclose bootstrap or account existence', () => {
  const otpStart = routes.indexOf("apiRouter.post('/auth/otp/request'");
  const otpEnd = routes.indexOf("apiRouter.post('/auth/otp/verify'", otpStart);
  const otpRoute = routes.slice(otpStart, otpEnd);
  assert.ok(!otpRoute.includes('db.bootstrap'));
  assert.ok(!otpRoute.includes('challengeId'));
  assert.ok(otpRoute.includes('OTP_DELIVERY_NOT_IMPLEMENTED'));
});
check('untrusted request sizes and password lengths are bounded', () => {
  assert.ok(server.includes("express.json({ limit: '1mb' })"));
  assert.ok(routes.includes('password.length > 1024'));
  assert.ok(routes.includes('password.length > 128'));
  assert.ok(db.includes('Password must be a string no longer than 1,024 characters'));
});
check('deployment metadata and repository paths are explicitly blocked', () => {
  assert.ok(server.includes('decodeURIComponent(requestPath)'));
  assert.ok(server.includes('git(?:'));
  assert.ok(server.includes('env(?:'));
  assert.ok(server.includes('return res.sendStatus(404)'));
});
check('bootstrap credentials have no predictable fallback phone', () => {
  assert.ok(db.includes("phone: process.env.BOOTSTRAP_PHONE || ''"));
  assert.ok(db.includes('enabled: Boolean(process.env.BOOTSTRAP_PHONE && process.env.BOOTSTRAP_PASSWORD)'));
  assert.ok(superAdmin.includes("useState('')"));
  assert.ok(!superAdmin.includes("setNewPhone('+995"));
});
check('public profile registration validates text, catalog IDs, bank field, and photo URLs', () => {
  assert.ok(routes.includes('resolvedName.length > 150'));
  assert.ok(routes.includes('description.length > 4000'));
  assert.ok(routes.includes('normalizedBankAccount.length > 64'));
  assert.ok(routes.includes('INVALID_PHOTO_URL'));
});
check('free public registration has IP and phone throttles', () => {
  assert.ok(routes.includes('craftsman-register:${getClientIp(req)}'));
  assert.ok(routes.includes('craftsman-register-phone:${normalizedPhone}'));
  assert.ok(routes.includes('TOO_MANY_REGISTRATION_ATTEMPTS'));
});
const failed = checks.filter(x => x.startsWith('FAIL:'))
console.log(checks.join('\n'));
console.log(`AUDIT_RESULT: ${failed.length ? 'FAILED' : 'PASSED'} (${checks.length - failed.length}/${checks.length})`);
process.exitCode = failed.length ? 1 : 0;


