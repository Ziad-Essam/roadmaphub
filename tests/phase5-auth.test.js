// Phase 5: accounts, logins (RS256), lockout, logout and account-state checks.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('./helpers/aws');
const { startStack } = require('./helpers/stack');
const { api, uniqueEmail } = require('./helpers/api');

let stack;
let call;
test.before(async () => {
  stack = await startStack({ base: 4200, env: { TURNSTILE_ENABLED: 'false', RATE_LIMITS: 'off' } });
  call = api(stack.url('admin'));
});
test.after(async () => stack && stack.stop());

const PASSWORD = 'Correct-horse-42';

test('register creates a "user" and returns a login token', async () => {
  const r = await call('POST', '/api/auth/register', { body: { name: 'Alice', email: uniqueEmail('alice'), password: PASSWORD } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'user');
  assert.equal(r.data.user.passwordHash, undefined);
  const claims = jwt.decode(r.data.token, { complete: true });
  assert.equal(claims.header.alg, 'RS256');
});

test('mass assignment: registering with role=admin -> 400', async () => {
  const r = await call('POST', '/api/auth/register', { body: { name: 'Mallory', email: uniqueEmail('m'), password: PASSWORD, role: 'admin' } });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'VALIDATION_ERROR');
});

test('weak password and duplicate e-mail are refused', async () => {
  const weak = await call('POST', '/api/auth/register', { body: { name: 'Bob', email: uniqueEmail('b'), password: 'short1' } });
  assert.equal(weak.status, 400);
  const email = uniqueEmail('dup');
  assert.equal((await call('POST', '/api/auth/register', { body: { name: 'Dup', email, password: PASSWORD } })).status, 201);
  const again = await call('POST', '/api/auth/register', { body: { name: 'Dup', email, password: PASSWORD } });
  assert.equal(again.status, 409);
  assert.equal(again.data.error.code, 'EMAIL_TAKEN');
});

test('two sign-ups with the same e-mail at the same moment: only one wins', async () => {
  const email = uniqueEmail('race');
  const results = await Promise.all([1, 2, 3].map(() => call('POST', '/api/auth/register', { body: { name: 'Race', email, password: PASSWORD } })));
  assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => r.status).join(','));
});

test('login: same message for unknown e-mail and wrong password; 5 failures lock the account', async () => {
  const email = uniqueEmail('lock');
  await call('POST', '/api/auth/register', { body: { name: 'Lock', email, password: PASSWORD } });
  const unknown = await call('POST', '/api/auth/login', { body: { email: uniqueEmail('nobody'), password: PASSWORD } });
  const wrong = await call('POST', '/api/auth/login', { body: { email, password: 'Wrong-pass-123' } });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.data.error.message, wrong.data.error.message);
  for (let i = 0; i < 4; i += 1) await call('POST', '/api/auth/login', { body: { email, password: 'Wrong-pass-123' } });
  const locked = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  assert.equal(locked.status, 423);
});

test('me works with the token; a token signed with another key -> 401', async () => {
  const email = uniqueEmail('me');
  const reg = await call('POST', '/api/auth/register', { body: { name: 'Me', email, password: PASSWORD } });
  const me = await call('GET', '/api/auth/me', { token: reg.data.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, email);
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const forged = jwt.sign({ typ: 'user', role: 'admin', tv: 0 }, privateKey, {
    algorithm: 'RS256', subject: reg.data.user.userId, issuer: 'roadhub-admin', audience: 'roadhub-api', expiresIn: 600
  });
  assert.equal((await call('GET', '/api/auth/me', { token: forged })).status, 401);
  const none = jwt.sign({ typ: 'user', role: 'admin', tv: 0, sub: reg.data.user.userId }, '', { algorithm: 'none' });
  assert.equal((await call('GET', '/api/auth/me', { token: none })).status, 401);
});

test('logout ends every session (old token -> 401)', async () => {
  const reg = await call('POST', '/api/auth/register', { body: { name: 'Out', email: uniqueEmail('out'), password: PASSWORD } });
  assert.equal((await call('POST', '/api/auth/logout', { token: reg.data.token })).status, 204);
  const after = await call('GET', '/api/auth/me', { token: reg.data.token });
  assert.equal(after.status, 401);
});

test('internal status endpoint: refuses users, answers services', async () => {
  const reg = await call('POST', '/api/auth/register', { body: { name: 'Stat', email: uniqueEmail('stat'), password: PASSWORD } });
  const asUser = await call('GET', `/internal/identity/users/${reg.data.user.userId}/status`, { token: reg.data.token });
  assert.equal(asUser.status, 401);
  // Through the engagement service's client, as the real services do:
  process.env.ADMIN_URL = stack.url('admin');
  const { internalClient } = require('@roadhub/shared');
  const client = internalClient.createInternalClient('engagement', { admin: stack.url('admin') });
  const out = await client.call('admin', { path: `/internal/identity/users/${reg.data.user.userId}/status`, scope: 'identity:read' });
  assert.equal(out.status, 200);
  assert.deepEqual(Object.keys(out.data).sort(), ['accountStatus', 'role', 'tokenVersion', 'userId']);
});
