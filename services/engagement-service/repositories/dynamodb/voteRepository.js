// Votes (table roadhub-votes). Key (featureId, userId): one row per person per request.
const { BatchGetCommand, QueryCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamo } = require('@roadhub/shared');
const config = require('../../config');
const groups = require('./groupRepository');

const { db, isConditionFailure } = dynamo;
const TABLE = config.tables.votes;

// This user's vote rows inside a merge group (normally 0 or 1).
async function findUserVotes(featureIds, userId) {
  const out = await db.send(new BatchGetCommand({
    RequestItems: { [TABLE]: { Keys: featureIds.map((featureId) => ({ featureId, userId })), ConsistentRead: true } }
  }));
  return out.Responses[TABLE] || [];
}

// Vote row + counter +1 in ONE transaction. Returns false if this person already has a row.
async function addVote(canonicalId, userId) {
  try {
    await db.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: TABLE, Item: { featureId: canonicalId, userId, createdAt: new Date().toISOString() },
          ConditionExpression: 'attribute_not_exists(userId)' } },
        groups.counterUpdate(canonicalId, 'voteCount', 1)
      ]
    }));
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

// Deletes all of the user's rows in the group and takes ONE effective vote off the counter.
async function removeVotes(canonicalId, rows) {
  await db.send(new TransactWriteCommand({
    TransactItems: [
      ...rows.map((r) => ({ Delete: { TableName: TABLE, Key: { featureId: r.featureId, userId: r.userId }, ConditionExpression: 'attribute_exists(userId)' } })),
      groups.counterUpdate(canonicalId, 'voteCount', -1)
    ]
  }));
}

// Every voter of one request (all pages).
async function votersOf(featureId) {
  const voters = [];
  let startKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: 'featureId = :f', ExpressionAttributeValues: { ':f': featureId },
      ProjectionExpression: 'userId', ExclusiveStartKey: startKey
    }));
    voters.push(...(out.Items || []).map((i) => i.userId));
    startKey = out.LastEvaluatedKey;
  } while (startKey);
  return voters;
}

// "My votes": newest first, using the user-index.
async function listByUser(userId, { limit = 100 } = {}) {
  const out = await db.send(new QueryCommand({
    TableName: TABLE, IndexName: 'user-index', KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId }, ScanIndexForward: false, Limit: limit
  }));
  return out.Items || [];
}

module.exports = { findUserVotes, addVote, removeVotes, votersOf, listByUser };
