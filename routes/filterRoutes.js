const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/filterController');

router.get('/project/:projectId', authMiddleware, ctrl.getProjectFilters);
router.post('/', authMiddleware, ctrl.createFilter);
router.put('/:filterId', authMiddleware, ctrl.updateFilter);
router.delete('/:filterId', authMiddleware, ctrl.deleteFilter);

module.exports = router;
