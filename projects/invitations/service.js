// Single writer for invitations: send (email or userId), token accept/decline, projectId join.
// All HTTP paths (email invite, admin invite, token accept, direct join) funnel here.
const { Invitation } = require('./models');
const { Profile } = require('../../auth/models');
const { Project } = require('../models');
const { logActivity } = require('../../utils/activityLogger');
const { sendInvitationEvent } = require('../../socket');
const { sendNotification } = require('../../notifications/service');

async function sendInvitation({
  email,
  userId,
  projectId,
  invitedBy,
  role = 'member',
  type,
  message = '',
  projectName: forcedName,
  projectDescription: forcedDesc,
  notifyType,
}) {
  // Privilege restriction: an invitation may only ever grant 'lead' or member
  // ('joined' is an alias) — never 'admin'. Bad input is a 400, not a mongoose 500.
  if (role === 'joined') role = 'member';
  if (role !== 'member' && role !== 'lead') {
    throw Object.assign(new Error("role must be 'lead' or 'member'"), { code: 'INVALID_ROLE' });
  }
  if (type == null || type === '') type = role === 'lead' ? 'projectLead' : 'teamMember';
  if (type !== 'teamMember' && type !== 'projectLead') {
    throw Object.assign(new Error("type must be 'teamMember' or 'projectLead'"), { code: 'INVALID_TYPE' });
  }
  if (notifyType == null || notifyType === '') notifyType = type;

  let targetEmail = email;
  let targetUserId = userId;

  if (userId && !email) {
    const u = await Profile.findById(userId).select('name email avatar');
    if (!u) throw new Error('No user found with this id');
    targetEmail = u.email;
  }

  targetEmail = String(targetEmail).toLowerCase().trim();

  const existing = await Invitation.findOne({ email: targetEmail, projectId, status: 'pending' });
  if (existing) throw Object.assign(new Error('Invitation already pending'), { code: 'DUPLICATE' });

  const [sender, project] = await Promise.all([
    Profile.findById(invitedBy).select('name email avatar'),
    Project.findById(projectId).select('name description'),
  ]);

  if (!project) throw new Error('Project not found');

  const customMsg = message ? ` — ${message}` : '';
  const desc = type === 'projectLead'
    ? `${sender?.name || 'Someone'} has invited you as Project Lead for "${project.name}"${customMsg}`
    : `${sender?.name || 'Someone'} has invited you to join "${project.name}"${customMsg}`;

  const invite = new Invitation({
    email: targetEmail,
    projectId,
    projectName: forcedName || project.name,
    projectDescription: forcedDesc || project.description,
    invitedBy,
    type,
    role,
    senderName: sender?.name || 'Someone',
    senderEmail: sender?.email || '',
    senderAvatar: sender?.avatar || '',
    description: type === 'projectLead' ? `${sender?.name || 'Someone'} has invited you as Project Lead for "${project.name}"` : desc,
  });
  await invite.save();

  const invitedUser = targetUserId
    ? { _id: targetUserId }
    : await Profile.findOne({ email: targetEmail }).select('_id');
  if (invitedUser) sendInvitationEvent(invitedUser._id, invite);

  // Consistent notification across email and userId invite paths.
  if (invitedUser) {
    await sendNotification(invitedUser._id, notifyType, {
      projectId,
      projectName: project.name,
      from: invitedBy,
      senderName: sender?.name || 'Someone',
      senderEmail: sender?.email || '',
      title: `Project invitation from ${sender?.name || 'Someone'}`,
      description: `${sender?.name || 'Someone'} has invited you to join "${project.name}"${message ? ': ' + message : ''}`,
    });
  }

  await logActivity({
    actorId: invitedBy,
    action: 'invited',
    entityType: 'invitation',
    entityId: invite._id,
    entityName: targetEmail,
    projectId,
    projectName: project.name,
    description: `${sender?.name || 'Someone'} invited ${targetEmail} to "${project.name}"`,
  });

  return invite;
}

// Security: only the invited user may respond to their invitation —
// otherwise anyone holding the token could accept/decline it for someone else.
async function assertCallerIsInvitee(invite, userId) {
  const caller = await Profile.findById(userId).select('email');
  const callerEmail = String(caller?.email || '').toLowerCase();
  if (!callerEmail || callerEmail !== String(invite.email).toLowerCase()) {
    throw Object.assign(new Error('This invitation belongs to another user'), { code: 'FORBIDDEN' });
  }
}

// Token-based accept: validates invite, adds team membership, optional lead role.
async function acceptByToken(token, userId) {
  const invite = await Invitation.findOne({ token, status: 'pending' });
  if (!invite) throw Object.assign(new Error('Invitation not found or expired'), { code: 'NOT_FOUND' });
  await assertCallerIsInvitee(invite, userId);
  if (invite.expiresAt && new Date() > invite.expiresAt) {
    invite.status = 'expired';
    await invite.save();
    throw Object.assign(new Error('Invitation expired'), { code: 'EXPIRED' });
  }

  if (invite.projectId) {
    const profile = await Profile.findOne({ email: invite.email });
    if (profile) {
      const { addTeamMember, acceptLeadRole } = require('../service');
      await addTeamMember(invite.projectId, profile._id, userId, { idempotent: true });

      if (invite.role === 'lead') {
        await acceptLeadRole(invite.projectId, profile._id, userId);
      }
    }
  }

  invite.status = 'accepted';
  invite.respondedAt = new Date();
  await invite.save();

  await logActivity({
    actorId: userId,
    action: 'accepted',
    entityType: 'invitation',
    entityId: invite._id,
    entityName: invite.email,
    projectId: invite.projectId,
    projectName: invite.projectName,
    description: `Invitation accepted by ${invite.email} for "${invite.projectName}"`,
  });

  if (invite.invitedBy) {
    await sendNotification(invite.invitedBy, 'invitationResponse', {
      invitationId: invite._id,
      projectId: invite.projectId,
      projectName: invite.projectName,
      email: invite.email,
      response: 'accepted',
      message: `${invite.senderName || 'Someone'} accepted the invitation to "${invite.projectName}"`,
    });
  }

  return invite;
}

async function declineByToken(token, userId) {
  const invite = await Invitation.findOne({ token, status: 'pending' });
  if (!invite) throw Object.assign(new Error('Invitation not found'), { code: 'NOT_FOUND' });
  await assertCallerIsInvitee(invite, userId);

  invite.status = 'declined';
  invite.respondedAt = new Date();
  await invite.save();

  await logActivity({
    actorId: userId,
    action: 'declined',
    entityType: 'invitation',
    entityId: invite._id,
    entityName: invite.email,
    projectId: invite.projectId,
    projectName: invite.projectName,
    description: `Invitation declined by ${invite.email} for "${invite.projectName}"`,
  });

  if (invite.invitedBy) {
    await sendNotification(invite.invitedBy, 'invitationResponse', {
      invitationId: invite._id,
      projectId: invite.projectId,
      projectName: invite.projectName,
      email: invite.email,
      response: 'declined',
      message: `${invite.senderName || 'Someone'} declined the invitation to "${invite.projectName}"`,
    });
  }

  return invite;
}

// Direct projectId join (no token): idempotent team + membership write.
async function joinByProjectId(projectId, userId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const { addTeamMember } = require('../service');
  await addTeamMember(projectId, userId, userId, { idempotent: true });

  await logActivity({
    actorId: userId,
    action: 'accepted',
    entityType: 'invitation',
    entityId: projectId,
    entityName: project.name,
    projectId,
    projectName: project.name,
    description: `User joined project "${project.name}"`,
  });

  return project;
}

module.exports = {
  sendInvitation,
  acceptByToken,
  declineByToken,
  joinByProjectId,
};
