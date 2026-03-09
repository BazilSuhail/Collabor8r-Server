const Profile = require('../models/profile');
const Project = require('../models/projects');
const Task = require('../models/tasks');
const AdminProject = require('../models/adminProjects');
const { sendNotification } = require('../services/notificationService');

exports.getCreatedProjects = async (req, res) => {
  try {
    const adminProjects = await AdminProject.findById(req.user.id);
    if (!adminProjects) return res.status(404).json({ error: 'Admin projects not found.' });

    const projects = await Promise.all(adminProjects.projects.map((id) => Project.findById(id)));
    res.status(200).json(projects.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getProjectDetails = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [teamDetails, taskDetails] = await Promise.all([
      Promise.all(project.team.map((id) => Profile.findById(id).select('name email avatar -_id'))),
      Promise.all(project.tasks.slice(0, 5).map((id) => Task.findById(id, 'title priority dueDate -_id'))),
    ]);

    res.status(200).json({
      ...project.toObject(),
      team: teamDetails.filter(Boolean),
      taskCount: project.tasks.length,
      tasks: taskDetails.filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.searchUserByEmail = async (req, res) => {
  try {
    const { email, projectId } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (!projectId) return res.status(400).json({ error: 'Project ID is required.' });

    const user = await Profile.findOne({ email }).select('name email avatar _id');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const project = await Project.findById(projectId).select('team');
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    if (project.team.some((m) => m.toString() === user._id.toString())) {
      return res.status(400).json({ error: 'User is already in the team.' });
    }

    res.status(200).json({ userId: user._id, name: user.name, email: user.email, avatar: user.avatar });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.addMemberToTeam = async (req, res) => {
  try {
    const { userId, projectId } = req.body;
    const sender = await Profile.findById(req.user.id).select('name');
    const projectTitleDoc = await Project.findById(projectId).select('name');

    await sendNotification(userId, 'teamMember', {
      projectId,
      from: req.user.id,
      title: `Project invitation from ${sender.name}`,
      description: `${sender.name} has invited you to join "${projectTitleDoc?.name}"`,
    });

    res.status(200).json({ message: 'Invitation sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send invitation.' });
  }
};
