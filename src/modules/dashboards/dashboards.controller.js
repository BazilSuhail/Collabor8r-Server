import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import * as svc from './dashboards.service.js';

export const listDashboards = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listDashboards(req.project._id, req.user.id, req.valid.query);
  paged(res, items, meta);
});

export const createDashboard = asyncHandler(async (req, res) => {
  created(res, await svc.createDashboard(req.project, req.user.id, req.valid.body));
});

export const getDashboard = asyncHandler(async (req, res) => {
  ok(res, await svc.getDashboard(req.project._id, req.user.id, req.params.dashboardId));
});

export const updateDashboard = asyncHandler(async (req, res) => {
  ok(res, await svc.updateDashboard(req.project, req.user.id, req.projectRole, req.params.dashboardId, req.valid.body));
});

export const deleteDashboard = asyncHandler(async (req, res) => {
  await svc.deleteDashboard(req.project._id, req.user.id, req.projectRole, req.params.dashboardId);
  noContent(res);
});

export const listGoals = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listGoals(req.project._id, req.valid.query);
  paged(res, items, meta);
});

export const createGoal = asyncHandler(async (req, res) => {
  created(res, await svc.createGoal(req.project, req.user.id, req.valid.body));
});

export const getGoal = asyncHandler(async (req, res) => {
  ok(res, await svc.getGoal(req.project._id, req.params.goalId));
});

export const updateGoal = asyncHandler(async (req, res) => {
  ok(res, await svc.updateGoal(req.project._id, req.params.goalId, req.valid.body));
});

export const deleteGoal = asyncHandler(async (req, res) => {
  await svc.deleteGoal(req.project._id, req.params.goalId);
  noContent(res);
});

export const recordProgress = asyncHandler(async (req, res) => {
  ok(res, await svc.recordProgress(req.project._id, req.params.goalId, req.valid.body.current));
});
