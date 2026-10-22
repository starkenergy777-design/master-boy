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

  console.log('ALL HTTP ROLE AND PAYMENT SIMULATIONS PASSED');
} finally {
  for (const { id, token } of auditUsers) {
    db.users.delete(id);
    db.sessions.delete(token);
  }
  db.craftsmen.delete(auditCraftsmanId);
  if (createdAdminId) db.users.delete(createdAdminId);
  db.paymentIntents.delete(auditPaymentIntentId);
  for (const [id, ad] of db.advertisements) {
    if (ad.phone_number?.startsWith('+995555000')) db.advertisements.delete(id);
  }
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
