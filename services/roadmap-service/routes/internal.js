// Internal routes of the Roadmap Service, mounted at /internal/features (service token + scope).
const express = require('express');
const { internalAuth } = require('@roadhub/shared');
const c = require('../controllers/internalController');

const router = express.Router();
const need = (scope) => internalAuth.requireService('roadmap', scope);

router.get('/_ping', need('features:read'), (req, res) => res.status(200).json({ service: 'roadmap', caller: req.caller.service }));
router.get('/candidates', need('features:read'), c.candidates);
router.post('/resolve-batch', need('features:read'), c.resolveBatch);
router.get('/:id/resolve', need('features:read'), c.resolve);
router.post('/merges/prepare', need('features:merge'), c.prepare);
router.post('/merges/complete', need('features:merge'), c.complete);
router.post('/merges/abort', need('features:merge'), c.abort);
router.post('/merges/undo', need('features:merge'), c.undo);

module.exports = router;
