import { asyncHandler, created, noContent, ok, paged } from '../../utils/http.js';
import * as svc from './sprints.service.js';

export const listSprints = asyncHandler(async (req, res) => {
  const page = await svc.listSprints({ projectId: req.project._id, query: req.valid.query });
  paged(res, page.items, page.meta);
});

export const getSprint = asyncHandler(async (req, res) => {
  ok(res, await svc.assertSprintInProject(req.project._id, req.params.sprintId));
});

export const createSprint = asyncHandler(async (req, res) => {
  created(res, await svc.createSprint({ project: req.project, input: req.valid.body, actorId: req.user.id }));
});

export const updateSprint = asyncHandler(async (req, res) => {
  ok(res, await svc.updateSprint({ projectId: req.project._id, sprintId: req.params.sprintId, input: req.valid.body }));
});

export const startSprint = asyncHandler(async (req, res) => {
  ok(res, await svc.startSprint({ project: req.project, sprintId: req.params.sprintId, input: req.valid.body, actorId: req.user.id }));
});

export const completeSprint = asyncHandler(async (req, res) => {
  ok(res, await svc.completeSprint({ project: req.project, sprintId: req.params.sprintId, input: req.valid.body, actorId: req.user.id }));
});

export const deleteSprint = asyncHandler(async (req, res) => {
  await svc.deleteSprint({ projectId: req.project._id, sprintId: req.params.sprintId });
  noContent(res);
});
