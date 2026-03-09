const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/timeEntryController');

router.post('/entries', authMiddleware, ctrl.logTime);
router.get('/entries/task/:taskId', authMiddleware, ctrl.getTaskTimeEntries);
router.get('/entries/user', authMiddleware, ctrl.getUserTimeEntries);
router.get('/report/project/:projectId', authMiddleware, ctrl.getProjectTimeReport);
router.get('/report/sprint/:sprintId', authMiddleware, ctrl.getSprintTimeReport);
router.put('/entries/:entryId', authMiddleware, ctrl.updateTimeEntry);
router.delete('/entries/:entryId', authMiddleware, ctrl.deleteTimeEntry);

module.exports = router;
