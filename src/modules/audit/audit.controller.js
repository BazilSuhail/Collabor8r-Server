import mongoose from 'mongoose';
import { z } from 'zod';
import { asyncHandler, paged } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { objectId } from '../../utils/helpers.js';
import { AuditLog } from '../../models/index.js';

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  actorId: objectId.optional(),
  action: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// actorId may be stored as a string or an ObjectId, so both are matched.
function auditFilter(scope, query) {
  const filter = { ...scope };
  if (query.actorId) filter.actorId = { $in: [query.actorId, new mongoose.Types.ObjectId(query.actorId)] };
  if (query.action) filter.action = query.action;
  if (query.from || query.to) {
    filter.at = {};
    if (query.from) filter.at.$gte = query.from;
    if (query.to) filter.at.$lte = query.to;
  }
  return filter;
}

const listAudit = (scope, query) =>
  paginate(AuditLog, auditFilter(scope, query), { ...parsePageQuery(query, {}), sort: { at: -1 }, cursorField: 'at', lean: true });

// Read-only. Entries are written only by the audit service.
export const listOrgAudit = asyncHandler(async (req, res) => {
  const { items, meta } = await listAudit({ orgId: new mongoose.Types.ObjectId(req.params.orgId) }, req.valid.query);
  paged(res, items, meta);
});

export const listProjectAudit = asyncHandler(async (req, res) => {
  const { items, meta } = await listAudit({ projectId: req.project._id }, req.valid.query);
  paged(res, items, meta);
});
