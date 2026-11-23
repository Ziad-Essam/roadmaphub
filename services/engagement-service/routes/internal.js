// Internal routes of the Engagement Service, mounted at /internal/engagement (service token + scope).
const express = require('express');
const { internalAuth } = require('@roadhub/shared');
const c = require('../controllers/internalController');

const router = express.Router();
const need = (scope) => internalAuth.requireService('engagement', scope);

router.get('/_ping', need('engagement:merge'), (req, res) => res.status(200).json({ service: 'engagement', caller: req.caller.service }));
router.post('/merges/prepare', need('engagement:merge'), c.prepare);
router.post('/merges/complete', need('engagement:merge'), c.complete);
router.post('/merges/abort', need('engagement:merge'), c.abort);
router.post('/merges/undo', need('engagement:merge'), c.undo);

module.exports = router;
