import { asyncHandler, ok, created, paged } from '../../utils/http.js';
import * as svc from './ai.service.js';

export const createDraft = asyncHandler(async (req, res) => {
  created(res, await svc.createDraft(req.user.id, req.valid.body));
});

export const listMyDrafts = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listMyDrafts(req.user.id, req.valid.query);
  paged(res, items, meta);
});

export const getDraft = asyncHandler(async (req, res) => {
  ok(res, await svc.getDraft(req.user.id, req.params.draftId));
});

export const acceptDraft = asyncHandler(async (req, res) => {
  ok(res, await svc.acceptDraft(req.user.id, req.params.draftId, req.valid.body.edits));
});

export const discardDraft = asyncHandler(async (req, res) => {
  ok(res, await svc.discardDraft(req.user.id, req.params.draftId));
});

export const getUsage = asyncHandler(async (req, res) => {
  ok(res, await svc.getUsage(req.user.id));
});
