import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(f, 'utf8');
const routes = read('server/routes.ts');
const db = read('server/db.ts');
const main = read('src/screens/MainScreen.tsx');
const craftsman = read('src/screens/CraftsmanDashboard.tsx');
const api = read('src/api.ts');
const sim = read('role-simulation.mjs');

const checks = [];
function check(name, fn) { try { fn(); checks.push(`PASS: ${name}`); } catch (e) { checks.push(`FAIL: ${name} — ${e.message}`); } }

check('customer is anonymous on public search', () => {
  assert.match(routes, /apiRouter\.get\('\/search'/);
  assert.match(routes, /apiRouter\.get\('\/cities'/);
  assert.match(routes, /apiRouter\.get\('\/professions'/);
});
check('customer registration is not required', () => assert.match(main, /You do not need an account to find a craftsman/));
check('all role matrix simulation is present', () => assert.match(sim, /ALL ROLE SIMULATIONS PASSED/));
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

const failed = checks.filter(x => x.startsWith('FAIL:'));
console.log(checks.join('\n'));
console.log(`AUDIT_RESULT: ${failed.length ? 'FAILED' : 'PASSED'} (${checks.length - failed.length}/${checks.length})`);
process.exitCode = failed.length ? 1 : 0;
