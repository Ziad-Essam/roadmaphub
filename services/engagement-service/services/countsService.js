// Keeps the vote/comment numbers of a main request and tells the Roadmap Service about them
// (event EngagementCountsChanged -> EventBridge -> SQS -> roadmap counts worker).
const { events } = require('@roadhub/shared');
const repos = require('../repositories');

async function announce(featureId, requestId) {
  const counts = await repos.groups.getCounts(featureId);
  await events.publish('engagement', 'EngagementCountsChanged', {
    featureId, voteCount: counts.voteCount || 0, commentCount: counts.commentCount || 0, version: counts.version || 0
  }, { requestId });
  return counts;
}

// Recounts a main request from the rows themselves (used after merge and undo):
// distinct voters over the whole group, so somebody who voted on both requests counts ONCE.
async function recount(canonicalId, requestId) {
  const memberIds = await repos.groups.members(canonicalId);
  const voterLists = await Promise.all(memberIds.map((id) => repos.votes.votersOf(id)));
  const commentLists = await Promise.all(memberIds.map((id) => repos.comments.listByFeature(id)));
  const voters = new Set(voterLists.flat());
  const commentCount = commentLists.reduce((n, list) => n + list.length, 0);
  await repos.groups.setCounts(canonicalId, { voteCount: voters.size, commentCount });
  return announce(canonicalId, requestId);
}

module.exports = { announce, recount };
