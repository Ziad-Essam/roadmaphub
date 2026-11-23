// Notification log (roadhub-notifications) and processed queue messages (roadhub-processed-messages).
const { PutCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamo } = require('@roadhub/shared');
const config = require('../../config');

const { db, isConditionFailure } = dynamo;

// One row per (event, recipient). notificationId = eventId#userId, so a re-delivered message
// can never e-mail the same person twice for the same event.
async function claim({ eventId, recipientId, eventType, featureId }) {
  const notificationId = `${eventId}#${recipientId}`;
  try {
    await db.send(new PutCommand({
      TableName: config.tables.notifications,
      Item: { notificationId, recipientId, eventId, eventType, featureId, status: 'pending', attempts: 1, createdAt: new Date().toISOString() },
      ConditionExpression: 'attribute_not_exists(notificationId)'
    }));
    return { claimed: true, notificationId };
  } catch (e) {
    if (!isConditionFailure(e)) throw e;
    const existing = await db.send(new GetCommand({ TableName: config.tables.notifications, Key: { notificationId }, ConsistentRead: true }));
    // sent or skipped before: do nothing. pending/failed: try again (attempts + 1).
    const status = existing.Item && existing.Item.status;
    if (status === 'sent' || status === 'skipped') return { claimed: false, notificationId };
    await db.send(new UpdateCommand({ TableName: config.tables.notifications, Key: { notificationId }, UpdateExpression: 'ADD attempts :one', ExpressionAttributeValues: { ':one': 1 } }));
    return { claimed: true, notificationId };
  }
}

async function finish(notificationId, { status, providerMessageId, errorCode }) {
  await db.send(new UpdateCommand({
    TableName: config.tables.notifications, Key: { notificationId },
    UpdateExpression: 'SET #s = :s, providerMessageId = :p, errorCode = :e, finishedAt = :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':p': providerMessageId, ':e': errorCode, ':now': new Date().toISOString() }
  }));
}

async function listForUser(recipientId, limit = 50) {
  const out = await db.send(new QueryCommand({
    TableName: config.tables.notifications, IndexName: 'recipient-index', KeyConditionExpression: 'recipientId = :r',
    ExpressionAttributeValues: { ':r': recipientId }, ScanIndexForward: false, Limit: limit
  }));
  return out.Items || [];
}

// Marks a whole queue message as done (kept 7 days, then removed by DynamoDB TTL).
async function markProcessed(messageId) {
  try {
    await db.send(new PutCommand({
      TableName: config.tables.processed,
      Item: { messageId, processedAt: new Date().toISOString(), expiresAt: Math.floor(Date.now() / 1000) + 7 * 86400 },
      ConditionExpression: 'attribute_not_exists(messageId)'
    }));
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

async function wasProcessed(messageId) {
  const out = await db.send(new GetCommand({ TableName: config.tables.processed, Key: { messageId }, ConsistentRead: true }));
  return Boolean(out.Item);
}

module.exports = { claim, finish, listForUser, markProcessed, wasProcessed };
