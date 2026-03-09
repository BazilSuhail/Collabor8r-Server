const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/webhookController');

router.get('/project/:projectId', authMiddleware, ctrl.getProjectWebhooks);
router.post('/', authMiddleware, ctrl.createWebhook);
router.put('/:webhookId', authMiddleware, ctrl.updateWebhook);
router.delete('/:webhookId', authMiddleware, ctrl.deleteWebhook);
router.post('/:webhookId/test', authMiddleware, ctrl.testWebhook);

module.exports = router;
