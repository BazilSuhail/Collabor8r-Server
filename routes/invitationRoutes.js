const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/invitationController');

router.post('/', authMiddleware, ctrl.sendInvitation);
router.get('/pending', authMiddleware, ctrl.getPendingInvitations);
router.post('/:token/accept', authMiddleware, ctrl.acceptInvitation);
router.post('/:token/decline', authMiddleware, ctrl.declineInvitation);
router.get('/project/:projectId', authMiddleware, ctrl.getProjectInvitations);

module.exports = router;
