import { asyncHandler, ok } from '../../utils/http.js';
import { PROJECT_ROLE_RANK } from '../../config/constants.js';
import * as svc from './boardhub.service.js';

export const listProjects = asyncHandler(async (req, res) => {
  ok(res, await svc.listBoardProjects(req.user.id));
});

export const saveOrder = asyncHandler(async (req, res) => {
  ok(res, await svc.saveOrder(req.user.id, req.valid.body.projectIds));
});

export const projectIssues = asyncHandler(async (req, res) => {
  const seesPrivate = (PROJECT_ROLE_RANK[req.projectRole] ?? 0) >= PROJECT_ROLE_RANK.lead;
  ok(res, await svc.projectBoard({ project: req.project, viewerId: req.user.id, seesPrivate }));
});
