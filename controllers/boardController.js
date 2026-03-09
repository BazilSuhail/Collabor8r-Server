// GET /boards/project/:projectId → board configs for project
// POST /boards → create board { name?, projectId, columns, swimlane?, filters? }
// PUT /boards/:boardId → update board { name?, columns?, swimlane?, filters? }
// DELETE /boards/:boardId → delete board

const BoardConfig = require('../models/boardConfig');
const { validate, required, isString, isArray } = require('../utils/validate');

exports.getProjectBoards = async (req, res) => {
  try {
    const boards = await BoardConfig.find({ projectId: req.params.projectId });
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
};

exports.createBoard = async (req, res) => {
  try {
    const errors = validate({ columns: [required, isArray] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const board = new BoardConfig({ ...req.body, createdBy: req.user.id });
    await board.save();
    res.status(201).json(board);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create board' });
  }
};

exports.updateBoard = async (req, res) => {
  try {
    const board = await BoardConfig.findByIdAndUpdate(req.params.boardId, req.body, { new: true });
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update board' });
  }
};

exports.deleteBoard = async (req, res) => {
  try {
    const board = await BoardConfig.findByIdAndDelete(req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json({ message: 'Board deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete board' });
  }
};
