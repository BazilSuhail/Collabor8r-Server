import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import * as svc from './wiki.service.js';

export const listSpaces = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listSpaces(req.project._id, req.valid.query);
  paged(res, items, meta);
});

export const createSpace = asyncHandler(async (req, res) => {
  created(res, await svc.createSpace(req.project, req.user.id, req.valid.body));
});

export const updateSpace = asyncHandler(async (req, res) => {
  ok(res, await svc.updateSpace(req.project._id, req.params.spaceId, req.valid.body));
});

export const deleteSpace = asyncHandler(async (req, res) => {
  await svc.deleteSpace(req.project._id, req.params.spaceId);
  noContent(res);
});

export const listPages = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listPages(req.project._id, req.valid.query);
  paged(res, items, meta);
});

export const getPage = asyncHandler(async (req, res) => {
  ok(res, await svc.getPage(req.project._id, req.params.pageId));
});

export const createPage = asyncHandler(async (req, res) => {
  created(res, await svc.createPage(req.project, req.user.id, req.valid.body));
});

export const updatePage = asyncHandler(async (req, res) => {
  ok(res, await svc.updatePage(req.project, req.user.id, req.params.pageId, req.valid.body));
});

export const deletePage = asyncHandler(async (req, res) => {
  await svc.deletePage(req.project._id, req.params.pageId);
  noContent(res);
});

export const listVersions = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listVersions(req.project._id, req.params.pageId, req.valid.query);
  paged(res, items, meta);
});

export const getVersion = asyncHandler(async (req, res) => {
  ok(res, await svc.getVersion(req.project._id, req.params.pageId, req.params.versionId));
});

export const restoreVersion = asyncHandler(async (req, res) => {
  ok(res, await svc.restoreVersion(req.project, req.user.id, req.params.pageId, req.params.versionId));
});
