const Project = require('../models/projects');
const Profile = require('../models/profile');

const formatProject = async (projectId) => {
  const project = await Project.findById(projectId)
    .select('name description createdBy leads theme tasks team')
    .lean();
  if (!project) return null;
  const admin = project.createdBy ? await Profile.findById(project.createdBy).select('name avatar').lean() : null;
  const leads = project.leads?.length
    ? await Profile.find({ _id: { $in: project.leads } }).select('name email avatar').lean()
    : [];
  return {
    _id: project._id, name: project.name, leads,
    theme: project.theme, description: project.description,
    createdBy: admin ? { name: admin.name, avatar: admin.avatar } : null,
    taskCount: project.tasks?.length || 0,
    teamCount: project.team?.length || 0,
  };
};

exports.getJoinedProjects = async (req, res) => {
  try {
    const projects = await Project.find({ team: req.user.id, leads: { $ne: req.user.id } }).select('_id').lean();
    const result = await Promise.all(projects.map((p) => formatProject(p._id)));
    res.status(200).json(result.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Server error while fetching joined projects' });
  }
};

exports.getJoinedProjectsAsLead = async (req, res) => {
  try {
    const projects = await Project.find({ leads: req.user.id }).select('_id').lean();
    const result = await Promise.all(projects.map((p) => formatProject(p._id)));
    res.status(200).json(result.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Server error while fetching led projects' });
  }
};

exports.getProjectDetails = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (!project.team?.length) return res.status(200).json({ project, teamDetails: 'No team members found.' });

    const [profiles, onlineMemberIds] = await Promise.all([
      Profile.find({ _id: { $in: project.team } }).select('name email avatar').lean(),
      require('../socket').getOnlineProjectMembers(req.params.projectId)
    ]);
    const onlineSet = new Set(onlineMemberIds.map(id => id.toString()));

    const profileMap = Object.fromEntries(profiles.map((p) => [p._id.toString(), p]));
    const populatedTeam = project.team.map((id) => {
      const p = profileMap[id.toString()];
      return { 
        _id: id, 
        name: p?.name || 'Name not found', 
        email: p?.email || 'Email not found', 
        avatar: p?.avatar || 'Avatar not found',
        isOnline: onlineSet.has(id.toString())
      };
    });

    res.status(200).json({ project: { ...project, team: populatedTeam } });
  } catch (err) {
    res.status(500).json({ error: 'Server error while fetching project details' });
  }
};
