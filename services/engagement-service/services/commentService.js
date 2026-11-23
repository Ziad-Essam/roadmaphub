// Function 2: comments. Comments are stored on the request they were written on; the comment list
// of a main request also shows the comments of the duplicates merged into it.
const { http, events } = require('@roadhub/shared');
const repos = require('../repositories');
const roadmap = require('../clients/roadmap');
const countsService = require('./countsService');

const { errors } = http;

function publicComment(c, canonicalId) {
  return {
    commentId: c.commentId, featureId: c.featureId, userId: c.userId, authorName: c.authorName, body: c.body,
    isTeamReply: Boolean(c.isTeamReply), edited: Boolean(c.edited), createdAt: c.createdAt, updatedAt: c.updatedAt,
    fromMergedRequest: c.featureId !== canonicalId
  };
}

async function list(featureId, requestId) {
  const feature = await roadmap.resolve(featureId, requestId);
  const group = await repos.groups.members(feature.canonicalId);
  const lists = await Promise.all(group.map((id) => repos.comments.listByFeature(id)));
  const all = lists.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { featureId: feature.canonicalId, count: all.length, comments: all.map((c) => publicComment(c, feature.canonicalId)) };
}

async function add(user, featureId, body, requestId) {
  const feature = await roadmap.resolve(featureId, requestId);
  const comment = await repos.comments.add({
    featureId: feature.canonicalId, canonicalId: feature.canonicalId, userId: user.id, authorName: user.name, body,
    isTeamReply: user.role === 'admin' // an admin's comment is shown as "Product team"
  });
  await events.publish('engagement', 'CommentAdded', { featureId: feature.canonicalId, commentId: comment.commentId, userId: user.id }, { requestId });
  await countsService.announce(feature.canonicalId, requestId);
  return publicComment(comment, feature.canonicalId);
}

async function edit(user, commentId, body) {
  const updated = await repos.comments.editOwn(commentId, user.id, body);
  if (!updated) {
    const existing = await repos.comments.get(commentId);
    if (!existing) throw errors.notFound('COMMENT_NOT_FOUND', 'This comment does not exist.');
    throw errors.forbidden('NOT_OWNER', 'You can only edit your own comments.'); // IDOR blocked
  }
  return publicComment(updated, await repos.groups.canonicalOf(updated.featureId));
}

async function remove(user, commentId, requestId) {
  const comment = await repos.comments.get(commentId);
  if (!comment) throw errors.notFound('COMMENT_NOT_FOUND', 'This comment does not exist.');
  const isOwner = comment.userId === user.id;
  if (!isOwner && user.role !== 'admin') throw errors.forbidden('NOT_OWNER', 'You can only delete your own comments.');
  const canonicalId = await repos.groups.canonicalOf(comment.featureId);
  await repos.comments.remove(comment, canonicalId);
  await events.publish('engagement', isOwner ? 'CommentDeleted' : 'CommentRemovedByAdmin', {
    featureId: canonicalId, commentId, userId: comment.userId, actorId: user.id
  }, { requestId });
  await countsService.announce(canonicalId, requestId);
}

module.exports = { list, add, edit, remove };
