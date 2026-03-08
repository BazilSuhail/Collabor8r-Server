const Project = require('../models/projects');
const AdminProject = require('../models/adminProjects');
const JoinProject = require('../models/joinProjects');
const Profile = require('../models/profile');
const Notification = require('../models/notifications');
const { logActivity } = require('../utils/activityLogger');
const { dispatchWebhook } = require('../utils/webhookDispatcher');
const { sendNotification } = require('./notificationService');

async function createProject(data, userId) {
  const { name, description, projectManagerEmail, theme, organizationId } = data;

  const newProject = new Project({
    name, theme, description,
    createdBy: userId,
    projectManager: { email: projectManagerEmail || '', status: 'Pending' },
    organizationId,
  });

  await newProject.save();

  let adminProject = await AdminProject.findById(userId);
  if (!adminProject) {
    adminProject = new AdminProject({ _id: userId, projects: [] });
  }
  adminProject.projects.push(newProject._id);
  await adminProject.save();

  if (projectManagerEmail) {
    const pmProfile = await Profile.findOne({ email: projectManagerEmail });
    if (pmProfile) {
      await sendNotification(pmProfile._id, 'projectManager', {
        description: `You have been assigned as project manager for "${name}"`,
        from: userId,
        projectId: newProject._id,
      });
    }
  }

  await logActivity({
    actorId: userId,
    action: 'created',
    entityType: 'project',
    entityId: newProject._id,
    projectId: newProject._id,
    description: `Project "${name}" created`,
  });

  await dispatchWebhook('project.created', { project: newProject });

  return newProject;
}

async function addTeamMember(projectId, memberId, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const alreadyInTeam = project.team.some((m) => String(m) === String(memberId));
  if (alreadyInTeam) throw new Error('User already in team');

  project.team.push(memberId);
  await project.save();

  let joinProject = await JoinProject.findById(memberId);
  if (!joinProject) {
    joinProject = new JoinProject({ _id: memberId, projects: [projectId] });
    await joinProject.save();
  } else if (!joinProject.projects.includes(projectId)) {
    joinProject.projects.push(projectId);
    await joinProject.save();
  }

  await logActivity({
    actorId: userId,
    action: 'updated',
    entityType: 'project',
    entityId: projectId,
    projectId,
    description: `Member added to project "${project.name}"`,
  });

  return project;
}

async function setProjectRole(projectId, memberId, role, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  if (!project.roles) project.roles = [];
  const existing = project.roles.find((r) => String(r.userId) === String(memberId));
  if (existing) {
    existing.role = role;
  } else {
    project.roles.push({ userId: memberId, role });
  }

  await project.save();
  return project;
}

module.exports = { createProject, addTeamMember, setProjectRole };
