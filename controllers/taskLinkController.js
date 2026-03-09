// POST /task-links → create link { sourceTaskId, targetTaskId, linkType, projectId }
// GET /task-links/task/:taskId → all links involving task
// DELETE /task-links/:linkId → remove link

const TaskLink = require('../models/taskLink');
const { validate, required, isMongoId, isEnum } = require('../utils/validate');

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
    res.json({ message: 'Link deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link' });
  }
};
