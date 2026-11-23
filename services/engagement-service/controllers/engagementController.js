// HTTP layer of the Engagement Service: validate, call the services, choose the status code.
const { validate: v } = require('@roadhub/shared');
const voteService = require('../services/voteService');
const commentService = require('../services/commentService');
const repos = require('../repositories');

// Function 1
const addVote = async (req, res) => res.status(201).json(await voteService.add(req.user, v.uuid(req.params.id), req.id));
const removeVote = async (req, res) => res.status(200).json(await voteService.remove(req.user, v.uuid(req.params.id), req.id));
const voteSummary = async (req, res) => res.status(200).json(await voteService.summary(v.uuid(req.params.id), req.user, req.id));

// Function 2
async function listComments(req, res) {
  res.status(200).json(await commentService.list(v.uuid(req.params.id), req.id));
}
async function addComment(req, res) {
  v.onlyFields(req.body, ['body']); // userId / isTeamReply cannot be sent by the client
  const body = v.text(req.body, 'body', { min: 1, max: 1000 });
  res.status(201).json({ comment: await commentService.add(req.user, v.uuid(req.params.id), body, req.id) });
}
async function editComment(req, res) {
  v.onlyFields(req.body, ['body']);
  const body = v.text(req.body, 'body', { min: 1, max: 1000 });
  res.status(200).json({ comment: await commentService.edit(req.user, v.uuid(req.params.id), body) });
}
async function deleteComment(req, res) {
  await commentService.remove(req.user, v.uuid(req.params.id), req.id);
  res.status(204).end();
}

// Function 3
const myVotes = async (req, res) => {
  const items = await voteService.myVotes(req.user, req.id);
  res.status(200).json({ count: items.length, votes: items });
};

// The user's e-mail notification history
const myNotifications = async (req, res) => {
  const items = await repos.notifications.listForUser(req.user.id);
  res.status(200).json({ items: items.map(({ notificationId, eventType, featureId, status, createdAt }) => ({ notificationId, eventType, featureId, status, createdAt })) });
};

module.exports = { addVote, removeVote, voteSummary, listComments, addComment, editComment, deleteComment, myVotes, myNotifications };
