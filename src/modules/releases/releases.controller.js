import { asyncHandler, created, noContent, ok, paged } from '../../utils/http.js';
import * as svc from './releases.service.js';

export const listReleases = asyncHandler(async (req, res) => {
  const page = await svc.listReleases({ projectId: req.project._id, query: req.valid.query });
  paged(res, page.items, page.meta);
});

export const getRelease = asyncHandler(async (req, res) => {
  ok(res, await svc.getRelease({ projectId: req.project._id, releaseId: req.params.releaseId }));
});

export const createRelease = asyncHandler(async (req, res) => {
  created(res, await svc.createRelease({ projectId: req.project._id, input: req.valid.body }));
});

export const updateRelease = asyncHandler(async (req, res) => {
  ok(res, await svc.updateRelease({ projectId: req.project._id, releaseId: req.params.releaseId, input: req.valid.body }));
});

export const shipRelease = asyncHandler(async (req, res) => {
  ok(res, await svc.shipRelease({ project: req.project, releaseId: req.params.releaseId, actorId: req.user.id }));
});

export const deleteRelease = asyncHandler(async (req, res) => {
  await svc.deleteRelease({ projectId: req.project._id, releaseId: req.params.releaseId });
  noContent(res);
});
