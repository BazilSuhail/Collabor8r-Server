const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/boardController');

router.get('/project/:projectId', authMiddleware, ctrl.getProjectBoards);
router.post('/', authMiddleware, ctrl.createBoard);
router.put('/:boardId', authMiddleware, ctrl.updateBoard);
router.delete('/:boardId', authMiddleware, ctrl.deleteBoard);

module.exports = router;
