import { asyncHandler, created, noContent, ok, paged } from '../../utils/http.js';
import * as svc from './project.service.js';

export const listOrgProjects = asyncHandler(async (req, res) => {
  const page = await svc.listOrgProjects({ orgId: req.org._id, userId: req.user.id, orgRole: req.orgRole, query: req.valid.query });
  paged(res, page.items, page.meta);
});

export const createOrgProject = asyncHandler(async (req, res) => {
  const project = await svc.createOrgProject({ orgId: req.org._id, userId: req.user.id, input: req.valid.body, req });
  created(res, project);
});

export const listPersonalProjects = asyncHandler(async (req, res) => {
  ok(res, await svc.listPersonalProjects(req.user.id));
});

export const createPersonalProject = asyncHandler(async (req, res) => {
  created(res, await svc.createPersonalProject({ userId: req.user.id, input: req.valid.body }));
});

export const getProject = asyncHandler(async (req, res) => {
  ok(res, {
    ...req.project,
    myAccess: { role: req.projectRole, roleName: req.projectRoleName ?? req.projectRole, perms: req.projectPerms, orgRole: req.projectOrgRole },
  });
});

export const updateProject = asyncHandler(async (req, res) => {
  ok(res, await svc.updateProject({ project: req.project, input: req.valid.body, actorId: req.user.id, req }));
});

export const archiveProject = asyncHandler(async (req, res) => {
  await svc.archiveProject({ project: req.project, req });
  noContent(res);
});

export const restoreProject = asyncHandler(async (req, res) => {
  await svc.restoreProject({ project: req.project, req });
  noContent(res);
});

export const listProjectMembers = asyncHandler(async (req, res) => {
  const page = await svc.listProjectMembers({ projectId: req.project._id, query: req.valid.query });
  paged(res, page.items, page.meta);
});

export const addProjectMember = asyncHandler(async (req, res) => {
  created(res, await svc.addProjectMember({ project: req.project, input: req.valid.body, actorId: req.user.id, req }));
});

export const changeProjectRole = asyncHandler(async (req, res) => {
  ok(res, await svc.changeProjectRole({ project: req.project, userId: req.params.userId, input: req.valid.body, req }));
});

export const removeProjectMember = asyncHandler(async (req, res) => {
  await svc.removeProjectMember({ project: req.project, userId: req.params.userId, req });
  noContent(res);
});

export const listProjectInvites = asyncHandler(async (req, res) => {
  const page = await svc.listProjectInvites({ projectId: req.project._id, query: req.valid.query });
  paged(res, page.items, page.meta);
});

export const createProjectInvite = asyncHandler(async (req, res) => {
  created(res, await svc.createProjectInvite({ project: req.project, input: req.valid.body, actorId: req.user.id }));
});

export const revokeProjectInvite = asyncHandler(async (req, res) => {
  await svc.revokeProjectInvite({ projectId: req.project._id, inviteId: req.params.inviteId });
  noContent(res);
});

export const acceptProjectInvite = asyncHandler(async (req, res) => {
  ok(res, await svc.acceptProjectInvite({ token: req.valid.body.token, user: req.user, req }));
});

export const createJoinRequest = asyncHandler(async (req, res) => {
  created(res, await svc.createJoinRequest({ projectId: req.params.projectId, userId: req.user.id, input: req.valid.body }));
});

export const listJoinRequests = asyncHandler(async (req, res) => {
  const page = await svc.listJoinRequests({ projectId: req.project._id, query: req.valid.query });
  paged(res, page.items, page.meta);
});

export const decideJoinRequest = asyncHandler(async (req, res) => {
  ok(res, await svc.decideJoinRequest({ project: req.project, requestId: req.params.requestId, input: req.valid.body, actorId: req.user.id, req }));
});
