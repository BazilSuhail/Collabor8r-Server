const Project = require('../models/projects');
const AdminProject = require('../models/adminProjects');
const JoinProject = require('../models/joinProjects');
const Profile = require('../models/profile');
const Invitation = require('../models/invitation');
const Notification = require('../models/notifications');
const { logActivity } = require('../utils/activityLogger');
const { sendNotification } = require('./notificationService');
const { sendInvitationEvent, sendToProjectRoom } = require('../socket');

async function createProject(data, userId) {
  const {
    name, description, leadEmail, theme,
    about, objectives, tags, category, links,
    visibility, status, startDate, targetDate, version, methodology,
  } = data;

  const newProject = new Project({
    name, theme, description,
    createdBy: userId,
    about: about || '',
    objectives: Array.isArray(objectives) ? objectives : [],
    tags: Array.isArray(tags) ? tags : [],
    category: category || 'other',
    links: Array.isArray(links) ? links : [],
    visibility: visibility || 'private',
    status: status || 'planning',
    startDate: startDate || null,
    targetDate: targetDate || null,
    version: version || 'v1.0',
    methodology: methodology || 'sprint',
  });

  await newProject.save();

  let adminProject = await AdminProject.findById(userId);
  if (!adminProject) {
    adminProject = new AdminProject({ _id: userId, projects: [] });
  }
  adminProject.projects.push(newProject._id);
  await adminProject.save();

  if (leadEmail) {
    const [leadProfile, sender] = await Promise.all([
      Profile.findOne({ email: leadEmail }).select('_id email'),
      Profile.findById(userId).select('name email avatar'),
    ]);

    if (leadProfile) {
      newProject.leads.push(leadProfile._id);
      await newProject.save();

      const desc = `${sender?.name || 'Someone'} has invited you as Project Lead for "${name}"`;
      const invite = new Invitation({
        email: leadProfile.email,
        projectId: newProject._id,
        projectName: name,
        projectDescription: description,
        invitedBy: userId,
        type: 'projectLead',
        role: 'lead',
        senderName: sender?.name || 'Someone',
        senderEmail: sender?.email || '',
        senderAvatar: sender?.avatar || '',
        description: desc,
      });
      await invite.save();

      sendInvitationEvent(leadProfile._id, invite);

      await sendNotification(leadProfile._id, 'projectLead', {
        projectId: newProject._id,
        projectName: name,
        from: userId,
        senderName: sender?.name || 'Someone',
        senderEmail: sender?.email || '',
        title: `Lead invitation from ${sender?.name || 'Someone'}`,
        description: `${sender?.name || 'Someone'} has invited you as Lead for "${name}"`,
      });
    }
  }

  await logActivity({
    actorId: userId,
    action: 'created',
    entityType: 'project',
    entityId: newProject._id,
    entityName: name,
    projectId: newProject._id,
    projectName: name,
    description: `Project "${name}" created`,
  });

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
    entityName: project.name,
    projectId,
    projectName: project.name,
    description: `Member added to project "${project.name}"`,
  });

  sendToProjectRoom(String(projectId), 'member:added', {
    projectId,
    memberId,
    projectName: project.name,
    actor: { userId },
    timestamp: Date.now(),
  });

  return project;
}

module.exports = { createProject, addTeamMember };
