// Internal endpoints of the Roadmap Service (other services only, see docs/internal-api-contract.md).
const { validate: v, http } = require('@roadhub/shared');
const featureService = require('../services/featureService');
const mergeSteps = require('../services/mergeSteps');
const repos = require('../repositories');

async function resolve(req, res) {
  const id = v.uuid(req.params.id);
  const f = await repos.features.get(id);
  if (!f) return http.sendError(res, 404, 'FEATURE_NOT_FOUND', 'This feature request does not exist.');
  const canonical = await featureService.resolve(id);
  res.status(200).json({
    featureId: id, canonicalId: canonical.featureId, exists: true, status: canonical.status,
    title: canonical.title, authorId: canonical.authorId, merged: Boolean(f.mergedInto),
    locked: Boolean(canonical.mergeLock)
  });
}

async function resolveBatch(req, res) {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 100).map((id) => v.uuid(id, 'ids')) : [];
  const found = await repos.features.getMany(ids);
  const items = await Promise.all(found.map(async (f) => {
    const canonical = f.mergedInto ? await featureService.resolve(f.featureId) : f;
    return {
      featureId: f.featureId, canonicalId: canonical.featureId, title: canonical.title, status: canonical.status,
      categoryName: canonical.categoryName, statusChangedAt: canonical.statusChangedAt, merged: Boolean(f.mergedInto)
    };
  }));
  res.status(200).json({ items });
}

async function candidates(req, res) {
  res.status(200).json({ items: await repos.features.listCandidates() });
}

function mergeBody(req) {
  v.onlyFields(req.body, ['mergeId', 'sourceId', 'targetId']);
  return { mergeId: v.uuid(req.body.mergeId, 'mergeId'), sourceId: v.uuid(req.body.sourceId, 'sourceId'), targetId: v.uuid(req.body.targetId, 'targetId') };
}

const prepare = async (req, res) => res.status(200).json(await mergeSteps.prepare(mergeBody(req)));
const complete = async (req, res) => res.status(200).json(await mergeSteps.complete(mergeBody(req)));
const abort = async (req, res) => res.status(200).json(await mergeSteps.abort(mergeBody(req)));
const undo = async (req, res) => res.status(200).json(await mergeSteps.undo(mergeBody(req)));

module.exports = { resolve, resolveBatch, candidates, prepare, complete, abort, undo };
