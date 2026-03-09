const Profile = require('../models/profile');
const Project = require('../models/projects');
const JoinProject = require('../models/joinProjects');

exports.getAllUsersFromProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).select('team');
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const users = await Profile.find({ _id: { $in: project.team } }).select('email avatar name').lean();
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users', error: err.message });
  }
};

exports.getProjectWithUserDetails = async (req, res) => {
  try {
    const project = await Project.findById(req.body.projectId).populate('tasks');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const user = await Profile.findById(project.createdBy);
    if (!user) return res.status(404).json({ error: 'Creator not found' });

    res.status(200).json({ project, createdBy: user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.acceptProjectInvite = async (req, res) => {
  try {
    const { projectId } = req.body;
    const userId = req.user.id;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    if (!project.team.some((m) => m.toString() === userId.toString())) {
      project.team.push(userId);
      await project.save();
    }

    let joinProject = await JoinProject.findById(userId);
    if (!joinProject) {
      joinProject = new JoinProject({ _id: userId, projects: [projectId], asManager: [] });
      await joinProject.save();
    } else if (!joinProject.projects.includes(projectId)) {
      joinProject.projects.push(projectId);
      await joinProject.save();
    }

    res.status(200).json({ message: 'Project invitation accepted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept invitation.' });
  }
};
