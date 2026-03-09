const Project = require('../models/projects');
const Profile = require('../models/profile');
const JoinProject = require('../models/joinProjects');
const { projectService } = require('../services');
const { validate, required, isString } = require('../utils/validate');

exports.createProject = async (req, res) => {
  try {
    const errors = validate({ name: [required, isString], description: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const project = await projectService.createProject(req.body, req.user.id);
    res.status(201).json({ message: 'Project created successfully!', project });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, projectManagerEmail, theme } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    if (project.projectManager.email !== projectManagerEmail) {
      const user = await Profile.findOne({ email: projectManagerEmail }).select('_id');
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const { sendNotification } = require('../services/notificationService');
      await sendNotification(user._id, 'projectManager', {
        description: `You are invited as a Project Manager for Project ${name}`,
        from: req.user.id,
        projectId,
      });
      return res.status(200).json({ message: 'Notification sent to the new project manager.' });
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
