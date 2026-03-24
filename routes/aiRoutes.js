const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/aiController');

router.post('/draft-task', authMiddleware, ctrl.draftTask);
router.post('/create-task', authMiddleware, ctrl.createTaskFromNL);
router.post('/roadmap', authMiddleware, ctrl.roadmap);
router.post('/suggest-tasks', authMiddleware, ctrl.suggestTasks);
router.post('/create-tasks', authMiddleware, ctrl.createTasksFromSuggestions);
router.post('/create-sprint', authMiddleware, ctrl.createSprintFromNL);
router.post('/breakdown-task', authMiddleware, ctrl.breakdownTask);
router.post('/suggest-assignee', authMiddleware, ctrl.suggestAssignee);
router.post('/recommend-metadata', authMiddleware, ctrl.recommendMetadata);
router.post('/generate-acceptance-criteria', authMiddleware, ctrl.generateAcceptanceCriteria);
router.post('/summarize-comments', authMiddleware, ctrl.summarizeComments);
router.get('/project-summary/:projectId', authMiddleware, ctrl.projectSummary);
router.post('/detect-risks', authMiddleware, ctrl.detectRisks);
router.post('/search-tasks', authMiddleware, ctrl.searchTasks);
router.post('/retrospective', authMiddleware, ctrl.retrospective);

module.exports = router;
