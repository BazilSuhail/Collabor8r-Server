import { asyncHandler, paged } from '../../utils/http.js';
import * as svc from './mywork.service.js';

export const listMyIssues = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listMyIssues({ userId: req.user.id, query: req.valid.query });
  paged(res, items, meta);
});

export const listMyWorklogs = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listMyWorklogs({ userId: req.user.id, query: req.valid.query });
  paged(res, items, meta);
});
