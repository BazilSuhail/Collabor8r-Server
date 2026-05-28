import { z } from 'zod';
import { asyncHandler, paged } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { ProjectActivity } from '../../models/index.js';
import { ACTIVITY_KINDS } from '../../config/constants.js';

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  kind: z.enum(ACTIVITY_KINDS).optional(),
});

// Cursor on the time field; the feed is read-only.
export const listActivity = asyncHandler(async (req, res) => {
  const filter = { projectId: req.project._id };
  if (req.valid.query.kind) filter.kind = req.valid.query.kind;
  const { items, meta } = await paginate(ProjectActivity, filter, {
    ...parsePageQuery(req.valid.query, {}),
    sort: { at: -1 },
    cursorField: 'at',
    lean: true,
  });
  paged(res, items, meta);
});
