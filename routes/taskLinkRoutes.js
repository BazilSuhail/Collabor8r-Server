const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/taskLinkController');

router.post('/', authMiddleware, ctrl.createLink);
router.get('/task/:taskId', authMiddleware, ctrl.getTaskLinks);
router.delete('/:linkId', authMiddleware, ctrl.deleteLink);

module.exports = router;
