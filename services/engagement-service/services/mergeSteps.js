// The Engagement Service's part of a merge (called by the Administration Service over HTTP).
// Logical merge: only a link "duplicate -> main request" is written. Votes and comments stay
// where they were cast, so nothing is copied, lost or duplicated, and undo is exact.
const { http } = require('@roadhub/shared');
const repos = require('../repositories');
const countsService = require('./countsService');

const { errors } = http;

async function prepare({ sourceId, targetId }) {
  const [sourceVoters, targetGroup] = await Promise.all([repos.votes.votersOf(sourceId), repos.groups.members(targetId)]);
  const targetVoters = new Set((await Promise.all(targetGroup.map((id) => repos.votes.votersOf(id)))).flat());
  const shared = sourceVoters.filter((u) => targetVoters.has(u)).length;
  const sourceComments = (await repos.comments.listByFeature(sourceId)).length;
  return {
    sourceVoters: sourceVoters.length, targetVoters: targetVoters.size, sharedVoters: shared,
    votesAfterMerge: targetVoters.size + sourceVoters.length - shared, sourceComments
  };
}

async function complete({ mergeId, sourceId, targetId }, requestId) {
  if (!(await repos.groups.addLink({ mergeId, sourceId, targetId }))) {
    throw errors.conflict('ALREADY_LINKED', 'This request is already merged by another merge.');
  }
  const counts = await countsService.recount(targetId, requestId);
  return { voteCount: counts.voteCount, commentCount: counts.commentCount };
}

async function abort({ mergeId, sourceId, targetId }, requestId) {
  if (await repos.groups.removeLink({ mergeId, sourceId })) await countsService.recount(targetId, requestId);
  return { aborted: true };
}

async function undo({ mergeId, sourceId, targetId }, requestId) {
  await repos.groups.removeLink({ mergeId, sourceId }); // already removed -> fine (idempotent)
  const [target, source] = await Promise.all([countsService.recount(targetId, requestId), countsService.recount(sourceId, requestId)]);
  return { target: { voteCount: target.voteCount, commentCount: target.commentCount }, source: { voteCount: source.voteCount, commentCount: source.commentCount } };
}

module.exports = { prepare, complete, abort, undo };
