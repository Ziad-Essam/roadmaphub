// Comments (table roadhub-comments; feature-index lists the comments of one request by time).
const { randomUUID } = require('crypto');
const { GetCommand, QueryCommand, UpdateCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamo } = require('@roadhub/shared');
const config = require('../../config');
const groups = require('./groupRepository');

const { db, isConditionFailure } = dynamo;
const TABLE = config.tables.comments;

// Comment row + counter +1 on the main request, in ONE transaction.
async function add({ featureId, canonicalId, userId, authorName, body, isTeamReply }) {
  const now = new Date().toISOString();
  const comment = { commentId: randomUUID(), featureId, userId, authorName, body, isTeamReply, createdAt: now, updatedAt: now };
  await db.send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: TABLE, Item: comment, ConditionExpression: 'attribute_not_exists(commentId)' } },
      groups.counterUpdate(canonicalId, 'commentCount', 1)
    ]
  }));
  return comment;
}

async function get(commentId) {
  const out = await db.send(new GetCommand({ TableName: TABLE, Key: { commentId }, ConsistentRead: true }));
  return out.Item || null;
}

// The ownership check is part of the write: "only if the author is me".
async function editOwn(commentId, userId, body) {
  try {
    const out = await db.send(new UpdateCommand({
      TableName: TABLE, Key: { commentId },
      UpdateExpression: 'SET body = :b, updatedAt = :now, edited = :yes',
      ConditionExpression: 'attribute_exists(commentId) AND userId = :me',
      ExpressionAttributeValues: { ':b': body, ':now': new Date().toISOString(), ':me': userId, ':yes': true },
      ReturnValues: 'ALL_NEW'
    }));
    return out.Attributes;
  } catch (e) {
    if (isConditionFailure(e)) return null;
    throw e;
  }
}

async function remove(comment, canonicalId) {
  await db.send(new TransactWriteCommand({
    TransactItems: [
      { Delete: { TableName: TABLE, Key: { commentId: comment.commentId }, ConditionExpression: 'attribute_exists(commentId)' } },
      groups.counterUpdate(canonicalId, 'commentCount', -1)
    ]
  }));
}

// Comments posted on one request, oldest first (all pages, at most 1000).
async function listByFeature(featureId) {
  const items = [];
  let startKey;
  do {
    const out = await db.send(new QueryCommand({
      TableName: TABLE, IndexName: 'feature-index', KeyConditionExpression: 'featureId = :f',
      ExpressionAttributeValues: { ':f': featureId }, ScanIndexForward: true, ExclusiveStartKey: startKey
    }));
    items.push(...(out.Items || []));
    startKey = out.LastEvaluatedKey;
  } while (startKey && items.length < 1000);
  return items;
}

module.exports = { add, get, editOwn, remove, listByFeature };
