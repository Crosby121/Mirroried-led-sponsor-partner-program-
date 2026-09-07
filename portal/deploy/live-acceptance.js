'use strict';

const base = String(process.env.PORTAL_URL || 'https://sponsors.mirroriedled.com').replace(/\/$/, '');
const adminEmail = process.env.ADMIN_EMAIL || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const requireTenant = process.env.REQUIRE_TENANT_TEST === 'true';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonFetch(path, options = {}) {
  const res = await fetch(base + path, options);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { res, body };
}

async function login(email, password) {
  const { res, body } = await jsonFetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password })
  });
  assert(res.status === 200, `Login failed for ${email}: HTTP ${res.status}`);
  const rawCookie = res.headers.get('set-cookie') || '';
  const cookie = rawCookie.split(';')[0];
  assert(cookie.startsWith('mirroried_session='), `Session cookie missing for ${email}`);
  return { cookie, user: body && body.user };
}

async function authed(path, cookie, options = {}) {
  return jsonFetch(path, {
    ...options,
    headers: { ...(options.headers || {}), cookie, origin: base }
  });
}

function assertScopedPayload(payload, sponsorId, label) {
  const walk = (value) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(value, 'sponsorId') && value.sponsorId != null) {
      assert(value.sponsorId === sponsorId, `${label} leaked record for sponsor ${value.sponsorId}; expected ${sponsorId}`);
    }
    Object.values(value).forEach(walk);
  };
  walk(payload);
}

async function sponsorScopeTest(prefix) {
  const email = process.env[`${prefix}_EMAIL`] || '';
  const password = process.env[`${prefix}_PASSWORD`] || '';
  if (!email || !password) return null;

  const session = await login(email, password);
  const me = await authed('/api/me', session.cookie);
  assert(me.res.status === 200, `${prefix} /api/me failed`);
  const sponsorId = me.body && me.body.user && me.body.user.sponsorId;
  assert(sponsorId, `${prefix} is not tied to a sponsor`);

  for (const path of ['/api/dashboard', '/api/campaigns', '/api/deliverables', '/api/approvals']) {
    const result = await authed(path, session.cookie);
    assert(result.res.status === 200, `${prefix} ${path} failed with HTTP ${result.res.status}`);
    assertScopedPayload(result.body, sponsorId, `${prefix} ${path}`);
  }

  const logout = await authed('/api/logout', session.cookie, { method: 'POST' });
  assert(logout.res.status === 200, `${prefix} logout failed`);
  return sponsorId;
}

(async () => {
  assert(base.startsWith('https://'), `Production portal URL must use HTTPS: ${base}`);
  assert(adminEmail && adminPassword, 'ADMIN_EMAIL and ADMIN_PASSWORD are required');

  console.log(`Checking ${base}`);
  const health = await jsonFetch('/api/health');
  assert(health.res.status === 200, `Health check returned HTTP ${health.res.status}`);
  assert(health.body && health.body.ok === true, 'Health payload did not report ok=true');
  assert(health.body.database === 'postgresql', `Unexpected database mode: ${health.body.database}`);
  console.log('PASS: HTTPS health + PostgreSQL');

  const admin = await login(adminEmail, adminPassword);
  assert(admin.user && admin.user.role === 'admin', `Expected admin role, got ${admin.user && admin.user.role}`);

  const me = await authed('/api/me', admin.cookie);
  assert(me.res.status === 200 && me.body && me.body.user && me.body.user.role === 'admin', 'Authenticated admin /api/me failed');

  const dashboard = await authed('/api/dashboard', admin.cookie);
  assert(dashboard.res.status === 200, `Admin dashboard failed with HTTP ${dashboard.res.status}`);

  const logout = await authed('/api/logout', admin.cookie, { method: 'POST' });
  assert(logout.res.status === 200, 'Admin logout failed');
  const afterLogout = await authed('/api/me', admin.cookie);
  assert(afterLogout.res.status === 401, `Session remained valid after logout: HTTP ${afterLogout.res.status}`);
  console.log('PASS: admin login/session/logout');

  const sponsorA = await sponsorScopeTest('SPONSOR_A');
  const sponsorB = await sponsorScopeTest('SPONSOR_B');

  if (sponsorA && sponsorB) {
    assert(sponsorA !== sponsorB, 'Sponsor A and Sponsor B test accounts resolve to the same sponsor ID');
    console.log(`PASS: tenant scoping for two distinct sponsors (${sponsorA}, ${sponsorB})`);
  } else if (requireTenant) {
    throw new Error('Tenant test is required but SPONSOR_A_* and SPONSOR_B_* credentials are incomplete');
  } else {
    console.log('SKIP: two-sponsor tenant test credentials are not configured');
  }

  console.log('LIVE ACCEPTANCE PASSED');
})().catch((error) => {
  console.error(`LIVE ACCEPTANCE FAILED: ${error.message}`);
  process.exit(1);
});
