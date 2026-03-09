const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/sprintController');

router.get('/:projectId', authMiddleware, ctrl.getSprints);
router.post('/:projectId', authMiddleware, ctrl.createSprint);
router.get('/sprint/:sprintId', authMiddleware, ctrl.getSprint);
router.put('/sprint/:sprintId', authMiddleware, ctrl.updateSprint);
router.delete('/sprint/:sprintId', authMiddleware, ctrl.deleteSprint);
router.post('/sprint/:sprintId/activate', authMiddleware, ctrl.activateSprint);
router.post('/sprint/:sprintId/complete', authMiddleware, ctrl.completeSprint);
router.post('/sprint/:sprintId/add-tasks', authMiddleware, ctrl.addTasksToSprint);
router.post('/sprint/:sprintId/remove-tasks', authMiddleware, ctrl.removeTasksFromSprint);

module.exports = router;
