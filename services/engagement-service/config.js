// Settings of the Engagement Service.
module.exports = {
  tables: {
    votes: process.env.VOTES_TABLE || 'roadhub-votes',
    comments: process.env.COMMENTS_TABLE || 'roadhub-comments',
    counts: process.env.COUNTS_TABLE || 'roadhub-engagement-counts',
    links: process.env.LINKS_TABLE || 'roadhub-engagement-links',
    notifications: process.env.NOTIFICATIONS_TABLE || 'roadhub-notifications',
    processed: process.env.PROCESSED_TABLE || 'roadhub-processed-messages'
  },
  notifyQueueName: process.env.NOTIFY_QUEUE_NAME || 'roadhub-notify-queue',
  opsTopicName: process.env.OPS_TOPIC_NAME || 'roadhub-ops-alerts',
  websiteUrl: process.env.WEBSITE_URL || 'http://localhost:4566/roadhub-frontend/index.html',
  maxRecipientsPerEvent: 50
};
