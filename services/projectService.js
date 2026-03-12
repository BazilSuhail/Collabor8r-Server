const Project = require('../models/projects');
const AdminProject = require('../models/adminProjects');
const JoinProject = require('../models/joinProjects');
const Profile = require('../models/profile');
const Invitation = require('../models/invitation');
const Notification = require('../models/notifications');
const { logActivity } = require('../utils/activityLogger');
const { dispatchWebhook } = require('../utils/webhookDispatcher');
const { sendNotification } = require('./notificationService');
const { sendInvitationEvent } = require('../socket');

async function createProject(data, userId) {
  const { name, description, projectManagerEmail, theme, organizationId } = data;
  console.log(`📋 createProject called — name: "${name}", managerEmail: "${projectManagerEmail || '(none)'}", userId: ${userId}`);

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
    console.log(`🔍 Looking for manager email: "${projectManagerEmail}"`);
    const [pmProfile, sender] = await Promise.all([
      Profile.findOne({ email: projectManagerEmail }).select('_id email'),
      Profile.findById(userId).select('name email avatar'),
    ]);

    if (pmProfile) {
      console.log(`✅ Found manager profile: ${pmProfile.email} (${pmProfile._id})`);
      console.log(`📨 Creating invitation for manager: ${pmProfile.email}`);
      const desc = `${sender?.name || 'Someone'} has invited you as Project Manager for "${name}"`;
      const invite = new Invitation({
        email: pmProfile.email,
        projectId: newProject._id,
        projectName: name,
        projectDescription: description,
        invitedBy: userId,
        type: 'projectManager',
        role: 'manager',
        senderName: sender?.name || 'Someone',
        senderEmail: sender?.email || '',
        senderAvatar: sender?.avatar || '',
        description: desc,
      });
      await invite.save();
      console.log(`✅ Invitation saved with id: ${invite._id}, token: ${invite.token}`);

      sendInvitationEvent(pmProfile._id, invite);
      console.log(`📡 Invitation event sent to ${pmProfile._id}`);

      await sendNotification(pmProfile._id, 'projectManager', {
        projectId: newProject._id,
        projectName: name,
        from: userId,
        senderName: sender?.name || 'Someone',
        senderEmail: sender?.email || '',
        title: `Manager invitation from ${sender?.name || 'Someone'}`,
        description: `${sender?.name || 'Someone'} has invited you as Manager for "${name}"`,
      });
    } else {
      console.log(`❌ Manager profile NOT found for email: "${projectManagerEmail}"`);
    }
  } else {
    console.log(`ℹ️ No projectManagerEmail provided — skipping manager invitation`);
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
    entityName: project.name,
    projectId,
    projectName: project.name,
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
