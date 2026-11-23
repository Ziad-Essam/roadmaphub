// Public routes of the Engagement Service (mounted at /api).
const express = require('express');
const { rateLimit, turnstile } = require('@roadhub/shared');
const auth = require('../middleware/auth');
const services = require('../clients/services');
const c = require('../controllers/engagementController');

const router = express.Router();
const voteLimiter = rateLimit.createRateLimiter({ name: 'vote', windowMs: 60000, max: 30, key: 'user' });
const commentLimiter = rateLimit.createRateLimiter({ name: 'comment', windowMs: 60000, max: 10, key: 'user' });

// Function 1: votes (role "user" only: the product team does not vote)
router.get('/features/:id/votes', auth.optionalUser, c.voteSummary);
router.post('/features/:id/votes', auth.requireUser, auth.requireRole('user'), voteLimiter, c.addVote);
router.delete('/features/:id/votes', auth.requireUser, auth.requireRole('user'), voteLimiter, c.removeVote);

// Function 2: comments
router.get('/features/:id/comments', c.listComments);
router.post('/features/:id/comments', auth.requireUser, commentLimiter, turnstile.requireTurnstile, c.addComment);
router.patch('/comments/:id', auth.requireUser, commentLimiter, c.editComment);
router.delete('/comments/:id', auth.requireUser, c.deleteComment);

// Function 3: My votes, and my notification history
router.get('/me/votes', auth.requireUser, c.myVotes);
router.get('/me/notifications', auth.requireUser, c.myNotifications);

// Shows that this service reaches the Roadmap and Administration services over HTTP (up/down only).
router.get('/engagement/dependencies', async (req, res) => {
  const check = async (target, path, scope) => {
    try {
      const out = await services.call(target, { path, scope, requestId: req.id, timeoutMs: 1500 });
      return out.status === 200 ? 'up' : `error ${out.status}`;
    } catch {
      return 'down';
    }
  };
  const [roadmap, admin] = await Promise.all([
    check('roadmap', '/internal/features/_ping', 'features:read'),
    check('admin', '/internal/identity/_ping', 'identity:read')
  ]);
  res.status(roadmap === 'up' && admin === 'up' ? 200 : 503).json({ service: 'engagement', dependencies: { roadmap, admin } });
});

module.exports = router;
