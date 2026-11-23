// Merge groups and counters.
//  roadhub-engagement-links : { featureId: <duplicate>, canonicalId: <main request>, mergeId }
//  roadhub-engagement-counts: { featureId: <main request>, voteCount, commentCount, version }
// A merge only writes ONE link item; votes and comments are never copied, so undo is exact.
const { GetCommand, PutCommand, DeleteCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamo } = require('@roadhub/shared');
const config = require('../../config');

const { db, isConditionFailure } = dynamo;
const LINKS = config.tables.links;
const COUNTS = config.tables.counts;

async function canonicalOf(featureId) {
  const out = await db.send(new GetCommand({ TableName: LINKS, Key: { featureId }, ConsistentRead: true }));
  return out.Item ? out.Item.canonicalId : featureId;
}

async function getLink(featureId) {
  const out = await db.send(new GetCommand({ TableName: LINKS, Key: { featureId }, ConsistentRead: true }));
  return out.Item || null;
}

// The main request and every duplicate merged into it.
async function members(canonicalId) {
  const out = await db.send(new QueryCommand({
    TableName: LINKS, IndexName: 'canonical-index', KeyConditionExpression: 'canonicalId = :c',
    ExpressionAttributeValues: { ':c': canonicalId }
  }));
  return [canonicalId, ...(out.Items || []).map((l) => l.featureId)];
}

// Returns true if written now or already written by the same merge (idempotent).
async function addLink({ mergeId, sourceId, targetId }) {
  try {
    await db.send(new PutCommand({
      TableName: LINKS, Item: { featureId: sourceId, canonicalId: targetId, mergeId, linkedAt: new Date().toISOString() },
      ConditionExpression: 'attribute_not_exists(featureId) OR mergeId = :m', ExpressionAttributeValues: { ':m': mergeId }
    }));
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

async function removeLink({ mergeId, sourceId }) {
  try {
    await db.send(new DeleteCommand({
      TableName: LINKS, Key: { featureId: sourceId }, ConditionExpression: 'mergeId = :m', ExpressionAttributeValues: { ':m': mergeId }
    }));
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false; // not there (already removed) or another merge's link
    throw e;
  }
}

async function getCounts(featureId) {
  const out = await db.send(new GetCommand({ TableName: COUNTS, Key: { featureId }, ConsistentRead: true }));
  return out.Item || { featureId, voteCount: 0, commentCount: 0, version: 0 };
}

async function setCounts(featureId, { voteCount, commentCount }) {
  const out = await db.send(new UpdateCommand({
    TableName: COUNTS, Key: { featureId },
    UpdateExpression: 'SET voteCount = :v, commentCount = :c ADD version :one',
    ExpressionAttributeValues: { ':v': voteCount, ':c': commentCount, ':one': 1 }, ReturnValues: 'ALL_NEW'
  }));
  return out.Attributes;
}

// Transaction pieces used by votes and comments (counter + version move together with the row).
function counterUpdate(featureId, field, delta) {
  const update = {
    TableName: COUNTS, Key: { featureId },
    UpdateExpression: `ADD ${field} :d, version :one`,
    ExpressionAttributeValues: { ':d': delta, ':one': 1 }
  };
  if (delta < 0) {
    update.ConditionExpression = `${field} >= :min`;
    update.ExpressionAttributeValues[':min'] = -delta;
  }
  return { Update: update };
}

module.exports = { canonicalOf, getLink, members, addLink, removeLink, getCounts, setCounts, counterUpdate };
