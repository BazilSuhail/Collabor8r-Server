// POST /task-links → create link { sourceTaskId, targetTaskId, linkType, projectId }
// GET /task-links/task/:taskId → all links involving task
// DELETE /task-links/:linkId → remove link

const TaskLink = require('../models/taskLink');
const Task = require('../models/tasks');
const { validate, required, isMongoId, isEnum } = require('../utils/validate');
const { logActivity } = require('../utils/activityLogger');

exports.createLink = async (req, res) => {
  try {
    const errors = validate({
      sourceTaskId: [required, isMongoId],
      targetTaskId: [required, isMongoId],
      linkType: [required],
      projectId: [required, isMongoId],
    }, req.body);
    if (errors) return res.status(400).json({ errors });

    const existing = await TaskLink.findOne({
      $or: [
        { sourceTaskId: req.body.sourceTaskId, targetTaskId: req.body.targetTaskId },
        { sourceTaskId: req.body.targetTaskId, targetTaskId: req.body.sourceTaskId },
      ],
    });
    if (existing) return res.status(409).json({ error: 'Link already exists' });

    const link = new TaskLink(req.body);
    await link.save();

    const [source, target] = await Promise.all([
      Task.findById(req.body.sourceTaskId).select('title projectId'),
      Task.findById(req.body.targetTaskId).select('title projectId'),
    ]);

    await logActivity({
      actorId: req.user.id,
      action: 'created',
      entityType: 'taskLink',
      entityId: link._id,
      entityName: `${source?.title || req.body.sourceTaskId} → ${target?.title || req.body.targetTaskId} (${req.body.linkType})`,
      projectId: req.body.projectId || source?.projectId,
      changes: [{ field: 'linkType', oldValue: null, newValue: req.body.linkType }],
      description: `Linked tasks "${source?.title || ''}" and "${target?.title || ''}" (${req.body.linkType})`,
    });

    res.status(201).json(link);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create link' });
  }
};

exports.getTaskLinks = async (req, res) => {
  try {
    const links = await TaskLink.find({
      $or: [{ sourceTaskId: req.params.taskId }, { targetTaskId: req.params.taskId }],
    }).populate('sourceTaskId targetTaskId', 'title');
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
};

exports.deleteLink = async (req, res) => {
  try {
    const link = await TaskLink.findByIdAndDelete(req.params.linkId);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const [source, target] = await Promise.all([
      Task.findById(link.sourceTaskId).select('title'),
      Task.findById(link.targetTaskId).select('title'),
    ]);

    await logActivity({
      actorId: req.user.id,
      action: 'deleted',
      entityType: 'taskLink',
      entityId: link._id,
      entityName: `${source?.title || ''} → ${target?.title || ''} (${link.linkType})`,
      projectId: link.projectId,
      changes: [{ field: 'linkType', oldValue: link.linkType, newValue: null }],
      description: `Removed "${link.linkType}" link between "${source?.title || ''}" and "${target?.title || ''}"`,
    });

    res.json({ message: 'Link deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link' });
  }
};
