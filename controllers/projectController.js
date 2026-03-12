const Project = require('../models/projects');
const Profile = require('../models/profile');
const JoinProject = require('../models/joinProjects');
const Invitation = require('../models/invitation');
const { projectService } = require('../services');
const { sendNotification } = require('../services/notificationService');
const { sendInvitationEvent } = require('../socket');
const { validate, required, isString } = require('../utils/validate');

exports.createProject = async (req, res) => {
  try {
    const errors = validate({ name: [required, isString], description: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const project = await projectService.createProject(req.body, req.user.id);
    res.status(201).json({ message: 'Project created successfully!', project });
  } catch (err) {
    console.error('createProject error:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, projectManagerEmail, theme } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    if (project.projectManager.email !== projectManagerEmail) {
      const [user, sender] = await Promise.all([
        Profile.findOne({ email: projectManagerEmail }).select('_id email'),
        Profile.findById(req.user.id).select('name email avatar'),
      ]);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const customMsg = req.body.message ? ` — ${req.body.message}` : '';
      const desc = `${sender?.name || 'Someone'} has invited you as Project Manager for "${name}"${customMsg}`;

      const invite = new Invitation({
        email: user.email,
        projectId,
        projectName: name,
        projectDescription: project.description,
        invitedBy: req.user.id,
        type: 'projectManager',
        role: 'manager',
        senderName: sender?.name || 'Someone',
        senderEmail: sender?.email || '',
        senderAvatar: sender?.avatar || '',
        description: desc,
      });
      await invite.save();

      sendInvitationEvent(user._id, invite);

      await sendNotification(user._id, 'projectManager', {
        projectId, projectName: name,
        from: req.user.id,
        senderName: sender?.name || 'Someone',
        senderEmail: sender?.email || '',
        title: `Manager invitation from ${sender?.name || 'Someone'}`,
        description: `${sender?.name || 'Someone'} has invited you as Manager for "${name}"${message ? ': ' + message : ''}`,
      });

      return res.status(200).json({ message: 'Invitation sent to the new project manager.', invitation: invite });
    }

    const updated = await Project.findByIdAndUpdate(projectId, { name, description, projectManagerEmail, theme }, { new: true });
    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};

exports.managerInvitation = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { response } = req.body;

    const update = response === 'Accept'
      ? { 'projectManager.status': 'Approved' }
      : { 'projectManager.email': '', 'projectManager.status': 'Declined' };

    const updatedProject = await Project.findByIdAndUpdate(projectId, { $set: update }, { new: true });
    if (!updatedProject) return res.status(404).json({ error: 'Project not found.' });

    if (response === 'Accept') {
      let joinProject = await JoinProject.findById(req.user.id);
      if (!joinProject) {
        joinProject = new JoinProject({ _id: req.user.id, asManager: [projectId], projects: [] });
        await joinProject.save();
      } else if (!joinProject.asManager.includes(projectId)) {
        joinProject.asManager.push(projectId);
        await joinProject.save();
      }
    }

    res.status(200).json(updatedProject);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
};
