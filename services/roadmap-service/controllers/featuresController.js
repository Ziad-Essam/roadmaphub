// HTTP layer of the Roadmap Service: validate, call featureService, choose the status code.
const { validate: v, cursor } = require('@roadhub/shared');
const featureService = require('../services/featureService');
const repos = require('../repositories');
const { STATUSES } = require('../services/statusRules');

function listOptions(query) {
  return {
    categoryId: query.category ? v.text(query, 'category', { min: 1, max: 40 }) : undefined,
    q: query.q ? v.text(query, 'q', { min: 2, max: 60 }) : undefined,
    sort: query.sort ? v.oneOf(query.sort, ['votes', 'newest'], 'sort') : 'votes'
  };
}

async function categories(req, res) {
  res.status(200).json({ categories: await repos.categories.list() });
}

// The four-column board in one call.
async function board(req, res) {
  const limit = v.int(req.query.limit, 'limit', { min: 1, max: 50, fallback: 25 });
  res.status(200).json({ columns: await featureService.board({ ...listOptions(req.query), limit }) });
}

// One column, page by page (?status=planned&cursor=...).
async function list(req, res) {
  const status = v.oneOf(req.query.status, STATUSES, 'status');
  const limit = v.int(req.query.limit, 'limit', { min: 1, max: 50, fallback: 20 });
  const page = await featureService.listColumn({ status, ...listOptions(req.query), limit, cursor: cursor.decode(req.query.cursor) });
  res.status(200).json({ items: page.items, nextCursor: cursor.encode(page.next) });
}

async function getOne(req, res) {
  const result = await featureService.getFeature(v.uuid(req.params.id));
  if (result.redirectTo) {
    // Temporary redirect (a merge can be undone): the browser follows it to the main request.
    res.set('Location', `/api/features/${result.redirectTo}`);
    return res.status(307).json({ redirectTo: result.redirectTo, mergedFeature: result.feature });
  }
  res.status(200).json({ feature: result.feature });
}

async function create(req, res) {
  v.onlyFields(req.body, ['title', 'description', 'categoryId']); // no status, author or counts from the client
  const feature = await featureService.create(req.user, {
    title: v.text(req.body, 'title', { min: 5, max: 120 }),
    description: v.text(req.body, 'description', { min: 10, max: 2000 }),
    categoryId: v.text(req.body, 'categoryId', { min: 1, max: 40 })
  }, req.id);
  res.status(201).json({ feature });
}

async function update(req, res) {
  v.onlyFields(req.body, ['title', 'description', 'categoryId']);
  const changes = {};
  if (req.body.title !== undefined) changes.title = v.text(req.body, 'title', { min: 5, max: 120 });
  if (req.body.description !== undefined) changes.description = v.text(req.body, 'description', { min: 10, max: 2000 });
  if (req.body.categoryId !== undefined) changes.categoryId = v.text(req.body, 'categoryId', { min: 1, max: 40 });
  if (!Object.keys(changes).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Nothing to change.' } });
  res.status(200).json({ feature: await featureService.update(req.user, v.uuid(req.params.id), changes) });
}

async function remove(req, res) {
  await featureService.remove(req.user, v.uuid(req.params.id), req.id);
  res.status(204).end();
}

async function changeStatus(req, res) {
  v.onlyFields(req.body, ['status']);
  const status = v.oneOf(req.body.status, STATUSES, 'status');
  res.status(200).json({ feature: await featureService.changeStatus(req.user, v.uuid(req.params.id), status, req.id) });
}

async function mine(req, res) {
  const limit = v.int(req.query.limit, 'limit', { min: 1, max: 50, fallback: 50 });
  const page = await featureService.myFeatures(req.user, { limit, cursor: cursor.decode(req.query.cursor) });
  res.status(200).json({ items: page.items, nextCursor: cursor.encode(page.next) });
}

module.exports = { categories, board, list, getOne, create, update, remove, changeStatus, mine };
