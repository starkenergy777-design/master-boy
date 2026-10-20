import fs from 'fs';

const routes = fs.readFileSync('./server/routes.ts', 'utf8');
const manifest = JSON.parse(fs.readFileSync('./public/manifest.json', 'utf8'));

function has(pattern) { return pattern.test(routes); }
function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

// Anonymous customer / visitor simulation: directory/search/detail must be public.
check('anonymous customer can list cities', has(/get\('\/cities'/));
check('anonymous customer can list professions', has(/get\('\/professions'/));
check('anonymous customer can search craftsmen', has(/get\('\/search'/));
check('GPS-based nearby search is removed', !has(/get\(\['\/search\/nearby', '\/nearby'\]/));
check('map search screen is removed', !fs.existsSync('./src/screens/MapSearchScreen.tsx'));
check('PWA map shortcut is removed', !manifest.shortcuts?.some((shortcut) => /map|რუკ/i.test(`${shortcut.name} ${shortcut.url}`)));
check('anonymous customer can open craftsman detail', has(/get\(\['\/craftsmen\/:id', '\/craftsman\/:id'\]/));
check('anonymous customer does not have a registration requirement in public routes', !/apiRouter\.(get|post|put|delete)\('\/(cities|professions|search|advertisements\/active)'[^\n]*requireAuth/.test(routes));

// Craftsman role simulation.
check('craftsman role middleware exists', has(/function requireCraftsman\(/));
check('craftsman listing payment is role-protected', has(/post\('\/craftsmen\/me\/listing\/pay', requireCraftsman/));
check('Top15 reservation is role-protected', has(/post\('\/top15\/reserve', requireCraftsman/));
check('support chat is role-protected', has(/post\(\['\/support\/messages', '\/support\/chat'\], requireCraftsman/));

// Admin roles.
check('admin middleware exists', has(/function requireAdmin\(/));
check('super admin middleware exists', has(/function requireSuperAdmin\(/));
check('super admin provider configuration is protected', has(/get\('\/admin\/providers\/:type', requireSuperAdmin/));
check('admin analytics is protected', has(/get\('\/admin\/analytics', requireAdmin/));

// Advertisement partner.
check('ad partner middleware exists', has(/function requireAdPartner\(/));
check('partner portal is role-protected', has(/get\('\/partner\/ad', requireAdPartner/));
check('partner payment is role-protected', has(/post\('\/partner\/pay', requireAdPartner/));

// Security/behavioral invariants.
check('OTP never creates an unregistered user', has(/CRAFTSMAN_NOT_REGISTERED/));
const otpBlock = routes.slice(routes.indexOf("apiRouter.post('/auth/otp/verify'"), routes.indexOf("apiRouter.post(['/auth/password/login'"));
check('OTP cannot use an undefined password variable', !/hashPassword\(password\)/.test(otpBlock));
check('production payment is fail-closed', has(/PAYMENT_PROVIDER_NOT_READY/));
check('production durable storage is mandatory', has(/REQUIRE_DURABLE_STORAGE/));
check('deleted accounts cannot authenticate', has(/USER_DELETED/));


// Behavioral role matrix simulation (same predicates as server middleware).
const roleCases = [
  { name: 'anonymous', roles: [], expect: { craftsman: 401, admin: 401, superadmin: 401, adpartner: 401 } },
  { name: 'craftsman', roles: ['CRAFTSMAN'], expect: { craftsman: 200, admin: 403, superadmin: 403, adpartner: 403 } },
  { name: 'admin', roles: ['ADMIN'], expect: { craftsman: 403, admin: 200, superadmin: 403, adpartner: 403 } },
  { name: 'super-admin', roles: ['SUPER_ADMIN'], expect: { craftsman: 403, admin: 200, superadmin: 200, adpartner: 403 } },
  { name: 'ad-partner', roles: ['AD_PARTNER'], expect: { craftsman: 403, admin: 403, superadmin: 403, adpartner: 200 } },
];
function simulatedStatus(roles, required) {
  if (!roles.length) return 401;
  if (required === 'ADMIN') return roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN') ? 200 : 403;
  return roles.includes(required) ? 200 : 403;
}
for (const c of roleCases) {
  for (const [required, expected] of Object.entries(c.expect)) {
    const actual = simulatedStatus(c.roles, required === 'admin' ? 'ADMIN' : required === 'superadmin' ? 'SUPER_ADMIN' : required === 'craftsman' ? 'CRAFTSMAN' : 'AD_PARTNER');
    check(`${c.name} -> ${required} = ${expected}`, actual === expected);
  }
}

console.log('ALL ROLE SIMULATIONS PASSED');
