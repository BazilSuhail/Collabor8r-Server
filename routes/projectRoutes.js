const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const authenticateUser  = require('../middleware/authMiddleware');

router.post('/create', authenticateUser, projectController.createProject);
router.post('/ai-assist', authenticateUser, projectController.aiAssistProject);
router.put('/lead-response/:projectId', authenticateUser, projectController.leadResponse);
router.get('/:projectId/summary', authenticateUser, projectController.projectSummary);

router.put('/:projectId/update', authenticateUser, projectController.updateProject);
router.get('/:projectId/online-members', authenticateUser, projectController.getOnlineMembers);

module.exports = router;
