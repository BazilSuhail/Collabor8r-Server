const express = require('express');
const router = express.Router();
const taskController = require('../controllers/tasksController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, taskController.createTask);
router.get('/project/:projectId', authMiddleware, taskController.getTasksByProject);
router.get('/user/:userId', authMiddleware, taskController.getTasksByUser);
router.patch('/:taskId', authMiddleware, taskController.editTask);
router.delete('/:taskId', authMiddleware, taskController.deleteTask);

module.exports = router;
