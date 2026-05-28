import { asyncHandler, ok, created, noContent, paged, ApiError } from '../../utils/http.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';
import * as svc from './issue.service.js';

const atLeast = (role, min) => (PROJECT_ROLE_RANK[role] ?? 0) >= PROJECT_ROLE_RANK[min];

export const listIssues = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.searchIssues({
    projectId: req.params.projectId,
    query: req.valid.query,
    viewerId: req.user.id,
    seesPrivate: atLeast(req.projectRole, 'lead'),
  });
  paged(res, items, meta);
});

export const createIssue = asyncHandler(async (req, res) => {
  const issue = await svc.createIssueInternal({
    projectId: req.params.projectId,
    reporterId: req.user.id,
    input: req.valid.body,
    source: 'api',
  });
  created(res, issue);
});

export const getIssue = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.valid.params;
  const issue = await svc.getIssueInProject(projectId, issueId);
  svc.assertVisible(issue, req.user.id, atLeast(req.projectRole, 'lead'));
  ok(res, issue);
});

export const getIssueByKey = asyncHandler(async (req, res) => {
  const { projectId, key } = req.valid.params;
  const issue = await svc.getIssueByKey(projectId, key);
  svc.assertVisible(issue, req.user.id, atLeast(req.projectRole, 'lead'));
  ok(res, issue);
});

export const updateIssue = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.valid.params;
  const { version, ...patch } = req.valid.body;
  const issue = await svc.getIssueInProject(projectId, issueId);
  svc.assertVisible(issue, req.user.id, atLeast(req.projectRole, 'lead'));
  const canEdit = atLeast(req.projectRole, 'developer') || String(issue.reporterId) === req.user.id;
  if (!canEdit) throw new ApiError(403, 'Insufficient project role');
  const updated = await svc.updateIssueInternal({
    projectId,
    issueId,
    patch,
    expectedVersion: version,
    actorId: req.user.id,
  });
  ok(res, updated);
});

export const transitionIssue = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.valid.params;
  const { transitionId, toStatus, fields } = req.valid.body;
  const issue = await svc.getIssueInProject(projectId, issueId);
  svc.assertVisible(issue, req.user.id, atLeast(req.projectRole, 'lead'));
  const updated = await svc.transitionIssueInternal({
    projectId,
    issueId,
    transitionId,
    toStatus,
    actorId: req.user.id,
    fields: fields ?? {},
    req,
  });
  ok(res, updated);
});

export const deleteIssue = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.valid.params;
  await svc.deleteIssue({ projectId, issueId, actorId: req.user.id });
  noContent(res);
});

export const bulkUpdate = asyncHandler(async (req, res) => {
  const { issueIds, patch } = req.valid.body;
  const result = await svc.bulkUpdate({
    projectId: req.params.projectId,
    issueIds,
    patch,
    actorId: req.user.id,
    seesPrivate: atLeast(req.projectRole, 'lead'),
  });
  ok(res, result);
});

export const listChildren = asyncHandler(async (req, res) => {
  const { projectId, issueId } = req.valid.params;
  ok(res, await svc.listChildren(projectId, issueId, req.user.id, atLeast(req.projectRole, 'lead')));
});
