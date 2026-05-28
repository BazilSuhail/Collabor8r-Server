import { asyncHandler, created, noContent, ok, paged } from '../../utils/http.js';
import * as orgService from './org.service.js';

const actorOf = (req) => ({ id: req.user.id, role: req.orgRole });

export const listMyOrgs = asyncHandler(async (req, res) => {
  ok(res, await orgService.listMyOrgs(req.user.id));
});

export const createOrg = asyncHandler(async (req, res) => {
  created(res, await orgService.createOrg(req.user.id, req.valid.body));
});

export const getOrg = asyncHandler(async (req, res) => {
  ok(res, await orgService.getOrg(req.params.orgId, req.orgRole));
});

export const updateOrg = asyncHandler(async (req, res) => {
  ok(res, await orgService.updateOrg(req.params.orgId, req.valid.body, actorOf(req)));
});

export const deleteOrg = asyncHandler(async (req, res) => {
  await orgService.deleteOrg(req.params.orgId, actorOf(req));
  noContent(res);
});

export const listMembers = asyncHandler(async (req, res) => {
  const page = await orgService.listMembers(req.params.orgId, req.valid.query);
  paged(res, page.items, page.meta);
});

export const changeMemberRole = asyncHandler(async (req, res) => {
  ok(
    res,
    await orgService.changeMemberRole(req.params.orgId, req.params.userId, req.valid.body.role, actorOf(req)),
  );
});

export const removeMember = asyncHandler(async (req, res) => {
  await orgService.removeMember(req.params.orgId, req.params.userId, actorOf(req));
  noContent(res);
});

export const listInvites = asyncHandler(async (req, res) => {
  ok(res, await orgService.listInvites(req.params.orgId));
});

export const createInvite = asyncHandler(async (req, res) => {
  created(res, await orgService.createInvite(req.params.orgId, req.valid.body, actorOf(req)));
});

export const revokeInvite = asyncHandler(async (req, res) => {
  await orgService.revokeInvite(req.params.orgId, req.params.inviteId);
  noContent(res);
});

export const acceptInvite = asyncHandler(async (req, res) => {
  ok(res, await orgService.acceptInvite(req.user.id, req.valid.body.token));
});

export const listJoinRequests = asyncHandler(async (req, res) => {
  const page = await orgService.listJoinRequests(req.params.orgId, req.valid.query);
  paged(res, page.items, page.meta);
});

export const createJoinRequest = asyncHandler(async (req, res) => {
  created(res, await orgService.createJoinRequest(req.params.orgId, req.user.id, req.valid.body));
});

export const decideJoinRequest = asyncHandler(async (req, res) => {
  ok(
    res,
    await orgService.decideJoinRequest(req.params.orgId, req.params.requestId, req.valid.body, req.user.id),
  );
});
