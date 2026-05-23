// Project domain: create (with optional lead invite), membership writes.
// Invitation creation itself lives in ./invitations/service (single writer).
const { Project, Membership } = require('./models');
const { Profile } = require('../auth/models');
const { logActivity } = require('../utils/activityLogger');
const { sendToProjectRoom } = require('../socket');
const { sendInvitation } = require('./invitations/service');

const METHODOLOGIES = ['sprint', 'kanban'];

// String-safe ObjectId array membership (=== fails across ObjectId/string).
const has = (arr, id) => (arr || []).some((x) => String(x) === String(id));

const emptyMembership = (userId) => new Membership({ _id: userId, admin: [], asLead: [], joined: [] });

function normalizeMethodology(value) {
  if (value == null || value === '') return 'sprint';
  const key = String(value).trim().toLowerCase();
  if (METHODOLOGIES.includes(key)) return key;
  if (['scrum', 'scrumfall', 'agile', 'sprints', 'sprint-based'].includes(key)) return 'sprint';
  if (['kanbanboard', 'lean'].includes(key)) return 'kanban';
  return 'sprint';
}

function normalizeTheme(value) {
  if (value == null || value === '') return '/themes/1.jpg';
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    return `/themes/${String(value).replace(/^\/+/, '').replace(/^themes\//, '').replace(/\.jpg$/, '')}.jpg`;
  }
  return String(value);
}

async function createProject(data, userId) {
  const {
    name, description, leadEmail, theme,
    about, objectives, tags, category, links,
    visibility, status, startDate, targetDate, version, methodology,
  } = data;

  // Resolve lead BEFORE construction (Profile emails are stored lowercase).
  let leadProfile = null;
  if (leadEmail) {
    leadProfile = await Profile.findOne({ email: String(leadEmail).toLowerCase().trim() })
      .select('_id email');
  }
  // Creator choosing himself as lead: accepted immediately — no self-invitation.
  const isSelfLead = leadProfile && String(leadProfile._id) === String(userId);

  const newProject = new Project({
    name,
    theme: normalizeTheme(theme),
    description,
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
    methodology: normalizeMethodology(methodology),
    ...(isSelfLead ? { leads: [userId], team: [userId] } : {}),
  });

  await newProject.save();

  // Creator bucket — project goes ONLY into admin (never asLead/joined).
  let membership = await Membership.findById(userId);
  if (!membership) membership = emptyMembership(userId);
  if (!has(membership.admin, newProject._id)) membership.admin.push(newProject._id);
  await membership.save();

  // Other-user lead: invitation ONLY. They enter project.leads (and get lead
  // privileges) via acceptLeadRole — never at invite time.
  if (leadProfile && !isSelfLead) {
    await sendInvitation({
      email: leadProfile.email,
      projectId: newProject._id,
      invitedBy: userId,
      type: 'projectLead',
      role: 'lead',
      message: `invited you as Project Lead for "${name}"`,
      projectName: name,
      projectDescription: description,
      notifyType: 'projectLead',
    });
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

// Sole writer for team membership + Membership.joined bucket
// (except lead role — see acceptLeadRole, which moves joined → asLead).
async function addTeamMember(projectId, memberId, userId, { idempotent = false } = {}) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const alreadyInTeam = has(project.team, memberId);
  if (alreadyInTeam && !idempotent) throw new Error('User already in team');

  if (!alreadyInTeam) {
    project.team.push(memberId);
    await project.save();
  }

  // Sync exclusive bucket (also self-heals on idempotent re-join):
  // creators → admin only, accepted leads stay asLead — everyone else → joined.
  let membership = await Membership.findById(memberId);
  if (!membership) membership = emptyMembership(memberId);
  if (String(project.createdBy) === String(memberId)) {
    if (!has(membership.admin, projectId)) membership.admin.push(projectId);
  } else if (!has(membership.asLead, projectId) && !has(membership.joined, projectId)) {
    membership.joined.push(projectId);
  }
  await membership.save();

  if (alreadyInTeam) return project;

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

// Lead-role accept: adds to project.leads + moves Membership bucket joined → asLead.
// Callers MUST verify a lead invitation first (lead-response route / acceptByToken do).
// Creators keep their exclusive admin bucket — never duplicated into asLead.
async function acceptLeadRole(projectId, userId, actorId) {
  await Project.findByIdAndUpdate(projectId, { $addToSet: { leads: userId } });

  let membership = await Membership.findById(userId);
  if (!membership) membership = emptyMembership(userId);

  if (has(membership.admin, projectId)) {
    // Creator accepting their own lead invite — admin bucket already covers it.
  } else {
    membership.joined = membership.joined.filter((x) => String(x) !== String(projectId));
    if (!has(membership.asLead, projectId)) membership.asLead.push(projectId);
  }
  await membership.save();

  return true;
}

module.exports = {
  createProject,
  addTeamMember,
  acceptLeadRole,
  normalizeMethodology,
  normalizeTheme,
  METHODOLOGIES,
};
