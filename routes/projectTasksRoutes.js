const express = require('express');
const router = express.Router();
const { getProjectTasks, getTaskDetails } = require('../controllers/projectTasksController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/:projectId/tasks', authMiddleware, getProjectTasks);
router.get('/:id', authMiddleware, getTaskDetails);

module.exports = router;
