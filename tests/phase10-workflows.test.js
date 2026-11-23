// Phases 7-10: the business functions of the three services and the workflows that cross them,
// all called through the public gateway like the browser does.
const test = require('node:test');
const assert = require('node:assert');
require('./helpers/aws');
const { startStack } = require('./helpers/stack');
const { api } = require('./helpers/api');
const { newUser, newAdmin } = require('./helpers/users');

let stack;
let call;
const u = {};
const f = {};

test.before(async () => {
  stack = await startStack({ base: 4300, gateway: true, env: { TURNSTILE_ENABLED: 'false', RATE_LIMITS: 'off', USER_STATUS_CACHE_MS: '0', EVENTS: 'off' } });
  call = api(stack.gatewayUrl);
  for (const name of ['Alice', 'Bob', 'Carol', 'Dave', 'Erin']) u[name] = await newUser(call, name);
  u.admin = await newAdmin(call);
});
test.after(async () => stack && stack.stop());

const submit = (who, title, description = 'A detailed description of the request.') =>
  call('POST', '/api/features', { token: who.token, body: { title, description, categoryId: 'ui-ux' } });

test('visitors can read the board (4 columns only) and categories', async () => {
  const cats = await call('GET', '/api/categories');
  assert.equal(cats.status, 200);
  assert.ok(cats.data.categories.length >= 7);
  const board = await call('GET', '/api/roadmap');
  assert.deepEqual(Object.keys(board.data.columns), ['under_review', 'planned', 'in_progress', 'shipped']);
});

test('S1: submit rules (login, role, mass assignment)', async () => {
  assert.equal((await call('POST', '/api/features', { body: { title: 'No login request', description: 'should fail here', categoryId: 'ui-ux' } })).status, 401);
  assert.equal((await submit(u.admin, 'Admin cannot submit')).status, 403);
  const mass = await call('POST', '/api/features', { token: u.Alice.token, body: { title: 'Skip review please', description: 'trying to set status', categoryId: 'ui-ux', status: 'shipped' } });
  assert.equal(mass.status, 400);
  const a = await submit(u.Alice, 'Dark mode for the dashboard');
  assert.equal(a.status, 201);
  assert.equal(a.data.feature.status, 'under_review');
  f.A = a.data.feature.featureId;
  f.B = (await submit(u.Alice, 'Dashboard dark mode')).data.feature.featureId;
  f.C = (await submit(u.Carol, 'Export reports to PDF files')).data.feature.featureId;
});

test('S1: only the owner edits, only while Under Review', async () => {
  const bob = await call('PATCH', `/api/features/${f.A}`, { token: u.Bob.token, body: { title: 'Bob changes it' } });
  assert.equal(bob.status, 403);
  assert.equal(bob.data.error.code, 'NOT_OWNER');
  const alice = await call('PATCH', `/api/features/${f.A}`, { token: u.Alice.token, body: { description: 'Please add a dark theme to every dashboard page.' } });
  assert.equal(alice.status, 200);
});

test('S2: one vote per person; admins cannot vote; unknown request -> 404', async () => {
  const first = await call('POST', `/api/features/${f.A}/votes`, { token: u.Bob.token });
  assert.equal(first.status, 201);
  assert.equal(first.data.voteCount, 1);
  const again = await call('POST', `/api/features/${f.A}/votes`, { token: u.Bob.token });
  assert.equal(again.status, 409);
  assert.equal(again.data.error.code, 'ALREADY_VOTED');
  assert.equal((await call('POST', `/api/features/${f.A}/votes`, { token: u.admin.token })).status, 403);
  assert.equal((await call('POST', '/api/features/00000000-0000-4000-8000-000000000000/votes', { token: u.Bob.token })).status, 404);
  // Five clicks at the same moment by one person: exactly one vote is stored.
  const burst = await Promise.all([1, 2, 3, 4, 5].map(() => call('POST', `/api/features/${f.A}/votes`, { token: u.Carol.token })));
  assert.equal(burst.filter((r) => r.status === 201).length, 1, burst.map((r) => r.status).join(','));
  assert.equal((await call('POST', `/api/features/${f.B}/votes`, { token: u.Bob.token })).status, 201);
  assert.equal((await call('POST', `/api/features/${f.B}/votes`, { token: u.Dave.token })).status, 201);
  const summary = await call('GET', `/api/features/${f.A}/votes`, { token: u.Bob.token });
  assert.deepEqual([summary.data.voteCount, summary.data.hasVoted], [2, true]);
});

test('S2: comments (owner edit only, admin reply marked, admin may delete)', async () => {
  const bobC = await call('POST', `/api/features/${f.A}/comments`, { token: u.Bob.token, body: { body: 'Yes please, my eyes hurt at night' } });
  assert.equal(bobC.status, 201);
  const id = bobC.data.comment.commentId;
  assert.equal((await call('PATCH', `/api/comments/${id}`, { token: u.Alice.token, body: { body: 'Alice edits Bob' } })).status, 403);
  assert.equal((await call('PATCH', `/api/comments/${id}`, { token: u.Bob.token, body: { body: 'Yes please (edited)' } })).status, 200);
  assert.equal((await call('POST', `/api/features/${f.A}/comments`, { token: u.Bob.token, body: { body: 'x', userId: u.Alice.id } })).status, 400);
  const team = await call('POST', `/api/features/${f.A}/comments`, { token: u.admin.token, body: { body: 'Thanks, we are looking at it' } });
  assert.equal(team.data.comment.isTeamReply, true);
  assert.equal((await call('POST', `/api/features/${f.B}/comments`, { token: u.Dave.token, body: { body: 'Same idea here' } })).status, 201);
  const spam = await call('POST', `/api/features/${f.A}/comments`, { token: u.Carol.token, body: { body: 'to be removed' } });
  assert.equal((await call('DELETE', `/api/comments/${spam.data.comment.commentId}`, { token: u.admin.token })).status, 204);
});

test('S2: My votes lists only my own requests', async () => {
  const mine = await call('GET', '/api/me/votes', { token: u.Bob.token });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.data.votes.map((v) => v.featureId).sort(), [f.A, f.B].sort());
  assert.equal((await call('GET', '/api/me/votes')).status, 401);
});

test('S1: status workflow is admin-only and follows the allowed moves', async () => {
  assert.equal((await call('PATCH', `/api/features/${f.C}/status`, { token: u.Alice.token, body: { status: 'planned' } })).status, 403);
  const jump = await call('PATCH', `/api/features/${f.C}/status`, { token: u.admin.token, body: { status: 'shipped' } });
  assert.equal(jump.status, 409);
  assert.equal(jump.data.error.code, 'INVALID_TRANSITION');
  const ok = await call('PATCH', `/api/features/${f.C}/status`, { token: u.admin.token, body: { status: 'planned' } });
  assert.equal(ok.status, 200);
  assert.equal((await call('DELETE', `/api/features/${f.C}`, { token: u.Carol.token })).status, 409);
});

test('S3: suspended users can read but not write; restore works', async () => {
  const s = await call('PATCH', `/api/admin/users/${u.Erin.id}/status`, { token: u.admin.token, body: { action: 'suspend', days: 1, reason: 'Spam test' } });
  assert.equal(s.status, 200);
  const vote = await call('POST', `/api/features/${f.C}/votes`, { token: u.Erin.token });
  assert.equal(vote.status, 403);
  assert.equal(vote.data.error.code, 'ACCOUNT_SUSPENDED');
  assert.equal((await call('GET', '/api/me/votes', { token: u.Erin.token })).status, 200);
  assert.equal((await call('PATCH', `/api/admin/users/${u.admin.id}/status`, { token: u.admin.token, body: { action: 'ban', reason: 'myself' } })).status, 403);
  assert.equal((await call('PATCH', `/api/admin/users/${u.Erin.id}/status`, { token: u.admin.token, body: { action: 'restore' } })).status, 200);
  assert.equal((await call('GET', '/api/admin/users', { token: u.Bob.token })).status, 403);
});

test('S3: duplicate suggestions find the similar request', async () => {
  const s = await call('GET', `/api/admin/features/${f.B}/duplicate-suggestions`, { token: u.admin.token });
  assert.equal(s.status, 200);
  const match = s.data.suggestions.find((x) => x.featureId === f.A);
  assert.ok(match && match.score >= 0.5, JSON.stringify(s.data));
});

test('S3 merge across all services: redirect, distinct voters, merged discussion, one effective vote', async () => {
  const m = await call('POST', `/api/admin/features/${f.B}/merge`, { token: u.admin.token, body: { targetId: f.A } });
  assert.equal(m.status, 201, JSON.stringify(m.data));
  f.merge = m.data.merge.mergeId;
  assert.equal(m.data.merge.state, 'COMMITTED');
  // A: Bob, Carol. B: Bob, Dave. Distinct voters after merge: Bob, Carol, Dave = 3 (Bob once).
  assert.equal(m.data.merge.stats.votesAfterMerge, 3);
  const res = await fetch(`${stack.gatewayUrl}/api/features/${f.B}`);
  assert.ok(res.redirected, 'the duplicate URL redirects to the main request');
  assert.equal((await res.json()).feature.featureId, f.A);
  const board = await call('GET', '/api/roadmap?sort=newest');
  assert.ok(!board.data.columns.under_review.items.some((x) => x.featureId === f.B), 'B left the board');
  assert.equal((await call('GET', `/api/features/${f.A}/votes`)).data.voteCount, 3);
  const comments = await call('GET', `/api/features/${f.A}/comments`);
  assert.ok(comments.data.comments.some((c) => c.fromMergedRequest && c.body === 'Same idea here'));
  assert.equal((await call('POST', `/api/features/${f.B}/votes`, { token: u.Dave.token })).status, 409, 'Dave already counts via B');
  const erin = await call('POST', `/api/features/${f.B}/votes`, { token: u.Erin.token });
  assert.equal(erin.status, 201);
  assert.equal(erin.data.featureId, f.A, 'a vote on the duplicate URL counts for the main request');
  assert.equal(erin.data.voteCount, 4);
  assert.equal((await call('POST', `/api/admin/features/${f.B}/merge`, { token: u.admin.token, body: { targetId: f.C } })).status, 409);
  assert.equal((await call('POST', `/api/admin/features/${f.A}/merge`, { token: u.admin.token, body: { targetId: f.C } })).status, 409, 'a request with merged duplicates cannot itself be merged');
});

test('S3 undo: everything returns to its original request, nothing lost or doubled', async () => {
  const undo = await call('POST', `/api/admin/merges/${f.merge}/undo`, { token: u.admin.token });
  assert.equal(undo.status, 200, JSON.stringify(undo.data));
  assert.equal(undo.data.merge.state, 'UNDONE');
  const b = await call('GET', `/api/features/${f.B}`);
  assert.equal(b.status, 200);
  assert.equal(b.data.feature.status, 'under_review');
  assert.equal((await call('GET', `/api/features/${f.A}/votes`)).data.voteCount, 3, 'A: Bob, Carol, Erin');
  assert.equal((await call('GET', `/api/features/${f.B}/votes`)).data.voteCount, 2, 'B: Bob, Dave');
  const bComments = await call('GET', `/api/features/${f.B}/comments`);
  assert.deepEqual(bComments.data.comments.map((c) => c.body), ['Same idea here']);
  const again = await call('POST', `/api/admin/merges/${f.merge}/undo`, { token: u.admin.token });
  assert.equal(again.data.error.code, 'ALREADY_UNDONE');
});

test('ban ends every session at once', async () => {
  const ban = await call('PATCH', `/api/admin/users/${u.Dave.id}/status`, { token: u.admin.token, body: { action: 'ban', reason: 'Abuse test' } });
  assert.equal(ban.status, 200);
  const r = await call('POST', `/api/features/${f.C}/votes`, { token: u.Dave.token });
  assert.ok([401, 403].includes(r.status), `got ${r.status}`);
  const login = await call('POST', '/api/auth/login', { body: { email: u.Dave.email, password: 'Correct-horse-42' } });
  assert.equal(login.status, 403);
});

test('a merge that fails half-way is rolled back (engagement service down)', async () => {
  stack.kill(`engagement@${stack.ports.engagement[0]}`);
  const m = await call('POST', `/api/admin/features/${f.B}/merge`, { token: u.admin.token, body: { targetId: f.A } });
  assert.equal(m.status, 503, JSON.stringify(m.data));
  const b = await call('GET', `/api/features/${f.B}`);
  assert.equal(b.status, 200, 'B is still its own request');
  const merges = await call('GET', '/api/admin/merges', { token: u.admin.token });
  assert.equal(merges.data.items[0].state, 'FAILED');
  // The lock was released: B can still be edited by its owner.
  assert.equal((await call('PATCH', `/api/features/${f.B}`, { token: u.Alice.token, body: { title: 'Dashboard dark mode please' } })).status, 200);
});
