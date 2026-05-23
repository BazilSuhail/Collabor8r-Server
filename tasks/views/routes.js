// Task views: boards, saved filters, labels — mounted under /tasks.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');
const { BoardConfig, SavedFilter, Label } = require('./models');
const { Task } = require('../models');
const { validate, required, isString, isArray, isBoolean } = require('../../lib/validate');
const { logActivity } = require('../../utils/activityLogger');

function normalizeColumns(columns) {
  return columns.map((col) => ({
    name: col.title || col.name || '',
    statuses: col.statuses || (col.status ? [col.status] : []),
    wipLimit: col.wipLimit ?? col.limit ?? 0,
  }));
}
function normalizeSwimlane(swimlane) {
  return ['assignee', 'epic', 'priority'].includes(swimlane) ? swimlane : null;
}

// Boards
router.get('/boards', authMiddleware, async (req, res) => {
  try {
    res.json(await BoardConfig.find({ projectId: req.query.projectId }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

router.post('/boards', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ columns: [required, isArray] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const data = { ...req.body, createdBy: req.user.id };
    if (data.columns) data.columns = normalizeColumns(data.columns);
    if (data.swimlane) data.swimlane = normalizeSwimlane(data.swimlane);
    const board = new BoardConfig(data);
    await board.save();
    await logActivity({
      actorId: req.user.id, action: 'created', entityType: 'board',
      entityId: board._id, entityName: board.name || 'Board', projectId: board.projectId,
      description: `Board "${board.name || 'Board'}" created`,
    });
    res.status(201).json(board);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create board' });
  }
});

router.put('/boards/:boardId', authMiddleware, async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.columns) data.columns = normalizeColumns(data.columns);
    if (data.swimlane) data.swimlane = normalizeSwimlane(data.swimlane);
    const board = await BoardConfig.findByIdAndUpdate(req.params.boardId, data, { returnDocument: 'after' });
    if (!board) return res.status(404).json({ error: 'Board not found' });
    await logActivity({
      actorId: req.user.id, action: 'updated', entityType: 'board',
      entityId: board._id, entityName: board.name || 'Board', projectId: board.projectId,
      description: `Board "${board.name || 'Board'}" updated`,
    });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update board' });
  }
});

router.delete('/boards/:boardId', authMiddleware, async (req, res) => {
  try {
    const board = await BoardConfig.findByIdAndDelete(req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    await logActivity({
      actorId: req.user.id, action: 'deleted', entityType: 'board',
      entityId: req.params.boardId, entityName: board.name || 'Board', projectId: board.projectId,
      description: `Board "${board.name || 'Board'}" deleted`,
    });
    res.json({ message: 'Board deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Saved filters
router.get('/filters', authMiddleware, async (req, res) => {
  try {
    res.json(await SavedFilter.find({ projectId: req.query.projectId, userId: req.user.id }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

router.post('/filters', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ name: [required, isString], query: [required] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const filter = new SavedFilter({ ...req.body, userId: req.user.id });
    await filter.save();
    await logActivity({
      actorId: req.user.id, action: 'created', entityType: 'filter',
      entityId: filter._id, entityName: filter.name, projectId: filter.projectId,
      description: `Filter "${filter.name}" saved`,
    });
    res.status(201).json(filter);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save filter' });
  }
});

router.put('/filters/:filterId', authMiddleware, async (req, res) => {
  try {
    const filter = await SavedFilter.findOneAndUpdate(
      { _id: req.params.filterId, userId: req.user.id }, req.body, { returnDocument: 'after' }
    );
    if (!filter) return res.status(404).json({ error: 'Filter not found' });
    await logActivity({
      actorId: req.user.id, action: 'updated', entityType: 'filter',
      entityId: filter._id, entityName: filter.name, projectId: filter.projectId,
      description: `Filter "${filter.name}" updated`,
    });
    res.json(filter);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update filter' });
  }
});

router.delete('/filters/:filterId', authMiddleware, async (req, res) => {
  try {
    const filter = await SavedFilter.findOneAndDelete({ _id: req.params.filterId, userId: req.user.id });
    if (!filter) return res.status(404).json({ error: 'Filter not found' });
    await logActivity({
      actorId: req.user.id, action: 'deleted', entityType: 'filter',
      entityId: req.params.filterId, entityName: filter.name, projectId: filter.projectId,
      description: `Filter "${filter.name}" deleted`,
    });
    res.json({ message: 'Filter deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete filter' });
  }
});

// Labels
router.get('/labels', authMiddleware, async (req, res) => {
  try {
    res.json(await Label.find({ projectId: req.query.projectId }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

router.post('/labels', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ name: [required, isString], projectId: [required] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const label = new Label(req.body);
    await label.save();
    await logActivity({
      actorId: req.user.id, action: 'created', entityType: 'label',
      entityId: label._id, entityName: label.name, projectId: label.projectId,
      description: `Label "${label.name}" created`,
    });
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create label' });
  }
});

router.put('/labels/:labelId', authMiddleware, async (req, res) => {
  try {
    const label = await Label.findByIdAndUpdate(req.params.labelId, req.body, { returnDocument: 'after' });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    await logActivity({
      actorId: req.user.id, action: 'updated', entityType: 'label',
      entityId: label._id, entityName: label.name, projectId: label.projectId,
      description: `Label "${label.name}" updated`,
    });
    res.json(label);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update label' });
  }
});

router.delete('/labels/:labelId', authMiddleware, async (req, res) => {
  try {
    const label = await Label.findByIdAndDelete(req.params.labelId);
    if (!label) return res.status(404).json({ error: 'Label not found' });
    await Task.updateMany({ labels: req.params.labelId }, { $pull: { labels: req.params.labelId } });
    await logActivity({
      actorId: req.user.id, action: 'deleted', entityType: 'label',
      entityId: req.params.labelId, entityName: label.name, projectId: label.projectId,
      description: `Label "${label.name}" deleted`,
    });
    res.json({ message: 'Label deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete label' });
  }
});

module.exports = router;
