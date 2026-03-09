// POST /organizations → create org { name, description? }
// GET /organizations → list user's orgs
// GET /organizations/:orgId → org details with members
// PUT /organizations/:orgId → update org { name?, description? }
// DELETE /organizations/:orgId → delete org
// POST /organizations/:orgId/members → { userId, role? }
// PUT /organizations/:orgId/members/:userId → { role }
// DELETE /organizations/:orgId/members/:userId → remove member

const Organization = require('../models/organization');
const Project = require('../models/projects');
const { validate, required, isString, isEnum } = require('../utils/validate');

exports.createOrganization = async (req, res) => {
  try {
    const errors = validate({ name: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const org = new Organization({ ...req.body, ownerId: req.user.id, members: [{ userId: req.user.id, role: 'owner' }] });
    await org.save();
    res.status(201).json(org);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
};

exports.getMyOrganizations = async (req, res) => {
  try {
    const orgs = await Organization.find({ 'members.userId': req.user.id });
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
};

exports.getOrganization = async (req, res) => {
  try {
    const org = await Organization.findById(req.params.orgId).populate('members.userId', 'name email avatar').populate('projects', 'name');
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const org = await Organization.findOneAndUpdate(
      { _id: req.params.orgId, ownerId: req.user.id },
      req.body,
      { new: true }
    );
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update organization' });
  }
};

exports.deleteOrganization = async (req, res) => {
  try {
    const org = await Organization.findOneAndDelete({ _id: req.params.orgId, ownerId: req.user.id });
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    await Project.updateMany({ organizationId: req.params.orgId }, { $unset: { organizationId: '' } });
    res.json({ message: 'Organization deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete organization' });
  }
};

exports.addMember = async (req, res) => {
  try {
    const org = await Organization.findById(req.params.orgId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const exists = org.members.some((m) => String(m.userId) === String(req.body.userId));
    if (exists) return res.status(409).json({ error: 'Member already exists' });

    org.members.push({ userId: req.body.userId, role: req.body.role || 'member' });
    await org.save();
    res.status(201).json(org);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
};

exports.updateMemberRole = async (req, res) => {
  try {
    const org = await Organization.findById(req.params.orgId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const member = org.members.find((m) => String(m.userId) === String(req.params.userId));
    if (!member) return res.status(404).json({ error: 'Member not found' });

    member.role = req.body.role || member.role;
    await org.save();
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update member role' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(
      req.params.orgId,
      { $pull: { members: { userId: req.params.userId } } },
      { new: true }
    );
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
};
