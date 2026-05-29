import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/http.js';
import { escapeRegex, hashToken, randomToken } from '../../utils/helpers.js';
import { paginate } from '../../utils/pagination.js';
import { DEFAULT_PROJECT_ROLE_PERMISSIONS, PROJECT_ROLES } from '../../config/constants.js';
import { emitEvent } from '../../services/events.service.js';
import { notify } from '../../services/notify.service.js';
import { actorOf, logActivity } from '../../services/activity.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { issueCounterId } from '../../services/counter.service.js';
import Project from '../../models/project/projects.model.js';
import ProjectMember from '../../models/project/projectMembers.model.js';
import ProjectInvite from '../../models/project/projectInvites.model.js';
import ProjectJoinRequest from '../../models/project/projectJoinRequests.model.js';
import ProjectRole from '../../models/project/projectRoles.model.js';
import IssueType from '../../models/project/issueTypes.model.js';
import Priority from '../../models/project/priorities.model.js';
import Resolution from '../../models/project/resolutions.model.js';
import Workflow from '../../models/project/workflows.model.js';
import Board from '../../models/project/boards.model.js';
import Counter from '../../models/system/counters.model.js';
import OrgMember from '../../models/org/orgMembers.model.js';
import Organization from '../../models/org/organizations.model.js';
import User from '../../models/user/users.model.js';
import { sendEmail } from '../../email/client.js';
import { projectInviteEmail } from '../../email/templates/projectInvite.js';
import { sendJoinRequestReceived } from '../../email/dispatch/joinRequestReceived.js';
import { sendJoinRequestDecided } from '../../email/dispatch/joinRequestDecided.js';
import { sendAddedToProject } from '../../email/dispatch/addedToProject.js';
import { sendRoleChanged } from '../../email/dispatch/roleChanged.js';
import { logger } from '../../utils/logger.js';
import { addOrgMember, ensureOrgMember } from '../org/org.service.js';
import { getPublicUsers } from '../user/user.service.js';
import { bumpRoleMemberCount, resolveRoleValue } from '../roles/roles.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const newId = () => new mongoose.Types.ObjectId();

async function snapshotUser(userId) {
  const info = (await getPublicUsers([String(userId)])).get(String(userId));
  return { name: info?.displayName ?? '', avatar: info?.avatar ?? '', email: info?.email ?? '' };
}

function projectFields(input) {
  return {
    name: input.name,
    key: input.key.toUpperCase(),
    description: input.description ?? '',
    headline: input.headline ?? '',
    template: input.template ?? 'scrum',
    visibility: input.visibility ?? 'private',
    defaultView: input.defaultView ?? 'board',
    icon: input.icon ?? '',
    color: input.color ?? '',
    themeKey: input.themeKey ?? null,
    startDate: input.startDate,
    targetDate: input.targetDate,
  };
}

async function assertNotLastAdmin(projectId) {
  const admins = await ProjectMember.countDocuments({ projectId, role: 'admin', status: 'active' });
  if (admins <= 1) throw new ApiError(409, 'Project must keep at least one admin');
}

// Creates system roles, default config, a live workflow and a board for a new project.
export async function seedProjectDefaults(project, _ownerId) {
  const projectId = project._id;
  await ProjectRole.insertMany(PROJECT_ROLES.map((name) => ({
    projectId,
    name,
    description: '',
    color: '',
    permissions: DEFAULT_PROJECT_ROLE_PERMISSIONS[name] ?? [],
    isSystem: true,
    memberCount: 0,
  })));
  const types = await IssueType.insertMany([
    { name: 'Epic', hierarchy: 'epic', sortOrder: 0, isDefault: false },
    { name: 'Story', hierarchy: 'story', sortOrder: 1, isDefault: false },
    { name: 'Task', hierarchy: 'task', sortOrder: 2, isDefault: true },
    { name: 'Subtask', hierarchy: 'subtask', sortOrder: 3, isDefault: false },
  ].map((t) => ({ ...t, projectId })));
  const priorities = await Priority.insertMany([
    { name: 'Highest', rank: 1, isDefault: false },
    { name: 'High', rank: 2, isDefault: false },
    { name: 'Medium', rank: 3, isDefault: true },
    { name: 'Low', rank: 4, isDefault: false },
    { name: 'Lowest', rank: 5, isDefault: false },
  ].map((p) => ({ ...p, projectId, icon: '', color: '' })));
  const resolutions = await Resolution.insertMany([
    { name: 'Done', countsAsDone: true, sortOrder: 0 },
    { name: 'Wont do', countsAsDone: true, sortOrder: 1 },
    { name: 'Duplicate', countsAsDone: true, sortOrder: 2 },
  ].map((r) => ({ ...r, projectId, description: '' })));
  const doneRes = resolutions[0];

  const st = { todo: newId(), progress: newId(), review: newId(), done: newId() };
  const statuses = [
    { id: st.todo, name: 'To Do', category: 'todo', sortOrder: 0 },
    { id: st.progress, name: 'In Progress', category: 'inprogress', sortOrder: 1 },
    { id: st.review, name: 'In Review', category: 'inprogress', sortOrder: 2 },
    { id: st.done, name: 'Done', category: 'done', sortOrder: 3 },
  ];
  const transition = (name, from, to, postActions = []) => ({
    id: newId(), name, from, to, screenFields: [], requiredFields: [], conditions: [], validators: [], postActions,
  });
  const transitions = [
    transition('Start progress', [st.todo], st.progress),
    transition('Send to review', [st.progress], st.review),
    transition('Return to progress', [st.review], st.progress),
    transition('Done', [st.todo, st.progress, st.review], st.done, [{ type: 'setResolution', resolutionId: doneRes._id }]),
    transition('Reopen', [st.done], st.todo, [{ type: 'clearResolution' }]),
  ];
  await Workflow.create({ projectId, name: 'Default workflow', description: '', status: 'live', version: 1, statuses, transitions });

  const board = await Board.create({
    projectId,
    name: `${project.name} board`,
    type: project.template === 'kanban' ? 'kanban' : 'scrum',
    columns: statuses.map((s, i) => ({ id: newId(), name: s.name, statusIds: [s.id], wipLimit: null, sortOrder: i })),
    swimlaneBy: 'none',
    showDoneColumn: true,
    isDefault: true,
  });

  await Project.updateOne({ _id: projectId }, {
    $set: {
      defaults: {
        issueTypeId: types.find((t) => t.isDefault)._id,
        priorityId: priorities.find((p) => p.isDefault)._id,
        statusId: st.todo,
        boardId: board._id,
      },
    },
  });
  await Counter.updateOne(
    { _id: issueCounterId(projectId) },
    { $setOnInsert: { seq: 0, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function createOrgProject({ orgId, userId, input, req }) {
  const user = await snapshotUser(userId);
  const project = await Project.create({
    ...projectFields(input),
    scope: 'org',
    orgId,
    ownerId: userId,
    leadId: userId,
    leadName: user.name,
    leadAvatar: user.avatar,
    status: 'active',
  });
  await seedProjectDefaults(project, userId);
  await addMember({ project, userId, role: 'admin', addedBy: userId, relation: 'created', req });
  await ProjectMember.updateOne({ projectId: project._id, userId }, { $set: { isLead: true } });
  return Project.findById(project._id).lean();
}

export async function createPersonalProject({ userId, input }) {
  const user = await snapshotUser(userId);
  const project = await Project.create({
    ...projectFields(input),
    visibility: 'private',
    scope: 'personal',
    orgId: null,
    ownerId: userId,
    leadId: userId,
    leadName: user.name,
    leadAvatar: user.avatar,
    status: 'active',
  });
  await seedProjectDefaults(project, userId);
  return Project.findById(project._id).lean();
}

export function listPersonalProjects(userId) {
  return Project.find({ scope: 'personal', ownerId: userId, status: 'active' }).sort({ name: 1 }).lean();
}

// Org owners and admins see every org project; others see projects they are members of.
export async function listOrgProjects({ orgId, userId, orgRole, query }) {
  const filter = { scope: 'org', orgId, status: query.status ?? 'active' };
  if (!['owner', 'admin'].includes(orgRole)) {
    filter._id = { $in: await ProjectMember.find({ userId, orgId, status: 'active' }).distinct('projectId') };
  }
  if (query.q) filter.name = { $regex: escapeRegex(query.q), $options: 'i' };
  return paginate(Project, filter, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
}

export async function updateProject({ project, input, actorId, req }) {
  const set = { ...input, updatedAt: new Date() };
  if (input.leadId !== undefined) {
    const lead = input.leadId ? await snapshotUser(input.leadId) : { name: '', avatar: '' };
    set.leadName = lead.name;
    set.leadAvatar = lead.avatar;
  }
  if (input.health !== undefined && input.health !== project.health) {
    set.healthUpdatedAt = new Date();
    set.healthUpdatedBy = actorId;
  }
  const keys = Object.keys(input);
  const updated = await Project.findOneAndUpdate({ _id: project._id }, { $set: set }, { returnDocument: 'after', runValidators: true }).lean();
  if (!updated) throw new ApiError(404, 'Project not found');
  const before = Object.fromEntries(keys.map((k) => [k, project[k]]));
  const after = Object.fromEntries(keys.map((k) => [k, updated[k]]));
  await writeAudit({ req, orgId: project.orgId ?? null, projectId: project._id, action: 'project.updated', targetType: 'project', targetId: project._id, targetName: updated.name, before, after });
  return updated;
}

export async function archiveProject({ project, req }) {
  const now = new Date();
  await Project.updateOne({ _id: project._id }, { $set: { status: 'archived', archivedAt: now, updatedAt: now } });
  await writeAudit({ req, orgId: project.orgId ?? null, projectId: project._id, action: 'project.archived', targetType: 'project', targetId: project._id, targetName: project.name, before: { status: project.status }, after: { status: 'archived' } });
}

export async function restoreProject({ project, req }) {
  if (project.status !== 'archived') throw new ApiError(409, 'Project is not archived');
  const now = new Date();
  await Project.updateOne({ _id: project._id }, { $set: { status: 'active', updatedAt: now }, $unset: { archivedAt: '' } });
  await writeAudit({ req, orgId: project.orgId ?? null, projectId: project._id, action: 'project.restored', targetType: 'project', targetId: project._id, targetName: project.name, before: { status: 'archived' }, after: { status: 'active' } });
}

export async function getProjectLite(projectId) {
  return Project.findById(projectId).select('key name orgId ownerId').lean();
}

export function listProjectMembers({ projectId, query }) {
  return paginate(ProjectMember, { projectId, status: query.status ?? 'active' }, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
}

// Adds or reactivates a member. Org projects require an active org membership.
async function addMember({ project, userId, role, roleId, addedBy, relation = 'joined', req }) {
  if (project.scope === 'personal') throw new ApiError(422, 'Personal projects have no members');
  if (project.orgId && !(await OrgMember.exists({ orgId: project.orgId, userId, status: 'active' }))) {
    throw new ApiError(422, 'User must be an organization member');
  }
  const current = await ProjectMember.findOne({ projectId: project._id, userId }).lean();
  if (current?.status === 'active') throw new ApiError(409, 'User is already a member');
  const { value } = await resolveRoleValue(project._id, { role, roleId });
  const user = await snapshotUser(userId);
  const orgName = project.orgId ? (await Organization.findById(project.orgId).select('name').lean())?.name ?? '' : '';
  const member = await ProjectMember.findOneAndUpdate(
    { projectId: project._id, userId },
    {
      $set: {
        orgId: project.orgId ?? null,
        role: value,
        status: 'active',
        relation,
        joinedAt: new Date(),
        invitedBy: addedBy ?? null,
        userName: user.name,
        userAvatar: user.avatar,
        projectName: project.name,
        projectKey: project.key,
        projectIcon: project.icon ?? '',
        projectHeadline: project.headline ?? '',
        orgName,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  await bumpRoleMemberCount(project._id, value, 1);
  emitEvent({ type: 'member.added', orgId: project.orgId ?? null, projectId: project._id, actorId: addedBy, payload: { userId: String(userId) }, at: new Date() });
  await logActivity({
    projectId: project._id,
    orgId: project.orgId ?? null,
    kind: 'memberAdded',
    actor: await actorOf({ id: addedBy ?? userId }),
    item: { id: userId, title: user.name },
    summary: `${user.name} joined the project`,
  });
  await writeAudit({ req, orgId: project.orgId ?? null, projectId: project._id, action: 'member.added', targetType: 'projectMember', targetId: member._id, targetName: user.name, before: null, after: { role: value } });
  return member;
}

// Used by org invite acceptance: activates membership for the given projects of the org.
export async function applyOrgInviteProjects({ orgId, userId, projectIds, orgRole, invitedBy }) {
  const role = ['guest', 'viewer'].includes(orgRole) ? 'viewer' : 'developer';
  const projects = await Project.find({ _id: { $in: projectIds }, orgId, status: 'active' }).lean();
  const applied = [];
  for (const project of projects) {
    if (await ProjectMember.exists({ projectId: project._id, userId, status: 'active' })) continue;
    try {
      await addMember({ project, userId, role, addedBy: invitedBy, relation: 'invited' });
      applied.push(String(project._id));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err; // a rejected project must not undo the org membership
    }
  }
  return applied;
}

export async function addProjectMember({ project, input, actorId, req }) {
  const member = await addMember({ project, userId: input.userId, role: input.role, roleId: input.roleId, addedBy: actorId, req });
  if (String(input.userId) !== String(actorId)) {
    const adder = await snapshotUser(actorId).catch(() => ({ name: '' }));
    const added = await snapshotUser(input.userId);
    if (added.email) {
      await sendAddedToProject({
        email: added.email,
        addedByName: adder.name,
        projectName: project.name,
        projectId: String(project._id),
        roleLabel: member.role,
      });
    }
  }
  return member;
}

export async function changeProjectRole({ project, userId, input, req }) {
  const member = await ProjectMember.findOne({ projectId: project._id, userId, status: 'active' }).lean();
  if (!member) throw new ApiError(404, 'Member not found');
  const { value } = await resolveRoleValue(project._id, input);
  if (value === member.role) return member;
  if (member.role === 'admin' && value !== 'admin') await assertNotLastAdmin(project._id);
  await ProjectMember.updateOne({ _id: member._id }, { $set: { role: value, updatedAt: new Date() } });
  await bumpRoleMemberCount(project._id, member.role, -1);
  await bumpRoleMemberCount(project._id, value, 1);
  await writeAudit({ req, orgId: project.orgId ?? null, projectId: project._id, action: 'role.changed', targetType: 'projectMember', targetId: member._id, targetName: String(userId), before: { role: member.role }, after: { role: value } });
  if (String(userId) !== String(req?.user?.id)) {
    const changer = await snapshotUser(req?.user?.id).catch(() => ({ name: '' }));
    const target = await snapshotUser(userId);
    if (target.email) {
      await sendRoleChanged({
        email: target.email,
        changedByName: changer.name,
        projectName: project.name,
        projectId: String(project._id),
        oldRoleLabel: member.role,
        newRoleLabel: value,
      });
    }
  }
  return { ...member, role: value };
}

export async function removeProjectMember({ project, userId, req }) {
  const member = await ProjectMember.findOne({ projectId: project._id, userId, status: 'active' }).lean();
  if (!member) throw new ApiError(404, 'Member not found');
  if (member.role === 'admin') await assertNotLastAdmin(project._id);
  await ProjectMember.updateOne({ _id: member._id }, { $set: { status: 'removed', updatedAt: new Date() } });
  await bumpRoleMemberCount(project._id, member.role, -1);
  emitEvent({ type: 'member.removed', orgId: project.orgId ?? null, projectId: project._id, actorId: req?.user?.id, payload: { userId: String(userId) }, at: new Date() });
  await logActivity({
    projectId: project._id,
    orgId: project.orgId ?? null,
    kind: 'memberRemoved',
    actor: await actorOf({ id: req?.user?.id ?? userId }),
    item: { id: userId, title: member.userName },
    summary: `${member.userName} left the project`,
  });
  await writeAudit({ req, orgId: project.orgId ?? null, projectId: project._id, action: 'member.removed', targetType: 'projectMember', targetId: member._id, targetName: member.userName, before: { role: member.role }, after: null });
}

export function listProjectInvites({ projectId, query }) {
  const filter = { projectId };
  if (query.status) filter.status = query.status;
  return paginate(ProjectInvite, filter, { limit: query.limit ?? 25, cursor: query.cursor ?? null, select: '-tokenHash' });
}

export async function createProjectInvite({ project, input, actorId }) {
  if (project.scope === 'personal') throw new ApiError(422, 'Personal projects cannot take invites');
  const raw = randomToken(24);
  const email = input.email.toLowerCase();
  const target = await User.findOne({ email }).select('_id').lean();
  const actor = await snapshotUser(actorId);
  const invite = await ProjectInvite.create({
    projectId: project._id,
    orgId: project.orgId,
    email,
    userId: target?._id ?? null,
    role: input.role ?? 'developer',
    message: input.message ?? '',
    tokenHash: hashToken(raw),
    invitedBy: actorId,
    invitedByName: actor.name,
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * DAY_MS),
  });
  if (target) {
    await notify({
      userIds: [target._id],
      type: 'invite',
      title: `${actor.name} invited you to ${project.name}`,
      projectId: project._id,
      orgId: project.orgId ?? null,
      link: { kind: 'projectInvite', id: String(invite._id) },
      actorId,
    });
  }
  const { tokenHash, ...publicInvite } = invite.toObject();
  const acceptUrl = `${env.publicBaseUrl}/projects/invites/accept?token=${raw}`;
  try {
    const mail = projectInviteEmail({
      inviterName: actor.name,
      targetName: '',
      projectName: project.name,
      roleLabel: invite.role,
      acceptUrl,
      message: invite.message,
      expiresAt: invite.expiresAt,
    });
    await sendEmail({ to: email, ...mail });
  } catch (err) {
    logger.error('Failed to send project invite email', err);
  }
  return { ...publicInvite, token: raw, acceptUrl };
}

export async function revokeProjectInvite({ projectId, inviteId }) {
  const invite = await ProjectInvite.findOneAndUpdate(
    { _id: inviteId, projectId, status: 'pending' },
    { $set: { status: 'revoked', revokedAt: new Date() } },
  ).lean();
  if (!invite) throw new ApiError(404, 'Pending invite not found');
}

export async function acceptProjectInvite({ token, user, req }) {
  const invite = await ProjectInvite.findOne({
    tokenHash: hashToken(token),
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!invite) throw new ApiError(404, 'Invite not found or expired');
  if (invite.email && invite.email !== String(user.email ?? '').toLowerCase()) {
    throw new ApiError(403, 'This invite was sent to a different email');
  }
  const project = await Project.findById(invite.projectId).lean();
  if (!project || project.status !== 'active') throw new ApiError(404, 'Project not found');
  const claimed = await ProjectInvite.findOneAndUpdate(
    { _id: invite._id, status: 'pending' },
    { $set: { status: 'accepted', acceptedAt: new Date(), userId: user.id } },
  ).lean();
  if (!claimed) throw new ApiError(409, 'Invite already used');
  if (project.orgId && !(await ensureOrgMember(project.orgId, user.id))) {
    await addOrgMember({ orgId: project.orgId, userId: user.id, role: 'guest', invitedBy: invite.invitedBy });
  }
  if (!(await ProjectMember.exists({ projectId: project._id, userId: user.id, status: 'active' }))) {
    await addMember({ project, userId: user.id, role: invite.role ?? 'developer', addedBy: invite.invitedBy, relation: 'invited', req });
  }
  return { projectId: project._id, key: project.key, name: project.name };
}

export async function createJoinRequest({ projectId, userId, input }) {
  const project = await Project.findById(projectId).lean();
  if (!project || project.status !== 'active' || project.scope === 'personal' || project.visibility === 'private') {
    throw new ApiError(404, 'Project not found');
  }
  if (project.orgId && !(await ensureOrgMember(project.orgId, userId))) {
    throw new ApiError(403, 'Join the organization first');
  }
  if (await ProjectMember.exists({ projectId, userId, status: 'active' })) throw new ApiError(409, 'Already a member');
  if (await ProjectJoinRequest.exists({ projectId, userId, status: 'pending' })) throw new ApiError(409, 'Request already pending');
  const user = await snapshotUser(userId);
  const request = await ProjectJoinRequest.create({
    projectId,
    orgId: project.orgId ?? null,
    userId,
    userName: user.name,
    userAvatar: user.avatar,
    message: input.message ?? '',
    requestedRole: input.requestedRole ?? 'developer',
    status: 'pending',
  });
  const admins = await ProjectMember.find({ projectId, role: 'admin', status: 'active' }).distinct('userId');
  if (admins.length) {
    await notify({
      userIds: admins,
      type: 'invite',
      title: `${user.name} requested to join ${project.name}`,
      projectId,
      orgId: project.orgId ?? null,
      link: { kind: 'joinRequest', id: String(request._id) },
      actorId: userId,
    });
  }
  try {
    const recipients = new Set(
      (await ProjectMember.find({ projectId, role: { $in: ['admin', 'lead'] }, status: 'active' }).distinct('userId')).map(String),
    );
    if (project.ownerId) recipients.add(String(project.ownerId));
    recipients.delete(String(userId));
    const adminEmails = [];
    for (const id of recipients) {
      const info = await snapshotUser(id);
      if (info.email) adminEmails.push(info.email);
    }
    if (adminEmails.length) {
      await sendJoinRequestReceived({
        adminEmails,
        requesterName: user.name,
        projectName: project.name,
        projectId: String(project._id),
        message: request.message,
        requestedRole: request.requestedRole,
      });
    }
  } catch (err) {
    logger.error('Failed to send join request emails', err);
  }
  return request.toObject();
}

export function listJoinRequests({ projectId, query }) {
  return paginate(ProjectJoinRequest, { projectId, status: query.status ?? 'pending' }, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
}

export async function decideJoinRequest({ project, requestId, input, actorId, req }) {
  const pending = await ProjectJoinRequest.findOne({ _id: requestId, projectId: project._id, status: 'pending' }).lean();
  if (!pending) throw new ApiError(404, 'Pending join request not found');
  const approve = input.decision === 'approve';
  if (approve && project.orgId && !(await ensureOrgMember(project.orgId, pending.userId))) {
    throw new ApiError(422, 'User is no longer in the organization');
  }
  const claimed = await ProjectJoinRequest.findOneAndUpdate(
    { _id: requestId, status: 'pending' },
    { $set: { status: approve ? 'approved' : 'declined', decidedBy: actorId, decidedAt: new Date(), declineReason: input.declineReason ?? '' } },
    { returnDocument: 'after' },
  ).lean();
  if (!claimed) throw new ApiError(409, 'Join request already decided');
  if (approve) {
    await addMember({ project, userId: pending.userId, role: pending.requestedRole ?? 'developer', addedBy: actorId, relation: 'requested', req });
  }
  await notify({
    userIds: [pending.userId],
    type: 'joinDecision',
    title: `${approve ? 'Approved' : 'Declined'}: ${project.name}`,
    projectId: project._id,
    orgId: project.orgId ?? null,
    link: { kind: 'project', id: String(project._id) },
    actorId,
  });
  if (String(pending.userId) !== String(actorId)) {
    const requester = await snapshotUser(pending.userId);
    if (requester.email) {
      await sendJoinRequestDecided({
        email: requester.email,
        projectName: project.name,
        projectId: String(project._id),
        approved: approve,
        role: pending.requestedRole ?? 'developer',
        declineReason: input.declineReason ?? '',
      });
    }
  }
  return claimed;
}
