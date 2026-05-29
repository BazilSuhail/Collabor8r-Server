// Role resolution for orgs and projects, shared by guards and services.
import { OrgMember, Project, ProjectMember, ProjectRole } from '../models/index.js';
import {
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
  ORG_ROLE_RANK,
  PROJECT_ROLES,
  PROJECT_ROLE_RANK,
} from '../config/constants.js';

export const getOrgRole = async (userId, orgId) => {
  const member = await OrgMember.findOne({ orgId, userId, status: 'active' }).select('role').lean();
  return member?.role ?? null;
};

// Highest system role whose default permissions are all granted.
const roleFromPerms = (perms) => {
  const granted = new Set(perms);
  return (
    PROJECT_ROLES.find((role) => DEFAULT_PROJECT_ROLE_PERMISSIONS[role].every((p) => granted.has(p))) ??
    'guest'
  );
};

const accessFor = (project, role, perms, orgRole) => ({
  project,
  role,
  rank: PROJECT_ROLE_RANK[role],
  perms,
  orgRole,
});

const systemAccess = (project, role, orgRole) =>
  accessFor(project, role, DEFAULT_PROJECT_ROLE_PERMISSIONS[role], orgRole);

// Returns { project, role, rank, perms, orgRole } or null when the caller has no access.
export const getProjectAccess = async (userId, projectId) => {
  const project = await Project.findById(projectId).lean();
  if (!project) return null;

  if (!project.orgId) {
    return String(project.ownerId) === String(userId) ? systemAccess(project, 'admin', null) : null;
  }

  const [orgRole, membership] = await Promise.all([
    getOrgRole(userId, project.orgId),
    ProjectMember.findOne({ projectId, userId, status: 'active' }).select('role').lean(),
  ]);

  if (membership) {
    const roleValue = String(membership.role);
    if (PROJECT_ROLES.includes(roleValue)) return systemAccess(project, roleValue, orgRole);
    const custom = await ProjectRole.findById(roleValue).select('permissions name').lean();
    const perms = custom?.permissions ?? [];
    return { ...accessFor(project, roleFromPerms(perms), perms, orgRole), roleName: custom?.name };
  }

  if (orgRole === 'owner' || orgRole === 'admin') return systemAccess(project, 'admin', orgRole);
  if (project.visibility === 'open' && ORG_ROLE_RANK[orgRole] >= ORG_ROLE_RANK.member) {
    return systemAccess(project, 'viewer', orgRole);
  }
  return null;
};

// Project ids the user can read; used by cross-project views such as my-work.
export const listAccessibleProjectIds = async (userId) => {
  const [personal, memberships, orgMemberships] = await Promise.all([
    Project.find({ ownerId: userId, orgId: null }).select('_id').lean(),
    ProjectMember.find({ userId, status: 'active' }).select('projectId').lean(),
    OrgMember.find({ userId, status: 'active' }).select('orgId role').lean(),
  ]);

  const adminOrgs = orgMemberships
    .filter((m) => m.role === 'owner' || m.role === 'admin')
    .map((m) => m.orgId);
  const memberOrgs = orgMemberships
    .filter((m) => ORG_ROLE_RANK[m.role] >= ORG_ROLE_RANK.member)
    .map((m) => m.orgId);
  const orgProjects = await Project.find({
    $or: [{ orgId: { $in: adminOrgs } }, { orgId: { $in: memberOrgs }, visibility: 'open' }],
  })
    .select('_id')
    .lean();

  const ids = new Map();
  for (const id of [
    ...personal.map((p) => p._id),
    ...memberships.map((m) => m.projectId),
    ...orgProjects.map((p) => p._id),
  ]) {
    ids.set(String(id), id);
  }
  return [...ids.values()];
};
