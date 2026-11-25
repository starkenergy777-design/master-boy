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
const { storage } = await import('./.audit-build/storage.js');
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
      financialTermsVersion: '2026-11-23-unipay-v2',
      financialTermsAcceptedAt: new Date().toISOString(),
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

  const termsProfile = db.craftsmen.get(auditCraftsmanId);
  const previousTerms = { financialTermsVersion: termsProfile.financialTermsVersion, financialTermsAcceptedAt: termsProfile.financialTermsAcceptedAt };
  const previousDisclosure = db.merchantDisclosure;
  const poolBeforeConsent = storage.pool;
  const termsPath = '/craftsmen/me/financial-terms';
  const termsSession = { token: roles.CRAFTSMAN.token };
  const acceptTerms = () => request(`${termsPath}/accept`, { ...termsSession, method: 'POST', body: {} });
  try {
    termsProfile.financialTermsVersion = null;
    termsProfile.financialTermsAcceptedAt = null;
    db.merchantDisclosure = { legalName: 'Test Merchant', identificationCode: '00000000000', address: 'Test address', phone: '+995555000000', email: 'audit@example.com' };
    let failWrite = true;
    let savedAt;
    let writes = 0;
    storage.pool = { query: async (sql, args) => {
      assert.match(sql, /UPDATE public\.craftsmen/);
      assert.deepEqual(args.slice(0, 3), [termsProfile.id, termsProfile.userId, previousTerms.financialTermsVersion]);
      if (failWrite) throw new Error('Simulated consent write failure');
      writes++;
      savedAt ??= args[3];
      return { rows: [{ financial_terms_accepted_at: new Date(savedAt) }] };
    } };
    const failedAcceptance = await acceptTerms();
    const afterFailure = await request(termsPath, termsSession);
    check('failed consent write leaves the profile unaccepted',
      failedAcceptance.status === 503 && failedAcceptance.body.code === 'TERMS_ACCEPTANCE_SAVE_FAILED' && afterFailure.body.accepted === false);
    failWrite = false;
    const saved = await acceptTerms();
    const retry = await acceptTerms();
    check('persisted consent is accepted and repeat submission preserves its timestamp',
      saved.status === 200 && retry.body.acceptedAt === savedAt && writes === 1);
  } finally {
    Object.assign(termsProfile, previousTerms);
    db.merchantDisclosure = previousDisclosure;
    storage.pool = poolBeforeConsent;
  }

  // Isolated photo persistence simulation: no Supabase connection or real rows.
  const originalPool = storage.pool;
  const originalFetch = globalThis.fetch;
  const persistedPhotos = new Map();
  let failPhotoWrite = false;
  const photoQuery = async (sql, args) => {
      if (failPhotoWrite) throw new Error('Simulated database outage');
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT c.*,COALESCE(jsonb_agg') && sql.includes('public.craftsmen')) {
        const c = db.craftsmen.get(auditCraftsmanId);
        return { rows: [{ id: c.id, user_id: c.userId, name: c.name, description: c.description,
          phone: c.phone, phone_visible: c.phoneVisible, city_id: c.cityId, profession_id: c.professionId,
          status: c.status, working_hours: c.workingHours, created_at: new Date(), updated_at: new Date(),
          photos: [...persistedPhotos.values()].filter((row) => row.craftsmanId === c.id) }] };
      }
      if (sql.startsWith('INSERT INTO public.craftsman_photos')) {
        persistedPhotos.set(args[0], { id: args[0], craftsmanId: args[1], url: args[2] });
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('UPDATE public.craftsman_photos')) {
        const row = persistedPhotos.get(args[0]);
        if (!row || row.craftsmanId !== args[1]) return { rowCount: 0, rows: [] };
        row.url = args[2];
        return { rowCount: 1, rows: [{ id: args[0] }] };
      }
      if (sql.startsWith('DELETE FROM public.craftsman_photos')) {
        const row = persistedPhotos.get(args[0]);
        if (!row || row.craftsmanId !== args[1]) return { rowCount: 0, rows: [] };
        persistedPhotos.delete(args[0]);
        return { rowCount: 1, rows: [{ id: args[0] }] };
      }
      if (sql.startsWith("UPDATE public.craftsman_drafts SET data")) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected photo test query: ${sql}`);
  };
  storage.pool = {
    query: photoQuery,
    connect: async () => ({ query: photoQuery, release() {} }),
  };
  globalThis.fetch = (input, init) => String(input).startsWith('https://drive.google.com/thumbnail?')
    ? Promise.resolve(new Response(null, String(input).includes('00000000000000000000000000000000')
      ? { status: 404, headers: { 'content-type': 'text/html' } }
      : { status: 200, headers: { 'content-type': 'image/jpeg' } }))
    : originalFetch(input, init);

  // Photo URL safety regression: isolated HTTP requests and fake persistence.
  const photoPath = '/craftsmen/me/photos';
  const craftsmanToken = roles.CRAFTSMAN.token;
  for (const badUrl of ['http://example.com/photo.jpg', 'https://localhost./photo.jpg', 'https://127.1/photo.jpg', 'javascript:alert(1)', 'https://www.facebook.com/photo.php?fbid=123', 'https://example.org/page']) {
    const rejected = await request(photoPath, { token: craftsmanToken, method: 'POST', body: { url: badUrl } });
    check('invalid photo URL rejected without changing profile', rejected.status === 422 && db.craftsmen.get(auditCraftsmanId).photos.length === 0);
  }
  const privateDrive = await request(photoPath, { token: craftsmanToken, method: 'POST', body: { url: 'https://drive.google.com/file/d/00000000000000000000000000000000/view' } });
  check('unavailable Drive photo is rejected', privateDrive.status === 422 && persistedPhotos.size === 0);
  const photoUrl = 'https://drive.google.com/file/d/1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU/view?usp=drivesdk';
  db.craftsmanDrafts.set(roles.CRAFTSMAN.user.id, { step: 2, data: { photoUrl, photos: [{ url: photoUrl }] }, updatedAt: new Date().toISOString() });
  const acceptedPhoto = await request(photoPath, { token: craftsmanToken, method: 'POST', body: { url: photoUrl } });
  check('Google Drive photo is persisted as a renderable URL', acceptedPhoto.status === 200 &&
    acceptedPhoto.body.url === 'https://drive.google.com/thumbnail?id=1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU&sz=w1000' &&
    persistedPhotos.get(acceptedPhoto.body.id)?.url === acceptedPhoto.body.url && db.craftsmen.get(auditCraftsmanId).photos.length === 1);
  check('saving a photo clears stale draft photo links', !db.craftsmanDrafts.has(roles.CRAFTSMAN.user.id));
  check('stored photo is loaded after simulated restart', (await storage.loadRuntimeCollection('craftsmen'))[auditCraftsmanId]?.photos[0]?.url === acceptedPhoto.body.url);
  const secondPhoto = await request(photoPath, { token: craftsmanToken, method: 'POST', body: { url: 'https://example.com/second.jpg' } });
  check('one-photo limit remains enforced', secondPhoto.status === 422 && db.craftsmen.get(auditCraftsmanId).photos.length === 1);
  const failedReplace = await request(photoPath + '/' + encodeURIComponent(acceptedPhoto.body.id), { token: craftsmanToken, method: 'PUT', body: { url: 'https://www.facebook.com/photo.php?fbid=123' } });
  check('rejected replacement preserves old photo', failedReplace.status === 422 && persistedPhotos.get(acceptedPhoto.body.id)?.url === acceptedPhoto.body.url);
  failPhotoWrite = true;
  const unavailableReplace = await request(photoPath + '/' + encodeURIComponent(acceptedPhoto.body.id), { token: craftsmanToken, method: 'PUT', body: { url: 'https://example.com/new.jpg' } });
  check('database failure preserves old photo', unavailableReplace.status === 503 && persistedPhotos.get(acceptedPhoto.body.id)?.url === acceptedPhoto.body.url);
  failPhotoWrite = false;
  const replacedPhoto = await request(photoPath + '/' + encodeURIComponent(acceptedPhoto.body.id), { token: craftsmanToken, method: 'PUT', body: { url: 'https://example.com/new.jpg' } });
  check('replacement updates one database row', replacedPhoto.status === 200 && persistedPhotos.size === 1 && persistedPhotos.get(acceptedPhoto.body.id)?.url === replacedPhoto.body.url);
  failPhotoWrite = true;
  const unavailableDelete = await request(photoPath + '/' + encodeURIComponent(acceptedPhoto.body.id), { token: craftsmanToken, method: 'DELETE' });
  check('database failure preserves photo during deletion', unavailableDelete.status === 503 && db.craftsmen.get(auditCraftsmanId).photos.length === 1);
  failPhotoWrite = false;
  const deletedPhoto = await request(photoPath + '/' + encodeURIComponent(acceptedPhoto.body.id), { token: craftsmanToken, method: 'DELETE' });
  check('photo removal clears memory and database row', deletedPhoto.status === 200 && db.craftsmen.get(auditCraftsmanId).photos.length === 0 && persistedPhotos.size === 0);
  check('deleted photo stays absent after simulated restart', (await storage.loadRuntimeCollection('craftsmen'))[auditCraftsmanId]?.photos.length === 0);
  const legacyPhoto = { ...acceptedPhoto.body, id: 'ph-legacy-audit' };
  db.craftsmen.get(auditCraftsmanId).photos.push(legacyPhoto);
  const repairedPhoto = await request(photoPath + '/' + legacyPhoto.id, { token: craftsmanToken, method: 'PUT', body: { url: 'https://example.com/repaired.jpg' } });
  check('replacement repairs a missing legacy database row', repairedPhoto.status === 200 && persistedPhotos.get(legacyPhoto.id)?.url === repairedPhoto.body.url);
  await request(photoPath + '/' + legacyPhoto.id, { token: craftsmanToken, method: 'DELETE' });
  db.craftsmen.get(auditCraftsmanId).photos.push(legacyPhoto);
  const missingRowDelete = await request(photoPath + '/' + legacyPhoto.id, { token: craftsmanToken, method: 'DELETE' });
  check('legacy photo without a database row can be removed', missingRowDelete.status === 200 && db.craftsmen.get(auditCraftsmanId).photos.length === 0);
  const [firstAdd, concurrentAdd] = await Promise.all([
    request(photoPath, { token: craftsmanToken, method: 'POST', body: { url: 'https://example.com/first.jpg' } }),
    request(photoPath, { token: craftsmanToken, method: 'POST', body: { url: 'https://example.com/second.jpg' } }),
  ]);
  check('concurrent requests create only one photo', [firstAdd.status, concurrentAdd.status].sort().join(',') === '200,422' && persistedPhotos.size === 1);
  await request(photoPath + '/' + encodeURIComponent(db.craftsmen.get(auditCraftsmanId).photos[0].id), { token: craftsmanToken, method: 'DELETE' });
  failPhotoWrite = true;
  const unavailableAdd = await request(photoPath, { token: craftsmanToken, method: 'POST', body: { url: 'https://example.com/new.jpg' } });
  check('failed insert does not publish a photo', unavailableAdd.status === 503 && db.craftsmen.get(auditCraftsmanId).photos.length === 0);
  failPhotoWrite = false;
  const facebookImage = await request(photoPath, { token: craftsmanToken, method: 'POST', body: { url: 'https://scontent.xx.fbcdn.net/v/t1/photo.jpg?token=1' } });
  check('direct Facebook CDN image is accepted', facebookImage.status === 200 && persistedPhotos.get(facebookImage.body.id)?.url === facebookImage.body.url);
  await request(photoPath + '/' + encodeURIComponent(facebookImage.body.id), { token: craftsmanToken, method: 'DELETE' });
  storage.pool = originalPool;
  globalThis.fetch = originalFetch;

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

  // Financial cases use disposable in-memory persistence; no live database or bank is touched.
  const financialPaymentId = 'audit-financial-payment';
  const financialPayment = { id: financialPaymentId, craftsmanId: auditCraftsmanId, amountMinor: 10000,
    currency: 'GEL', status: 'SUCCEEDED', createdAt: new Date().toISOString(),
    serviceStartsAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    serviceEndsAt: new Date(Date.now() + 25 * 86400000).toISOString() };
  db.paymentIntents.set(financialPaymentId, financialPayment);
  const financialCaseRows = new Map();
  const originalFinancialStorage = {
    list: storage.listFinancialCases, create: storage.createFinancialCase,
    get: storage.getFinancialCase, review: storage.reviewFinancialCase,
  };
  storage.listFinancialCases = async craftsmanId => [...financialCaseRows.values()].filter(item => !craftsmanId || item.craftsman_id === craftsmanId);
  storage.createFinancialCase = async input => {
    const item = { id: input.id, craftsman_id: input.craftsmanId, payment_intent_id: input.paymentIntentId,
      reason: input.reason, description: input.description, status: 'OPEN', approved_refund_minor: null,
      created_at: new Date().toISOString() };
    financialCaseRows.set(item.id, item);
    return item;
  };
  storage.getFinancialCase = async id => financialCaseRows.get(id) || null;
  storage.reviewFinancialCase = async (id, status, decisionReason, approvedRefundMinor, providerRefundReference) => {
    const item = financialCaseRows.get(id);
    if (!item) return null;
    Object.assign(item, { status, decision_reason: decisionReason, approved_refund_minor: approvedRefundMinor, provider_refund_reference: providerRefundReference });
    return item;
  };
  try {
    const missingPayment = await request('/financial/cases', { token: roles.CRAFTSMAN.token, method: 'POST',
      body: { paymentIntentId: 'another-users-payment', reason: 'NOT_ACTIVATED', description: 'The paid slot did not activate.' } });
    check('financial case cannot reference another payment', missingPayment.status === 404 && financialCaseRows.size === 0);
    const created = await request('/financial/cases', { token: roles.CRAFTSMAN.token, method: 'POST',
      body: { paymentIntentId: financialPaymentId, reason: 'EARLY_STOP', description: 'The service stopped before its paid end date.' } });
    check('craftsman case is stored and linked to own payment', created.status === 201 && financialCaseRows.has(created.body.id));
    const ownCases = await request('/financial/cases', { token: roles.CRAFTSMAN.token });
    check('craftsman sees own financial case', ownCases.status === 200 && ownCases.body[0]?.id === created.body.id);
    const adminCases = await request('/admin/financial/cases', { token: roles.ADMIN.token });
    check('admin receives bounded unused-time refund estimate', adminCases.status === 200 && adminCases.body[0]?.refund_estimate_minor > 0 && adminCases.body[0]?.refund_estimate_minor < financialPayment.amountMinor);
    const tooLarge = await request(`/admin/financial/cases/${created.body.id}`, { token: roles.ADMIN.token, method: 'PATCH',
      body: { status: 'APPROVED', decisionReason: 'Verified the early interruption.', approvedRefundMinor: 10001 } });
    check('admin cannot approve more than paid amount', tooLarge.status === 422);
    const approved = await request(`/admin/financial/cases/${created.body.id}`, { token: roles.ADMIN.token, method: 'PATCH',
      body: { status: 'APPROVED', decisionReason: 'Verified the early interruption.', approvedRefundMinor: 5000 } });
    check('admin records approval without sending a bank refund', approved.status === 200 && approved.body.status === 'APPROVED');
    const unverifiedClose = await request(`/admin/financial/cases/${created.body.id}`, { token: roles.ADMIN.token, method: 'PATCH',
      body: { status: 'CLOSED', decisionReason: 'Refund completed by provider.' } });
    check('positive refund case cannot close without provider reference', unverifiedClose.status === 422);
  } finally {
    storage.listFinancialCases = originalFinancialStorage.list;
    storage.createFinancialCase = originalFinancialStorage.create;
    storage.getFinancialCase = originalFinancialStorage.get;
    storage.reviewFinancialCase = originalFinancialStorage.review;
    db.paymentIntents.delete(financialPaymentId);
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

  // Provider configuration is an administrator preference, not a payment receipt.
  const verifyBogPath = '/admin/providers/payment/prov-bog/verify';
  const verifyAuditFetch = globalThis.fetch;
  let bankOAuthCalls = 0;
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith(`${baseUrl}/`)) return verifyAuditFetch(input, init);
      const oauth = new URL(url);
      assert.ok(['oauth2.bog.ge', 'oauth2-sandbox.bog.ge'].includes(oauth.hostname));
      assert.equal(oauth.pathname, '/auth/realms/bog/protocol/openid-connect/token');
      assert.equal(init.redirect, 'error');
      assert.equal(init.body, 'grant_type=client_credentials');
      bankOAuthCalls++;
      const credential = oauth.hostname === 'oauth2-sandbox.bog.ge' ? 'audit-sandbox:audit-sandbox-secret' : 'audit-merchant:audit-secret';
      const authorized = new Headers(init.headers).get('authorization') === `Basic ${Buffer.from(credential).toString('base64')}`;
      return new Response(JSON.stringify(authorized ? { access_token: 'not-returned-to-browser' } : { error: 'invalid_client' }), { status: authorized ? 200 : 401 });
    };
    const verify = (token, body) => request(verifyBogPath, { token, method: 'POST', body });
    const valid = { clientId: 'audit-merchant', secretKey: 'audit-secret' };
    const unauthorized = await verify(roles.ADMIN.token, valid);
    const missing = await verify(roles.SUPER_ADMIN.token, { clientId: 'audit-merchant' });
    check('BOG credential verification is superadmin-only and validates before contacting the bank', unauthorized.status === 403 && missing.status === 422 && bankOAuthCalls === 0);
    const beforePayments = db.paymentIntents.size;
    const beforeProvider = JSON.stringify(db.providerConfig.payment);
    const verified = await verify(roles.SUPER_ADMIN.token, valid);
    const rejected = await verify(roles.SUPER_ADMIN.token, { ...valid, secretKey: 'wrong-secret' });
    check('BOG OAuth verification reports success without revealing tokens or changing provider/payment data', verified.status === 200 && verified.body.verified === true && Object.keys(verified.body).length === 1 && db.paymentIntents.size === beforePayments && JSON.stringify(db.providerConfig.payment) === beforeProvider);
    check('BOG OAuth rejects an invalid credential pair', rejected.status === 422 && rejected.body.code === 'BOG_AUTH_REJECTED' && bankOAuthCalls === 2);
    const sandbox = await verify(roles.SUPER_ADMIN.token, { clientId: 'audit-sandbox', secretKey: 'audit-sandbox-secret', environment: 'sandbox' });
    const missingSandbox = await verify(roles.SUPER_ADMIN.token, { environment: 'sandbox' });
    check('BOG sandbox sends only explicit sandbox credentials to the sandbox endpoint', sandbox.status === 200 && missingSandbox.status === 422 && bankOAuthCalls === 3);
  } finally {
    globalThis.fetch = verifyAuditFetch;
  }
  // The isolated persistence stub avoids touching Supabase or a real bank.
  const originalPersistConfig = db.persistSuperAdminConfig;
  const bogProvider = db.providerConfig.payment.find(provider => provider.id === 'prov-bog');
  const originalBogProvider = { ...bogProvider };
  const tbcProvider = db.providerConfig.payment.find(provider => provider.id === 'prov-tbc');
  const originalTbcProvider = { ...tbcProvider };
  db.persistSuperAdminConfig = async () => ({ success: true, database: true, snapshot: false });
  process.env.NODE_ENV = 'production';
  try {
    const incomplete = await request('/admin/providers/payment/prov-bog', {
      method: 'PUT', token: roles.SUPER_ADMIN.token, body: { isActive: true },
    });
    check('superadmin cannot activate a bank with missing credentials',
      incomplete.status === 422 && bogProvider.isActive === false);
    const enabled = await request('/admin/providers/payment/prov-bog', {
      method: 'PUT', token: roles.SUPER_ADMIN.token,
      body: { clientId: 'audit-merchant', secretKey: 'audit-secret', isActive: true },
    });
    check('superadmin can turn on configured BOG in production without leaking its secret',
      enabled.status === 200 && bogProvider.isActive === true &&
      enabled.body.provider?.secretKey === undefined && enabled.body.provider?.secretKeyConfigured === true);
    const stillBlocked = await request('/craftsmen/me/listing/pay', {
      method: 'POST', token: roles.CRAFTSMAN.token, body: { providerId: 'prov-bog' },
    });
    check('admin toggle cannot turn a simulated payment into a real charge',
      stillBlocked.status === 503 && stillBlocked.body.code === 'PAYMENT_PROVIDER_NOT_READY');
    const disabled = await request('/admin/providers/payment/prov-bog', {
      method: 'PUT', token: roles.SUPER_ADMIN.token, body: { isActive: false },
    });
    check('superadmin can turn the bank off in production', disabled.status === 200 && bogProvider.isActive === false);
    const tbcIncomplete = await request('/admin/providers/payment/prov-tbc', {
      method: 'PUT', token: roles.SUPER_ADMIN.token,
      body: { clientId: 'audit-client', secretKey: 'audit-secret', isActive: true },
    });
    check('TBC activation requires its developer API key', tbcIncomplete.status === 422 && tbcProvider.isActive === false);
    const tbcEnabled = await request('/admin/providers/payment/prov-tbc', {
      method: 'PUT', token: roles.SUPER_ADMIN.token,
      body: { clientId: 'audit-client', secretKey: 'audit-secret', apiKey: 'audit-api-key', isActive: true },
    });
    check('TBC can be configured without exposing its API key',
      tbcEnabled.status === 200 && tbcProvider.isActive === true &&
      tbcEnabled.body.provider?.apiKey === undefined && tbcEnabled.body.provider?.apiKeyConfigured === true);
    const originalLock = { ...db.configLock };
    db.configLock.locked = true;
    db.configLock.lockedUntil = new Date(Date.now() + 86_400_000).toISOString();
    try {
      const emergencyOff = await request('/admin/providers/payment/prov-tbc', {
        method: 'PUT', token: roles.SUPER_ADMIN.token, body: { isActive: false },
      });
      const nonSuperAdmin = await request('/admin/providers/payment/prov-tbc', {
        method: 'PUT', token: roles.ADMIN.token, body: { isActive: true },
      });
      const lockedSms = await request('/admin/providers/sms/sms-magti', {
        method: 'PUT', token: roles.SUPER_ADMIN.token, body: { isActive: false },
      });
      check('superadmin can turn off a bank during the configuration lock',
        emergencyOff.status === 200 && tbcProvider.isActive === false);
      check('payment control remains superadmin-only while other provider settings stay locked',
        nonSuperAdmin.status === 403 && lockedSms.status === 423);
    } finally {
      Object.assign(db.configLock, originalLock);
    }
  } finally {
    Object.assign(bogProvider, originalBogProvider);
    Object.assign(tbcProvider, originalTbcProvider);
    db.persistSuperAdminConfig = originalPersistConfig;
    process.env.NODE_ENV = previousNodeEnv;
  }

  const previousSimulation = process.env.PAYMENTS_SIMULATION;
  process.env.PAYMENTS_SIMULATION = 'true';
  try {
    const auditedCraftsman = db.craftsmen.get(auditCraftsmanId);
    const acceptedTerms = { financialTermsVersion: auditedCraftsman.financialTermsVersion, financialTermsAcceptedAt: auditedCraftsman.financialTermsAcceptedAt };
    auditedCraftsman.financialTermsVersion = 'old-version';
    auditedCraftsman.financialTermsAcceptedAt = null;
    const beforeTermsGuard = db.paymentIntents.size;
    const missingTerms = await request('/craftsmen/me/listing/pay', {
      method: 'POST', token: roles.CRAFTSMAN.token, body: { providerId: 'prov-bog' },
    });
    check('paid listing rejects missing financial terms before creating a payment',
      missingTerms.status === 428 && missingTerms.body.code === 'FINANCIAL_TERMS_REQUIRED' && db.paymentIntents.size === beforeTermsGuard);
    Object.assign(auditedCraftsman, acceptedTerms);
  } finally {
    if (previousSimulation === undefined) delete process.env.PAYMENTS_SIMULATION;
    else process.env.PAYMENTS_SIMULATION = previousSimulation;
  }

  db.listingPrice.amountMinor = 0;
  const fetchBeforeRegistration = globalThis.fetch;
  globalThis.fetch = (input, init) => String(input).startsWith('https://drive.google.com/thumbnail?')
    ? Promise.resolve(new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }))
    : fetchBeforeRegistration(input, init);
  const freeRegistration = await request('/auth/craftsman/register', {
    method: 'POST',
    body: {
      phone: '+995555901236', password: 'Audit-passphrase-124', name: 'Audit Free Registration',
      cityId: 'city-tbilisi', professionId: 'prof-plumber', bankAccount: 'GE00TEST', paid: false,
      photos: [{ url: 'https://drive.google.com/file/d/1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU/view?usp=drivesdk' }],
    },
  });
  globalThis.fetch = fetchBeforeRegistration;
  check('zero-price craftsman registration succeeds without payment', freeRegistration.status === 201 && freeRegistration.body.isNewUser === true);
  check('registration stores one renderable Drive photo', freeRegistration.body.craftsman?.photos?.length === 1 &&
    freeRegistration.body.craftsman.photos[0].url === 'https://drive.google.com/thumbnail?id=1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU&sz=w1000');
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
  const pendingBankId = 'audit-bog-pending-before-deletion';
  db.paymentIntents.set(pendingBankId, {
    id: pendingBankId, reservationId: '', craftsmanId: auditCraftsmanId, providerId: 'prov-bog',
    amountMinor: 5000, currency: 'GEL', idempotencyKey: pendingBankId, status: 'PENDING', createdAt: new Date().toISOString(),
    providerCheckout: { kind: 'LISTING', environment: 'live' },
  });
  try {
    const pendingDeletion = await request(`/admin/craftsmen/${auditCraftsmanId}`, { method: 'DELETE', token: roles.SUPER_ADMIN.token });
    check('admin deletion preserves the profile while a bank order awaits reconciliation',
      pendingDeletion.status === 409 && pendingDeletion.body.code === 'BOG_ACCOUNT_PAYMENT_PENDING' &&
      db.craftsmen.has(auditCraftsmanId) && db.paymentIntents.get(pendingBankId)?.status === 'PENDING');
  } finally {
    db.paymentIntents.delete(pendingBankId);
  }
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

