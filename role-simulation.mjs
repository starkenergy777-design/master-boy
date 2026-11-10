import assert from 'node:assert/strict';

// This is an in-memory HTTP simulation. It intentionally removes database
// connection settings before importing the app and never writes to Supabase.
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_URL;
delete process.env.SUPABASE_DB_CA_CERT;
delete process.env.PAYMENTS_SIMULATION;

const [{ default: express }, { apiRouter }, { db }] = await Promise.all([
  import('express'),
  import('./.audit-build/routes.js'),
  import('./.audit-build/db.js'),
]);

const { hashPassword } = await import('./.audit-build/db.js');
const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);
const server = await new Promise((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
const auditUsers = [];
const auditCategoryIds = [];
const auditCraftsmanId = 'audit-craftsman-profile';
let createdAdminId;
const auditPaymentIntentId = 'audit-ad-payment-null-craftsman';

function addSession(role) {
  const id = `audit-user-${role.toLowerCase()}`;
  const token = `audit-session-${role.toLowerCase()}`;
  const user = {
    id,
    phone: `+995555000${String(role.length).padStart(3, '0')}`,
    roles: role ? [role] : [],
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };
  db.users.set(id, user);
  db.sessions.set(token, { userId: id, createdAt: Date.now() });
  auditUsers.push({ id, token });
  if (role === 'CRAFTSMAN') {
    db.craftsmen.set(auditCraftsmanId, {
      id: auditCraftsmanId,
      userId: id,
      name: 'Audit-only Craftsman',
      description: '',
      phone: user.phone,
      phoneVisible: true,
      latitude: null,
      longitude: null,
      workingHours: null,
      status: 'ACTIVE',
      cityId: 'city-tbilisi',
      professionId: 'prof-plumber',
      photos: [],
    });
  }
  return { id, token, user };
}

async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function check(name, condition) {
  assert.ok(condition, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

try {
  const roles = {
    CRAFTSMAN: addSession('CRAFTSMAN'),
    ADMIN: addSession('ADMIN'),
    SUPER_ADMIN: addSession('SUPER_ADMIN'),
    AD_PARTNER: addSession('AD_PARTNER'),
  };
  roles.CRAFTSMAN.user.password = hashPassword('Audit-only-password-123');
  const gates = [
    { role: 'CRAFTSMAN', path: '/craftsmen/me/listing', allowed: 200 },
    { role: 'ADMIN', path: '/admin/analytics', allowed: 200 },
    { role: 'SUPER_ADMIN', path: '/admin/providers/ai/status', allowed: 200 },
    { role: 'SUPER_ADMIN', path: '/admin/persistence/status', allowed: 200 },
    { role: 'AD_PARTNER', path: '/partner/ad', allowed: 200 },
  ];

  for (const gate of gates) {
    check(`anonymous denied from ${gate.path}`, (await request(gate.path)).status === 401);
    for (const [role, session] of Object.entries(roles)) {
      const expected = role === gate.role || (gate.role === 'ADMIN' && role === 'SUPER_ADMIN')
        ? gate.allowed
        : 403;
      const actual = (await request(gate.path, { token: session.token })).status;
      check(`${role} -> ${gate.path} = ${expected}`, actual === expected);
    }
  }

  for (const path of ['/cities', '/professions', '/search']) {
    check(`public endpoint ${path} responds without login`, (await request(path)).status === 200);
  }
  const publicProfessions = await request('/professions');
  const expectedProfessionIds = db.professions.map((profession) => profession.id);
  const publicProfessionIds = publicProfessions.body.map((profession) => profession.id);
  check('public profession catalog matches the complete server catalog',
    publicProfessions.status === 200 && publicProfessionIds.length === expectedProfessionIds.length &&
    new Set(publicProfessionIds).size === expectedProfessionIds.length &&
    expectedProfessionIds.every((id) => publicProfessionIds.includes(id)) &&
    publicProfessions.body.every((profession) => typeof profession.name === 'string' && profession.name.trim().length > 0));

  // Create one disposable active listing per city/profession pair in this
  // in-memory simulation. This covers every public search filter and Top 15
  // availability lookup without touching Supabase or sending payment requests.
  for (const city of db.cities) {
    for (const profession of db.professions) {
      const id = `audit-category-${city.id}-${profession.id}`;
      const now = new Date().toISOString();
      db.craftsmen.set(id, {
        id, userId: roles.CRAFTSMAN.id, name: `Audit ${profession.name.ka}`, description: '',
        phone: '+995555000000', phoneVisible: true, latitude: null, longitude: null,
        workingHours: null, status: 'ACTIVE', cityId: city.id, professionId: profession.id,
        createdAt: now, updatedAt: now, photos: [],
      });
      db.craftsmanListings.set(id, {
        id: `listing-${id}`, craftsmanId: id, cityId: city.id, professionId: profession.id,
        status: 'ACTIVE', startsAt: now, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now, updatedAt: now,
      });
      auditCategoryIds.push(id);
    }
  }

  let categorySearchChecks = 0;
  let categoryAvailabilityChecks = 0;
  for (const profession of db.professions) {
    for (const city of db.cities) {
      const expectedId = `audit-category-${city.id}-${profession.id}`;
      const search = await request(`/search?cityId=${encodeURIComponent(city.id)}&professionId=${encodeURIComponent(profession.id)}&size=50`);
      const results = [...(search.body.top15 || []), ...(search.body.data || [])];
      assert.equal(search.status, 200, `search failed for ${city.id}/${profession.id}`);
      assert.ok(results.some((craftsman) => craftsman.id === expectedId), `missing simulated listing for ${city.id}/${profession.id}`);
      assert.ok(results.every((craftsman) => craftsman.cityId === city.id && craftsman.professionId === profession.id),
        `search mixed categories for ${city.id}/${profession.id}`);
      categorySearchChecks++;

      const availability = await request(`/top15/availability?cityId=${encodeURIComponent(city.id)}&professionId=${encodeURIComponent(profession.id)}`, { token: roles.CRAFTSMAN.token });
      assert.equal(availability.status, 200, `Top 15 availability failed for ${city.id}/${profession.id}`);
      assert.ok(Number.isInteger(availability.body.amountMinor) && availability.body.amountMinor > 0,
        `invalid Top 15 price for ${city.id}/${profession.id}`);
      assert.equal(availability.body.currency, 'GEL', `unexpected currency for ${city.id}/${profession.id}`);
      assert.ok(Number.isInteger(availability.body.freeSlots) && availability.body.freeSlots >= 0 && availability.body.freeSlots <= 15,
        `invalid Top 15 capacity for ${city.id}/${profession.id}`);
      categoryAvailabilityChecks++;
    }
    check(`category ${profession.id} searches and prices work in every city`,
      categorySearchChecks >= db.cities.length && categoryAvailabilityChecks >= db.cities.length);
  }
  check(`all ${categorySearchChecks} city/category searches isolate results`, categorySearchChecks === db.cities.length * db.professions.length);
  check(`all ${categoryAvailabilityChecks} city/category prices are available`, categoryAvailabilityChecks === db.cities.length * db.professions.length);
  const health = await request('/health');
  check('health reports an unconfigured local database as not durable', health.status === 200 && health.body.durableStorage === false);

  const adminCreate = await request('/admin/admins', {
    method: 'POST', token: roles.SUPER_ADMIN.token,
    body: { phone: '+995555901230', password: 'Audit-admin-password-123', adminSharePercent: 12.5 },
  });
  createdAdminId = adminCreate.body.id;
  check('super admin can create an admin with a percentage share', adminCreate.status === 201 && adminCreate.body.adminSharePercent === 12.5);
  check('new admin response does not contain a password hash', !('password' in adminCreate.body));
  const adminCannotManageSuper = await request(`/admin/users/${roles.SUPER_ADMIN.id}/block`, {
    method: 'PUT', token: roles.ADMIN.token, body: {},
  });
  check('staff admin cannot block a super admin', adminCannotManageSuper.status === 403);
  const cannotBlockSelf = await request(`/admin/users/${roles.ADMIN.id}/block`, {
    method: 'PUT', token: roles.ADMIN.token, body: {},
  });
  check('admin cannot block its own account', cannotBlockSelf.status === 409);

  // Verify IP parsing is used by an actual limiter: five OTP attempts are
  // permitted per phone/IP window, the sixth is throttled, and another client
  // IP gets a separate bucket.
  const otpPhone = '+995555901234';
  const forwarded = { 'X-Forwarded-For': '198.51.100.42, 10.0.0.1' };
  let lastOtp;
  for (let i = 0; i < 6; i++) lastOtp = await request('/auth/otp/request', { method: 'POST', body: { phone: otpPhone }, headers: forwarded });
  check('OTP rate limit blocks the sixth request from one forwarded IP', lastOtp.status === 429);
  const otherIp = await request('/auth/otp/request', {
    method: 'POST', body: { phone: otpPhone }, headers: { 'X-Forwarded-For': '198.51.100.43, 10.0.0.1' },
  });
  check('a separate forwarded client IP has its own OTP bucket', otherIp.status === 503);
  let lastPhoneOtp;
  for (let i = 0; i < 14; i++) {
    lastPhoneOtp = await request('/auth/otp/request', {
      method: 'POST', body: { phone: otpPhone }, headers: { 'X-Forwarded-For': `198.51.100.${44 + i}, 10.0.0.1` },
    });
  }
  check('OTP also has an account-wide limit across different IPs', lastPhoneOtp.status === 503);
  const overPhoneLimit = await request('/auth/otp/request', {
    method: 'POST', body: { phone: otpPhone }, headers: { 'X-Forwarded-For': '198.51.100.60, 10.0.0.1' },
  });
  check('account-wide OTP limit prevents IP rotation from bypassing throttling', overPhoneLimit.status === 429);

  // In production, caller-controlled X-Forwarded-For values must not create
  // fresh rate-limit buckets. Render's overwritten CF-Connecting-IP is the
  // trusted client address; an absent or malformed value falls back to socket.
  const previousOtpNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const trustedEdgePhone = '+995555901334';
    let trustedEdgeLimit;
    for (let i = 0; i < 6; i++) {
      trustedEdgeLimit = await request('/auth/otp/request', {
        method: 'POST', body: { phone: trustedEdgePhone },
        headers: {
          'CF-Connecting-IP': '198.51.100.90',
          'X-Forwarded-For': `198.51.100.${70 + i}, 10.0.0.1`,
        },
      });
    }
    check('production OTP limit cannot be bypassed with spoofed X-Forwarded-For when the edge IP is present',
      trustedEdgeLimit.status === 429);

    const malformedEdgePhone = '+995555901335';
    let malformedEdgeLimit;
    for (let i = 0; i < 6; i++) {
      malformedEdgeLimit = await request('/auth/otp/request', {
        method: 'POST', body: { phone: malformedEdgePhone },
        headers: {
          'CF-Connecting-IP': 'not-an-ip',
          'X-Forwarded-For': `198.51.100.${80 + i}, 10.0.0.1`,
        },
      });
    }
    check('production OTP limit falls back to the socket when edge IP is missing or malformed',
      malformedEdgeLimit.status === 429);
  } finally {
    process.env.NODE_ENV = previousOtpNodeEnv;
  }

  // Temporarily emulate production to assert payment APIs stay fail-closed even
  // when old provider metadata says a provider is active. No gateway request is made.
  const previousNodeEnv = process.env.NODE_ENV;
  const paymentIntentCount = db.paymentIntents.size;
  const previousProviderStates = db.providerConfig.payment.map(provider => provider.isActive);
  db.providerConfig.payment.forEach(provider => { provider.isActive = true; });
  process.env.NODE_ENV = 'production';
  try {
    const blockedPaymentRoutes = [
      ['/craftsmen/me/listing/pay', roles.CRAFTSMAN],
      ['/top15/reserve', roles.CRAFTSMAN],
      ['/partner/pay', roles.AD_PARTNER],
    ];
    for (const [path, session] of blockedPaymentRoutes) {
      const result = await request(path, { method: 'POST', token: session.token, body: {} });
      check(`production payment stays disabled at ${path}`, result.status === 503 && result.body.code === 'PAYMENT_PROVIDER_NOT_READY');
    }
    const paidRegistration = await request('/auth/craftsman/register', {
      method: 'POST',
      body: {
        phone: '+995555901235', password: 'Audit-passphrase-123', name: 'Audit Registration',
        cityId: 'city-tbilisi', professionId: 'prof-plumber', bankAccount: 'GE00TEST', paid: true, providerId: 'prov-bog',
      },
    });
    check('production paid registration is rejected before account creation', paidRegistration.status === 503 && !Array.from(db.users.values()).some(user => user.phone === '+995555901235'));
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    db.providerConfig.payment.forEach((provider, index) => { provider.isActive = previousProviderStates[index]; });
  }

  db.listingPrice.amountMinor = 0;
  const freeRegistration = await request('/auth/craftsman/register', {
    method: 'POST',
    body: {
      phone: '+995555901236', password: 'Audit-passphrase-124', name: 'Audit Free Registration',
      cityId: 'city-tbilisi', professionId: 'prof-plumber', bankAccount: 'GE00TEST', paid: false,
    },
  });
  check('zero-price craftsman registration succeeds without payment', freeRegistration.status === 201 && freeRegistration.body.isNewUser === true);
  check('zero-price registration creates no payment intent', db.paymentIntents.size === paymentIntentCount);
  check('craftsman can register without SMS OTP', freeRegistration.body.user?.roles?.includes('CRAFTSMAN') === true);

  const craftsmanUserId = roles.CRAFTSMAN.id;
  const blockCraftsman = await request(`/admin/users/${craftsmanUserId}/block`, {
    method: 'PUT', token: roles.SUPER_ADMIN.token, body: {},
  });
  check('super admin can block a craftsman account', blockCraftsman.status === 200 && blockCraftsman.body.user?.status === 'BLOCKED');
  check('blocked craftsman session is revoked', (await request('/craftsmen/me/listing', { token: roles.CRAFTSMAN.token })).status === 401);
  const unblockCraftsman = await request(`/admin/users/${craftsmanUserId}/unblock`, {
    method: 'PUT', token: roles.SUPER_ADMIN.token, body: {},
  });
  check('super admin can unblock a craftsman account', unblockCraftsman.status === 200 && unblockCraftsman.body.user?.status === 'ACTIVE');
  const restoredCraftsmanToken = 'audit-session-craftsman-restored';
  db.sessions.set(restoredCraftsmanToken, { userId: craftsmanUserId, createdAt: Date.now() });
  roles.CRAFTSMAN.token = restoredCraftsmanToken;
  db.craftsmanDrafts.set(craftsmanUserId, { step: 2, data: { auditOnly: true }, updatedAt: new Date().toISOString() });
  db.paymentIntents.set(auditPaymentIntentId, {
    id: auditPaymentIntentId, reservationId: 'audit-ad', craftsmanId: null, providerId: 'prov-bog',
    amountMinor: 5000, currency: 'GEL', idempotencyKey: 'audit-null-craftsman-payment', status: 'PENDING', createdAt: new Date().toISOString(),
  });
  const deleteCraftsman = await request(`/admin/craftsmen/${auditCraftsmanId}`, {
    method: 'DELETE', token: roles.SUPER_ADMIN.token,
  });
  check('super admin can delete a craftsman and its profile', deleteCraftsman.status === 200 && !db.craftsmen.has(auditCraftsmanId));
  check('craftsman deletion removes the linked account and draft', !db.users.has(craftsmanUserId) && !db.craftsmanDrafts.has(craftsmanUserId));
  check('craftsman deletion leaves unrelated ad payment records intact', db.paymentIntents.get(auditPaymentIntentId)?.craftsmanId === null);

  const knownPhoneFailure = await request('/auth/password/login', {
    method: 'POST', body: { phone: roles.CRAFTSMAN.user.phone, password: 'wrong-audit-password' },
  });
  const unknownPhoneFailure = await request('/auth/password/login', {
    method: 'POST', body: { phone: '+19999999999', password: 'wrong-audit-password' },
  });
  check('login failures do not reveal whether a phone number is registered',
    knownPhoneFailure.status === 401 && unknownPhoneFailure.status === 401 &&
    knownPhoneFailure.body.code === 'INVALID_CREDENTIALS' && unknownPhoneFailure.body.code === 'INVALID_CREDENTIALS');
  const malformedLogin = await request('/auth/password/login', {
    method: 'POST', body: { phone: roles.CRAFTSMAN.user.phone, password: { oversized: 'not a string' } },
  });
  check('malformed login data receives a bounded generic failure', malformedLogin.status === 401 && malformedLogin.body.code === 'INVALID_CREDENTIALS');

  const savedBootstrap = { ...db.bootstrap };
  db.bootstrap = { ...db.bootstrap, phone: '+995555901299', password: 'Audit-bootstrap-password', enabled: true };
  const bootstrapOtp = await request('/auth/otp/request', { method: 'POST', body: { phone: db.bootstrap.phone } });
  const ordinaryOtp = await request('/auth/otp/request', { method: 'POST', body: { phone: '+995555901298' } });
  check('OTP request response does not reveal the bootstrap phone',
    bootstrapOtp.status === 503 && ordinaryOtp.status === 503 && bootstrapOtp.body.code === ordinaryOtp.body.code);
  db.bootstrap = savedBootstrap;

  const malformedRegistration = await request('/auth/register', {
    method: 'POST', body: { phone: '+995555901297', password: 'Audit-password-123', name: { malicious: true } },
  });
  check('registration rejects malformed profile objects without a server error', malformedRegistration.status === 400);
  const registrationPhone = '+995555901296';
  let lastRegistrationAttempt;
  for (let i = 0; i < 4; i++) {
    lastRegistrationAttempt = await request('/auth/register', {
      method: 'POST', body: { phone: registrationPhone, password: 'short', name: 'Audit-only' },
    });
  }
  check('free public registration is rate limited by phone', lastRegistrationAttempt.status === 429);

  console.log('ALL HTTP ROLE AND PAYMENT SIMULATIONS PASSED');
} finally {
  for (const { id, token } of auditUsers) {
    db.users.delete(id);
    db.sessions.delete(token);
  }
  db.craftsmen.delete(auditCraftsmanId);
  for (const id of auditCategoryIds) {
    db.craftsmen.delete(id);
    db.craftsmanListings.delete(id);
  }
  if (createdAdminId) db.users.delete(createdAdminId);
  db.paymentIntents.delete(auditPaymentIntentId);
  for (const [id, ad] of db.advertisements) {
    if (ad.phone_number?.startsWith('+995555000')) db.advertisements.delete(id);
  }
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

