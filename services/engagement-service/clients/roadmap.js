// Questions the Engagement Service asks the Roadmap Service (over HTTP, service token).
const services = require('./services');

// Does the request exist, and which request is shown publicly (after merges)?
async function resolve(featureId, requestId) {
  return services.callOk('roadmap', { path: `/internal/features/${featureId}/resolve`, scope: 'features:read', requestId });
}

async function resolveBatch(ids, requestId) {
  if (!ids.length) return [];
  const out = await services.callOk('roadmap', { method: 'POST', path: '/internal/features/resolve-batch', body: { ids }, scope: 'features:read', requestId });
  return out.items;
}

module.exports = { resolve, resolveBatch };
