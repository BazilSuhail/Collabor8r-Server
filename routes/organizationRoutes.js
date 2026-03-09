const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/organizationController');

router.post('/', authMiddleware, ctrl.createOrganization);
router.get('/', authMiddleware, ctrl.getMyOrganizations);
router.get('/:orgId', authMiddleware, ctrl.getOrganization);
router.put('/:orgId', authMiddleware, ctrl.updateOrganization);
router.delete('/:orgId', authMiddleware, ctrl.deleteOrganization);
router.post('/:orgId/members', authMiddleware, ctrl.addMember);
router.put('/:orgId/members/:userId', authMiddleware, ctrl.updateMemberRole);
router.delete('/:orgId/members/:userId', authMiddleware, ctrl.removeMember);

module.exports = router;
