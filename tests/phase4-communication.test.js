// Phase 4: three independent backends + gateway, and real HTTP calls between them.
const test = require('node:test');
const assert = require('node:assert');
const { randomBytes } = require('crypto');
const jwt = require('jsonwebtoken');
const { ensureSecret } = require('./helpers/aws');
const { startStack, sleep } = require('./helpers/stack');

const INTERNAL_KEY = randomBytes(48).toString('hex');
let stack;

test.before(async () => {
  await ensureSecret('roadhub/internal', { INTERNAL_SIGNING_KEY: INTERNAL_KEY });
  stack = await startStack({ base: 4100, replicas: { roadmap: 2 }, gateway: true });
});
test.after(async () => stack && stack.stop());

test('each service runs as its own process and answers /health', async () => {
  for (const svc of ['roadmap', 'engagement', 'admin']) {
    const res = await fetch(`${stack.url(svc)}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.service, svc);
  }
});

test('internal route without a service token -> 401', async () => {
  const res = await fetch(`${stack.url('roadmap')}/internal/features/_ping`);
  assert.equal(res.status, 401);
});

test('internal route with a forged token (wrong key) -> 401', async () => {
  const forged = jwt.sign({ typ: 'service', scope: ['features:read'] }, 'not-the-real-key-not-the-real-key!!', {
    algorithm: 'HS256', issuer: 'engagement', audience: 'roadmap', expiresIn: 60
  });
  const res = await fetch(`${stack.url('roadmap')}/internal/features/_ping`, { headers: { 'X-Service-Token': forged } });
  assert.equal(res.status, 401);
});

test('internal route with the wrong scope -> 403', async () => {
  const token = jwt.sign({ typ: 'service', scope: ['identity:read'] }, INTERNAL_KEY, {
    algorithm: 'HS256', issuer: 'engagement', audience: 'roadmap', expiresIn: 60
  });
  const res = await fetch(`${stack.url('roadmap')}/internal/features/_ping`, { headers: { 'X-Service-Token': token } });
  assert.equal(res.status, 403);
});

test('engagement reaches roadmap and admin over HTTP (through the internal gateway)', async () => {
  const res = await fetch(`${stack.url('engagement')}/api/engagement/dependencies`, { headers: { 'X-Request-Id': 'trace-test-0001' } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.deepEqual(body.dependencies, { roadmap: 'up', admin: 'up' });
  await sleep(200);
  // The same request id appears in the roadmap and admin logs: one action traced across services.
  const roadmapLogs = Object.entries(stack.logs).filter(([k]) => k.startsWith('roadmap')).flatMap(([, l]) => l);
  const adminLogs = Object.entries(stack.logs).filter(([k]) => k.startsWith('admin')).flatMap(([, l]) => l);
  assert.ok(roadmapLogs.some((l) => l.includes('trace-test-0001') && l.includes('"caller":"engagement"')));
  assert.ok(adminLogs.some((l) => l.includes('trace-test-0001') && l.includes('"caller":"engagement"')));
});

test('public gateway routes by path and never forwards /internal', async () => {
  const dep = await fetch(`${stack.gatewayUrl}/api/engagement/dependencies`);
  assert.equal(dep.status, 200);
  assert.match(dep.headers.get('x-served-by'), /^engagement@/);
  const blocked = await fetch(`${stack.gatewayUrl}/internal/features/_ping`);
  assert.equal(blocked.status, 404);
  const health = await (await fetch(`${stack.gatewayUrl}/api/health`)).json();
  assert.deepEqual(health.services.roadmap, { healthy: 2, total: 2 });
});

test('round-robin over 2 roadmap replicas, and failover when one is killed', async () => {
  const served = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await fetch(`${stack.gatewayUrl}/api/categories`);
    served.push(res.headers.get('x-served-by'));
  }
  assert.equal(new Set(served).size, 2, `expected both replicas, got ${served}`);

  stack.kill(`roadmap@${stack.ports.roadmap[0]}`);
  const after = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await fetch(`${stack.gatewayUrl}/api/categories`);
    after.push(`${res.status} ${res.headers.get('x-served-by')}`);
  }
  // No request is lost: every request is answered by the surviving replica.
  assert.ok(after.every((s) => s.endsWith(`roadmap@${stack.ports.roadmap[1]}`)), after.join(', '));
});
