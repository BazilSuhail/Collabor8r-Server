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
    console.error('❌ getProjectBoards:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
};

exports.createBoard = async (req, res) => {
  try {
    const errors = validate({ columns: [required, isArray] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const data = { ...req.body, createdBy: req.user.id };
    if (data.columns) {
      data.columns = data.columns.map(col => ({
        name: col.title || col.name || '',
        statuses: col.statuses || (col.status ? [col.status] : []),
        wipLimit: col.wipLimit ?? col.limit ?? 0,
      }));
    }
    if (data.swimlane && !['assignee', 'epic', 'priority'].includes(data.swimlane)) {
      data.swimlane = null;
    }

    const board = new BoardConfig(data);
    await board.save();
    res.status(201).json(board);
  } catch (err) {
    console.error('❌ createBoard:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to create board' });
  }
};

exports.updateBoard = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.columns) {
      data.columns = data.columns.map(col => ({
        name: col.title || col.name || '',
        statuses: col.statuses || (col.status ? [col.status] : []),
        wipLimit: col.wipLimit ?? col.limit ?? 0,
      }));
    }
    if (data.swimlane && !['assignee', 'epic', 'priority'].includes(data.swimlane)) {
      data.swimlane = null;
    }
    const board = await BoardConfig.findByIdAndUpdate(req.params.boardId, data, { new: true });
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    console.error('❌ updateBoard:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to update board' });
  }
};

exports.deleteBoard = async (req, res) => {
  try {
    const board = await BoardConfig.findByIdAndDelete(req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json({ message: 'Board deleted' });
  } catch (err) {
    console.error('❌ deleteBoard:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to delete board' });
  }
};
