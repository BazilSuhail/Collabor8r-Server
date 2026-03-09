const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/activityController');

router.get('/project/:projectId', authMiddleware, ctrl.getProjectActivity);
router.get('/task/:taskId', authMiddleware, ctrl.getTaskActivity);
router.get('/user', authMiddleware, ctrl.getUserActivity);

module.exports = router;
