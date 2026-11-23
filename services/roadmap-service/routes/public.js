// Public routes of the Roadmap Service (mounted at /api). Visitors may read; changes need a login.
const express = require('express');
const { rateLimit, turnstile } = require('@roadhub/shared');
const auth = require('../middleware/auth');
const c = require('../controllers/featuresController');

const router = express.Router();
const submitLimiter = rateLimit.createRateLimiter({ name: 'submit-feature', windowMs: 60000, max: 5, key: 'user' });
const readLimiter = rateLimit.createRateLimiter({ name: 'roadmap-read', windowMs: 60000, max: 600 });

// Visitors (no login)
router.get('/categories', readLimiter, c.categories);
router.get('/roadmap', readLimiter, c.board);
router.get('/features', readLimiter, c.list);
router.get('/features/:id', readLimiter, c.getOne);

// Registered users
router.get('/me/features', auth.requireUser, c.mine);
router.post('/features', auth.requireUser, auth.requireRole('user'), submitLimiter, turnstile.requireTurnstile, c.create);
router.patch('/features/:id', auth.requireUser, c.update);
router.delete('/features/:id', auth.requireUser, c.remove);

// Administrators
router.patch('/features/:id/status', auth.requireUser, auth.requireRole('admin'), c.changeStatus);

module.exports = router;
