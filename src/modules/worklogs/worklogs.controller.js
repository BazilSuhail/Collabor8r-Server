import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';
import * as svc from './worklogs.service.js';

const atLeast = (role, min) => (PROJECT_ROLE_RANK[role] ?? 0) >= PROJECT_ROLE_RANK[min];

const seesPrivateOf = (req) => atLeast(req.projectRole, 'lead');

export const listWorklogs = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  const { items, meta } = await svc.listWorklogs({ projectId, issueId, query: req.valid.query, viewerId: req.user.id, seesPrivate: seesPrivateOf(req) });
  paged(res, items, meta);
});

export const createWorklog = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.params;
  created(res, await svc.addWorklog({ projectId, issueId, userId: req.user.id, input: req.valid.body, seesPrivate: seesPrivateOf(req) }));
});

export const updateWorklog = asyncHandler(async (req, res) => {
  const { projectId, issueId, worklogId } = req.valid.params;
  const updated = await svc.updateWorklog({
    projectId,
    issueId,
    worklogId,
    input: req.valid.body,
    userId: req.user.id,
    seesPrivate: seesPrivateOf(req),
    isLead: atLeast(req.projectRole, 'lead'),
  });
  ok(res, updated);
});

export const deleteWorklog = asyncHandler(async (req, res) => {
  const { projectId, issueId, worklogId } = req.valid.params;
  await svc.deleteWorklog({
    projectId,
    issueId,
    worklogId,
    userId: req.user.id,
    seesPrivate: seesPrivateOf(req),
    isLead: atLeast(req.projectRole, 'lead'),
  });
  noContent(res);
});

export const listTimesheet = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.timesheet({ projectId: req.params.projectId, query: req.valid.query, viewerId: req.user.id, seesPrivate: seesPrivateOf(req) });
  paged(res, items, meta);
});
