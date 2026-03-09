// GET /labels/project/:projectId → all labels for project
// POST /labels → create label { name, color?, projectId }
// PUT /labels/:labelId → update label { name?, color? }
// DELETE /labels/:labelId → delete label (also removes from tasks)

const Label = require('../models/label');
const Task = require('../models/tasks');
const { validate, required, isString } = require('../utils/validate');

exports.getProjectLabels = async (req, res) => {
  try {
    const labels = await Label.find({ projectId: req.params.projectId });
    res.json(labels);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
};

exports.createLabel = async (req, res) => {
  try {
    const errors = validate({ name: [required, isString], projectId: [required] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const label = new Label(req.body);
    await label.save();
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create label' });
  }
};

exports.updateLabel = async (req, res) => {
  try {
    const label = await Label.findByIdAndUpdate(req.params.labelId, req.body, { new: true });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    res.json(label);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update label' });
  }
};

exports.deleteLabel = async (req, res) => {
  try {
    const label = await Label.findByIdAndDelete(req.params.labelId);
    if (!label) return res.status(404).json({ error: 'Label not found' });
    await Task.updateMany({ labels: req.params.labelId }, { $pull: { labels: req.params.labelId } });
    res.json({ message: 'Label deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete label' });
  }
};
