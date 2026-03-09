const Project = require('../models/projects');
const Profile = require('../models/profile');
const JoinProject = require('../models/joinProjects');

const formatProject = async (projectId) => {
  const project = await Project.findById(projectId)
    .select('name description createdBy projectManager theme tasks team')
    .lean();
  if (!project) return null;
  const admin = project.createdBy ? await Profile.findById(project.createdBy).select('name avatar').lean() : null;
  return {
    _id: project._id, name: project.name, projectManager: project.projectManager,
    theme: project.theme, description: project.description,
    createdBy: admin ? { name: admin.name, avatar: admin.avatar } : null,
    taskCount: project.tasks?.length || 0,
    teamCount: project.team?.length || 0,
  };
};

exports.getJoinedProjects = async (req, res) => {
  try {
    const doc = await JoinProject.findById(req.user.id).select('projects');
    if (!doc) return res.status(404).json({ error: 'No joined projects found.' });

    const projects = await Promise.all(doc.projects.map(formatProject));
    res.status(200).json(projects.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Server error while fetching joined projects' });
  }
};

exports.getJoinedProjectsAsManager = async (req, res) => {
  try {
    const doc = await JoinProject.findById(req.user.id).select('asManager');
    if (!doc) return res.status(404).json({ error: 'No managed projects found.' });

    const projects = await Promise.all(doc.asManager.map(formatProject));
    res.status(200).json(projects.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Server error while fetching managed projects' });
  }
};

exports.getProjectDetails = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (!project.team?.length) return res.status(200).json({ project, teamDetails: 'No team members found.' });

    const profiles = await Profile.find({ _id: { $in: project.team } }).select('name email avatar').lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [p._id.toString(), p]));
    const populatedTeam = project.team.map((id) => {
      const p = profileMap[id.toString()];
      return { _id: id, name: p?.name || 'Name not found', email: p?.email || 'Email not found', avatar: p?.avatar || 'Avatar not found' };
    });

    res.status(200).json({ project: { ...project, team: populatedTeam } });
  } catch (err) {
    res.status(500).json({ error: 'Server error while fetching project details' });
  }
};
