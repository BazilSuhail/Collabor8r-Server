const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const authenticateUser  = require('../middleware/authMiddleware');

console.log('✅ projectRoutes loaded');

router.post('/create', authenticateUser, projectController.createProject);
router.put('/manager-response/:projectId', authenticateUser, projectController.managerInvitation);

router.put('/:projectId/update', (req, res, next) => {
  console.log('➡️ PUT hit:', req.method, req.originalUrl, 'params:', req.params);
  next();
}, authenticateUser, projectController.updateProject);

module.exports = router;
