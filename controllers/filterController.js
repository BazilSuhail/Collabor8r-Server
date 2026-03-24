// GET /filters/project/:projectId → saved filters for project
// POST /filters → save filter { name, projectId, query, isDefault? }
// PUT /filters/:filterId → update filter { name?, query?, isDefault? }
// DELETE /filters/:filterId → delete filter

const SavedFilter = require('../models/savedFilter');
const { validate, required, isString, isBoolean } = require('../utils/validate');
const { logActivity } = require('../utils/activityLogger');

exports.getProjectFilters = async (req, res) => {
  try {
    const filters = await SavedFilter.find({
      projectId: req.params.projectId,
      userId: req.user.id,
    });
    res.json(filters);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
};

exports.createFilter = async (req, res) => {
  try {
    const errors = validate({ name: [required, isString], query: [required] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const filter = new SavedFilter({ ...req.body, userId: req.user.id });
    await filter.save();

    await logActivity({
      actorId: req.user.id,
      action: 'created',
      entityType: 'filter',
      entityId: filter._id,
      entityName: filter.name,
      projectId: filter.projectId,
      description: `Filter "${filter.name}" saved`,
    });

    res.status(201).json(filter);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save filter' });
  }
};

exports.updateFilter = async (req, res) => {
  try {
    const filter = await SavedFilter.findOneAndUpdate(
      { _id: req.params.filterId, userId: req.user.id },
      req.body,
      { new: true }
    );
    if (!filter) return res.status(404).json({ error: 'Filter not found' });

    await logActivity({
      actorId: req.user.id,
      action: 'updated',
      entityType: 'filter',
      entityId: filter._id,
      entityName: filter.name,
      projectId: filter.projectId,
      description: `Filter "${filter.name}" updated`,
    });

    res.json(filter);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update filter' });
  }
};

exports.deleteFilter = async (req, res) => {
  try {
    const filter = await SavedFilter.findOneAndDelete({ _id: req.params.filterId, userId: req.user.id });
    if (!filter) return res.status(404).json({ error: 'Filter not found' });

    await logActivity({
      actorId: req.user.id,
      action: 'deleted',
      entityType: 'filter',
      entityId: req.params.filterId,
      entityName: filter.name,
      projectId: filter.projectId,
      description: `Filter "${filter.name}" deleted`,
    });

    res.json({ message: 'Filter deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete filter' });
  }
};
