// Function 1: vote / remove vote. Rule: ONE effective vote per user per main (canonical) request,
// even when duplicates have been merged into it.
const { http, events } = require('@roadhub/shared');
const repos = require('../repositories');
const roadmap = require('../clients/roadmap');
const countsService = require('./countsService');

const { errors } = http;

async function add(user, featureId, requestId) {
  const feature = await roadmap.resolve(featureId, requestId);     // 404 if it does not exist (Roadmap Service)
  const canonicalId = feature.canonicalId;
  const group = await repos.groups.members(canonicalId);           // main request + merged duplicates
  if ((await repos.votes.findUserVotes(group, user.id)).length) {
    throw errors.conflict('ALREADY_VOTED', 'You have already voted for this request.');
  }
  if (!(await repos.votes.addVote(canonicalId, user.id))) {
    throw errors.conflict('ALREADY_VOTED', 'You have already voted for this request.'); // two clicks at once: one wins
  }
  await events.publish('engagement', 'VoteAdded', { featureId: canonicalId, userId: user.id }, { requestId });
  const counts = await countsService.announce(canonicalId, requestId);
  return { featureId: canonicalId, requestedId: featureId, voteCount: counts.voteCount, hasVoted: true };
}

async function remove(user, featureId, requestId) {
  const feature = await roadmap.resolve(featureId, requestId);
  const canonicalId = feature.canonicalId;
  const group = await repos.groups.members(canonicalId);
  const rows = await repos.votes.findUserVotes(group, user.id);    // the key holds MY id: nobody can remove another's vote
  if (!rows.length) throw errors.notFound('VOTE_NOT_FOUND', 'You have not voted for this request.');
  await repos.votes.removeVotes(canonicalId, rows);
  await events.publish('engagement', 'VoteRemoved', { featureId: canonicalId, userId: user.id }, { requestId });
  const counts = await countsService.announce(canonicalId, requestId);
  return { featureId: canonicalId, voteCount: counts.voteCount, hasVoted: false };
}

async function summary(featureId, user, requestId) {
  const feature = await roadmap.resolve(featureId, requestId);
  const counts = await repos.groups.getCounts(feature.canonicalId);
  let hasVoted = false;
  if (user) {
    const group = await repos.groups.members(feature.canonicalId);
    hasVoted = (await repos.votes.findUserVotes(group, user.id)).length > 0;
  }
  return { featureId: feature.canonicalId, voteCount: counts.voteCount || 0, commentCount: counts.commentCount || 0, hasVoted };
}

// Function 3: "My votes" - the requests I support and where they are now.
async function myVotes(user, requestId) {
  const rows = await repos.votes.listByUser(user.id, { limit: 100 });
  const summaries = await roadmap.resolveBatch(rows.map((r) => r.featureId), requestId);
  const byId = new Map(summaries.map((s) => [s.featureId, s]));
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const s = byId.get(row.featureId);
    if (!s || seen.has(s.canonicalId)) continue; // deleted request, or a duplicate already listed
    seen.add(s.canonicalId);
    const counts = await repos.groups.getCounts(s.canonicalId);
    items.push({
      featureId: s.canonicalId, title: s.title, status: s.status, categoryName: s.categoryName,
      voteCount: counts.voteCount || 0, votedAt: row.createdAt, viaMergedRequest: s.merged,
      statusChangedSinceVote: Boolean(s.statusChangedAt && s.statusChangedAt > row.createdAt)
    });
  }
  return items;
}

module.exports = { add, remove, summary, myVotes };
