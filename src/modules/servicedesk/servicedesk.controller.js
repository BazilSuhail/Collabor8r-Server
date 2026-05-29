import { asyncHandler, ok, created, paged } from '../../utils/http.js';
import * as svc from './servicedesk.service.js';
import { canSeePrivateIssues } from '../../services/visibility.service.js';

export const listSlaTimers = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listSlaTimers(req.project._id, req.valid.query);
  paged(res, items, meta);
});

export const pauseTimer = asyncHandler(async (req, res) => {
  ok(res, await svc.setTimerPaused(req.project._id, req.params.timerId, true));
});

export const resumeTimer = asyncHandler(async (req, res) => {
  ok(res, await svc.setTimerPaused(req.project._id, req.params.timerId, false));
});

export const listApprovals = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listApprovals(req.project._id, req.params.issueId, req.valid.query, req.user.id, canSeePrivateIssues(req.projectRole));
  paged(res, items, meta);
});

export const requestApprovals = asyncHandler(async (req, res) => {
  created(res, await svc.requestApprovals(req.project, req.user.id, req.params.issueId, req.valid.body.approverIds, canSeePrivateIssues(req.projectRole)));
});

export const decideApproval = asyncHandler(async (req, res) => {
  const { decision, comment } = req.valid.body;
  ok(res, await svc.decideApproval(req.project._id, req.user.id, req.params.approvalId, decision, comment));
});
