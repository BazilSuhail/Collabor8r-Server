import {
  Organization,
  OrgMember,
  OrgInvite,
  OrgJoinRequest,
  OrgGroup,
  User,
  Project,
  ProjectMember,
} from '../../models/index.js';
import { env } from '../../config/env.js';
import { ORG_ROLE_RANK } from '../../config/constants.js';
import { ApiError } from '../../utils/http.js';
import { escapeRegex, hashToken, objectId, pick, randomToken, slugify } from '../../utils/helpers.js';
import { paginate } from '../../utils/pagination.js';
import { sendEmail } from '../../email/client.js';
import { orgInviteEmail } from '../../email/templates/orgInvite.js';
import { logger } from '../../utils/logger.js';
import { notify } from '../../services/notify.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { actorOf } from '../../services/activity.service.js';

const INVITE_TTL_MS = 7 * 86400000;

const memberSnapshot = async (userId) => {
  const u = await User.findById(userId).select('displayName avatarUrl headline').lean();
  return {
    userName: u?.displayName ?? '',
    userAvatar: u?.avatarUrl ?? null,
    userHeadline: u?.headline ?? null,
  };
};

export const orgView = (o, role) => {
  const base = {
    id: String(o._id),
    name: o.name,
    slug: o.slug,
    description: o.description ?? null,
    website: o.website ?? null,
    industry: o.industry ?? null,
    size: o.size ?? null,
    logoUrl: o.logoUrl ?? null,
    coverUrl: o.coverUrl ?? null,
    plan: o.plan,
    ownerId: String(o.ownerId),
    counts: o.counts ?? {},
    createdAt: o.createdAt,
    archivedAt: o.archivedAt ?? null,
    role,
  };
  if (ORG_ROLE_RANK[role] < ORG_ROLE_RANK.admin) return base;
  return {
    ...base,
    billingEmail: o.billingEmail ?? null,
    joinApproval: o.joinApproval,
    projectCreation: o.projectCreation,
    defaultProjectVisibility: o.defaultProjectVisibility,
    verifiedDomains: o.verifiedDomains ?? [],
    require2fa: Boolean(o.require2fa),
    ipAllowlist: o.ipAllowlist ?? [],
    aiEnabled: Boolean(o.aiEnabled),
    aiKeepPromptHashes: Boolean(o.aiKeepPromptHashes),
  };
};

const memberView = (m) => ({
  id: String(m._id),
  userId: String(m.userId),
  role: m.role,
  status: m.status,
  title: m.title ?? null,
  groupIds: (m.groupIds ?? []).map(String),
  userName: m.userName,
  userAvatar: m.userAvatar ?? null,
  userHeadline: m.userHeadline ?? null,
  joinedAt: m.joinedAt ?? null,
  lastActiveAt: m.lastActiveAt ?? null,
});

const inviteView = (i, now = new Date()) => ({
  id: String(i._id),
  email: i.email,
  role: i.role,
  projectIds: (i.projectIds ?? []).map(String),
  invitedByName: i.invitedByName ?? null,
  message: i.message ?? '',
  status: i.status === 'pending' && i.expiresAt && i.expiresAt <= now ? 'expired' : i.status,
  createdAt: i.createdAt ?? null,
  expiresAt: i.expiresAt,
  acceptedAt: i.acceptedAt ?? null,
  revokedAt: i.revokedAt ?? null,
});

const requestView = (r) => ({
  id: String(r._id),
  userId: String(r.userId),
  userName: r.userName ?? '',
  userAvatar: r.userAvatar ?? null,
  userHeadline: r.userHeadline ?? null,
  message: r.message ?? '',
  status: r.status,
  decidedBy: r.decidedBy ? String(r.decidedBy) : null,
  decidedAt: r.decidedAt ?? null,
  declineReason: r.declineReason ?? null,
  createdAt: r.createdAt ?? null,
});

// Used for last-owner and admin checks; actor is { id, role }.
export const isLastOwner = async (orgId, userId) => {
  const isOwner = await OrgMember.exists({ orgId, userId, role: 'owner', status: 'active' });
  if (!isOwner) return false;
  const owners = await OrgMember.countDocuments({ orgId, role: 'owner', status: 'active' });
  return owners <= 1;
};

export const ensureOrgMember = (orgId, userId) =>
  OrgMember.findOne({ orgId, userId, status: 'active' }).lean();

// Adds or reactivates a member. An active member keeps their current role.
export const addOrgMember = async ({ orgId, userId, role, invitedBy = null }) => {
  const existing = await OrgMember.findOne({ orgId, userId });
  if (existing?.status === 'active') return existing.toObject();
  if (existing) {
    existing.role = role;
    existing.status = 'active';
    existing.joinedAt = new Date();
    await existing.save();
    return existing.toObject();
  }
  const member = await OrgMember.create({
    orgId,
    userId,
    role,
    status: 'active',
    joinedAt: new Date(),
    invitedBy,
    ...(await memberSnapshot(userId)),
  });
  await Organization.updateOne({ _id: orgId }, { $inc: { 'counts.members': 1 } });
  return member.toObject();
};

export const listMyOrgs = async (userId) => {
  const memberships = await OrgMember.find({ userId, status: 'active' }).select('orgId role').lean();
  const roleBy = new Map(memberships.map((m) => [String(m.orgId), m.role]));
  const orgs = await Organization.find({ _id: { $in: memberships.map((m) => m.orgId) }, archivedAt: null })
    .select('name slug logoUrl plan')
    .lean();
  return orgs.map((o) => ({
    id: String(o._id),
    name: o.name,
    slug: o.slug,
    logoUrl: o.logoUrl ?? null,
    plan: o.plan,
    role: roleBy.get(String(o._id)),
  }));
};

export const createOrg = async (userId, input) => {
  const base = slugify(input.name) || 'org';
  let slug = base;
  for (let n = 2; await Organization.exists({ slug }); n += 1) slug = `${base}-${n}`;
  const org = await Organization.create({
    name: input.name,
    slug,
    description: input.description,
    industry: input.industry,
    size: input.size,
    ownerId: userId,
    plan: 'free',
    counts: { members: 1, projects: 0 },
  });
  try {
    await OrgMember.create({
      orgId: org._id,
      userId,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
      ...(await memberSnapshot(userId)),
    });
  } catch (err) {
    await Organization.deleteOne({ _id: org._id });
    throw err;
  }
  return orgView(org.toObject(), 'owner');
};

export const getOrg = async (orgId, role) => {
  const org = await Organization.findOne({ _id: orgId, archivedAt: null }).lean();
  if (!org) throw new ApiError(404, 'Organization not found');
  return orgView(org, role);
};

export const updateOrg = async (orgId, patch, actor) => {
  const keys = Object.keys(patch);
  const before = await Organization.findOne({ _id: orgId, archivedAt: null }).lean();
  if (!before) throw new ApiError(404, 'Organization not found');
  const after = await Organization.findByIdAndUpdate(orgId, { $set: patch }, { returnDocument: 'after', runValidators: true }).lean();
  await writeAudit({
    orgId,
    projectId: null,
    action: 'org.updated',
    targetType: 'organization',
    targetId: orgId,
    targetName: after.name,
    before: pick(before, keys),
    after: pick(after, keys),
    actor: await actorOf({ id: actor.id }),
  });
  return orgView(after, actor.role);
};

export const deleteOrg = async (orgId, actor) => {
  const result = await Organization.updateOne({ _id: orgId, archivedAt: null }, { $set: { archivedAt: new Date() } });
  if (!result.matchedCount) throw new ApiError(404, 'Organization not found');
  await writeAudit({
    orgId,
    projectId: null,
    action: 'org.deleted',
    targetType: 'organization',
    targetId: orgId,
    targetName: null,
    before: null,
    after: { archivedAt: new Date() },
    actor: await actorOf({ id: actor.id }),
  });
};

export const listMembers = async (orgId, query) => {
  const filter = { orgId };
  if (query.role) filter.role = query.role;
  if (query.q) filter.userName = new RegExp(escapeRegex(query.q), 'i');
  const page = await paginate(OrgMember, filter, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
  return { items: page.items.map(memberView), meta: page.meta };
};

// Actor is { id, role }. Admins cannot touch admins or owners; only owners grant or revoke owner.
export const changeMemberRole = async (orgId, targetUserId, role, actor) => {
  const target = await OrgMember.findOne({ orgId, userId: targetUserId });
  if (!target) throw new ApiError(404, 'Member not found');
  if ((role === 'owner' || target.role === 'owner') && actor.role !== 'owner') {
    throw new ApiError(403, 'Only owners can grant or revoke the owner role');
  }
  if (actor.role === 'admin' && (role === 'admin' || target.role === 'admin')) {
    throw new ApiError(403, 'Admins cannot change admin roles');
  }
  if (target.role === 'owner' && role !== 'owner' && (await isLastOwner(orgId, targetUserId))) {
    throw new ApiError(409, 'Cannot demote the last owner');
  }
  const before = target.role;
  target.role = role;
  await target.save();
  await writeAudit({
    orgId,
    projectId: null,
    action: 'member.roleChanged',
    targetType: 'orgMember',
    targetId: targetUserId,
    targetName: target.userName,
    before: { role: before },
    after: { role },
    actor: await actorOf({ id: actor.id }),
  });
  return memberView(target.toObject());
};

// Self-removal is allowed for any member; removing others needs admin rank.
export const removeMember = async (orgId, targetUserId, actor) => {
  const target = await OrgMember.findOne({ orgId, userId: targetUserId });
  if (!target) throw new ApiError(404, 'Member not found');
  const self = String(targetUserId) === String(actor.id);
  if (!self) {
    if (ORG_ROLE_RANK[actor.role] < ORG_ROLE_RANK.admin) throw new ApiError(403, 'Insufficient role');
    if (actor.role !== 'owner' && (target.role === 'owner' || target.role === 'admin')) {
      throw new ApiError(403, 'Only owners can remove admins or owners');
    }
  }
  if (target.role === 'owner' && (await isLastOwner(orgId, targetUserId))) {
    throw new ApiError(409, 'Cannot remove the last owner');
  }
  await OrgMember.deleteOne({ _id: target._id });
  const projectIds = await Project.find({ orgId }).distinct('_id');
  await ProjectMember.deleteMany({ userId: targetUserId, projectId: { $in: projectIds } });
  await OrgGroup.updateMany(
    { orgId, memberIds: targetUserId },
    { $pull: { memberIds: targetUserId }, $inc: { memberCount: -1 } },
  );
  await Organization.updateOne({ _id: orgId }, { $inc: { 'counts.members': -1 } });
  await writeAudit({
    orgId,
    projectId: null,
    action: 'member.removed',
    targetType: 'orgMember',
    targetId: targetUserId,
    targetName: target.userName,
    before: { role: target.role },
    after: null,
    actor: await actorOf({ id: actor.id }),
  });
};

export const listInvites = async (orgId) => {
  const invites = await OrgInvite.find({ orgId })
    .sort({ createdAt: -1 })
    .limit(200)
    .select('-tokenHash')
    .lean();
  const now = new Date();
  return invites.map((i) => inviteView(i, now));
};

export const createInvite = async (orgId, input, actor) => {
  if (ORG_ROLE_RANK[input.role] >= ORG_ROLE_RANK.admin && actor.role !== 'owner') {
    throw new ApiError(403, 'Only owners can invite admins');
  }
  const org = await Organization.findOne({ _id: orgId, archivedAt: null }).select('name').lean();
  if (!org) throw new ApiError(404, 'Organization not found');
  const now = new Date();
  if (await OrgInvite.exists({ orgId, email: input.email, status: 'pending', expiresAt: { $gt: now } })) {
    throw new ApiError(409, 'A pending invite already exists for this email');
  }
  const token = randomToken(32);
  const inviter = await User.findById(actor.id).select('displayName').lean();
  const invite = await OrgInvite.create({
    orgId,
    email: input.email,
    role: input.role,
    projectIds: input.projectIds ?? [],
    tokenHash: hashToken(token),
    invitedBy: actor.id,
    invitedByName: inviter?.displayName ?? '',
    message: input.message ?? '',
    status: 'pending',
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
  });
  const existingUser = await User.findOne({ email: input.email }).select('_id').lean();
  if (existingUser) {
    await notify({
      userIds: [existingUser._id],
      type: 'invite',
      title: `You were invited to join ${org.name}`,
      body: input.message,
      orgId,
      actorId: actor.id,
      link: { kind: 'org', id: String(orgId) },
    });
  }
  const acceptUrl = `${env.publicBaseUrl}/invites/accept?token=${token}`;
  try {
    const mail = orgInviteEmail({
      inviterName: invite.invitedByName,
      targetName: '',
      orgName: org.name,
      roleLabel: input.role,
      acceptUrl,
      message: input.message,
      expiresAt: invite.expiresAt,
    });
    await sendEmail({ to: input.email, ...mail });
  } catch (err) {
    logger.error('Failed to send org invite email', err);
  }
  return {
    invite: inviteView(invite.toObject(), now),
    token,
    acceptUrl,
  };
};

export const revokeInvite = async (orgId, inviteId) => {
  const result = await OrgInvite.updateOne(
    { _id: inviteId, orgId, status: 'pending' },
    { $set: { status: 'revoked', revokedAt: new Date() } },
  );
  if (!result.matchedCount) throw new ApiError(404, 'Pending invite not found');
};

// Claims the invite atomically before adding the member; the claim is undone if the add fails.
export const acceptInvite = async (userId, token) => {
  const invite = await OrgInvite.findOne({ tokenHash: hashToken(token) }).lean();
  if (!invite || invite.status !== 'pending') throw new ApiError(404, 'Invite not found or already used');
  if (invite.expiresAt <= new Date()) throw new ApiError(410, 'Invite has expired');
  const user = await User.findById(userId).select('email status').lean();
  if (!user || user.status !== 'active') throw new ApiError(403, 'Account is not active');
  if (invite.email && invite.email !== user.email) {
    throw new ApiError(403, 'This invite was sent to a different email address');
  }
  const claimed = await OrgInvite.findOneAndUpdate(
    { _id: invite._id, status: 'pending' },
    { $set: { status: 'accepted', acceptedAt: new Date() } },
  );
  if (!claimed) throw new ApiError(409, 'Invite already used');
  try {
    const member = await addOrgMember({
      orgId: invite.orgId,
      userId,
      role: invite.role,
      invitedBy: invite.invitedBy,
    });
    // Imported lazily: project.service already depends on this module.
    const { applyOrgInviteProjects } = await import('../project/project.service.js');
    const projects = await applyOrgInviteProjects({
      orgId: invite.orgId,
      userId,
      projectIds: invite.projectIds ?? [],
      orgRole: member.role,
      invitedBy: invite.invitedBy,
    });
    return { orgId: String(invite.orgId), role: member.role, projectIds: projects };
  } catch (err) {
    await OrgInvite.updateOne({ _id: invite._id }, { $set: { status: 'pending', acceptedAt: null } });
    throw err;
  }
};

export const listJoinRequests = async (orgId, query) => {
  const filter = { orgId };
  if (query.status) filter.status = query.status;
  const page = await paginate(OrgJoinRequest, filter, {
    limit: query.limit ?? 25,
    cursor: query.cursor ?? null,
  });
  return { items: page.items.map(requestView), meta: page.meta };
};

// orgRef is an ObjectId or an org slug.
export const createJoinRequest = async (orgRef, userId, input) => {
  const org = objectId.safeParse(orgRef).success
    ? await Organization.findOne({ _id: orgRef, archivedAt: null }).lean()
    : await Organization.findOne({ slug: orgRef, archivedAt: null }).lean();
  if (!org) throw new ApiError(404, 'Organization not found');
  if (await OrgMember.exists({ orgId: org._id, userId, status: 'active' })) {
    throw new ApiError(409, 'Already a member of this organization');
  }
  if (await OrgJoinRequest.exists({ orgId: org._id, userId, status: 'pending' })) {
    throw new ApiError(409, 'A join request is already pending');
  }
  const request = await OrgJoinRequest.create({
    orgId: org._id,
    userId,
    message: input.message ?? '',
    status: 'pending',
    createdAt: new Date(),
    ...(await memberSnapshot(userId)),
  });
  return requestView(request.toObject());
};

export const decideJoinRequest = async (orgId, requestId, input, actorId) => {
  const status = input.decision === 'approve' ? 'approved' : 'declined';
  const request = await OrgJoinRequest.findOneAndUpdate(
    { _id: requestId, orgId, status: 'pending' },
    {
      $set: {
        status,
        decidedBy: actorId,
        decidedAt: new Date(),
        declineReason: input.declineReason ?? null,
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!request) throw new ApiError(404, 'Pending join request not found');
  if (status === 'approved') {
    await addOrgMember({ orgId, userId: request.userId, role: input.role ?? 'member' });
  }
  await notify({
    userIds: [request.userId],
    type: 'joinDecision',
    title: status === 'approved' ? 'Your request to join was approved' : 'Your request to join was declined',
    orgId,
    actorId,
    link: { kind: 'org', id: String(orgId) },
  });
  return requestView(request);
};
