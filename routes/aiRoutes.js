const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/aiController');

router.post('/create-task', authMiddleware, ctrl.createTask);
router.post('/breakdown-task', authMiddleware, ctrl.breakdownTask);
router.post('/suggest-assignee', authMiddleware, ctrl.suggestAssignee);
router.post('/recommend-metadata', authMiddleware, ctrl.recommendMetadata);
router.get('/project-summary/:projectId', authMiddleware, ctrl.projectSummary);
router.post('/search-tasks', authMiddleware, ctrl.searchTasks);
router.post('/summarize-comments', authMiddleware, ctrl.summarizeComments);
router.post('/generate-acceptance-criteria', authMiddleware, ctrl.generateAcceptanceCriteria);
router.post('/detect-risks', authMiddleware, ctrl.detectRisks);
router.post('/retrospective', authMiddleware, ctrl.retrospective);

module.exports = router;
