const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/labelController');

router.get('/project/:projectId', authMiddleware, ctrl.getProjectLabels);
router.post('/', authMiddleware, ctrl.createLabel);
router.put('/:labelId', authMiddleware, ctrl.updateLabel);
router.delete('/:labelId', authMiddleware, ctrl.deleteLabel);

module.exports = router;
