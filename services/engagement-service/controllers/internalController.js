// Internal merge endpoints (called by the Administration Service only).
const { validate: v } = require('@roadhub/shared');
const mergeSteps = require('../services/mergeSteps');

function mergeBody(req) {
  v.onlyFields(req.body, ['mergeId', 'sourceId', 'targetId']);
  return { mergeId: v.uuid(req.body.mergeId, 'mergeId'), sourceId: v.uuid(req.body.sourceId, 'sourceId'), targetId: v.uuid(req.body.targetId, 'targetId') };
}

const prepare = async (req, res) => res.status(200).json(await mergeSteps.prepare(mergeBody(req)));
const complete = async (req, res) => res.status(200).json(await mergeSteps.complete(mergeBody(req), req.id));
const abort = async (req, res) => res.status(200).json(await mergeSteps.abort(mergeBody(req), req.id));
const undo = async (req, res) => res.status(200).json(await mergeSteps.undo(mergeBody(req), req.id));

module.exports = { prepare, complete, abort, undo };
