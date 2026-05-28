// Cursor pagination: opaque cursor over (sort field value, _id).
import { z } from 'zod';
import { ApiError } from './http.js';

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(2048).optional(),
});

export const encodeCursor = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export const decodeCursor = (str) => {
  try {
    const parsed = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || !('v' in parsed) || !('id' in parsed)) {
      throw new Error('bad cursor shape');
    }
    return parsed;
  } catch {
    throw new ApiError(400, 'Invalid cursor');
  }
};

export const parsePageQuery = (query = {}, { defaultLimit = 25, maxLimit = 100 } = {}) => {
  const requested = Number(query.limit);
  const limit =
    Number.isInteger(requested) && requested >= 1 ? Math.min(requested, maxLimit) : defaultLimit;
  return { limit, cursor: query.cursor ?? null };
};

// Fetches limit+1 rows so hasMore is known without a count.
export const paginate = async (Model, filter, options = {}) => {
  const { sort = { _id: -1 }, limit = 25, cursor = null, select, populate, lean = true, countTotal = false } =
    options;
  const field = options.cursorField ?? Object.keys(sort)[0] ?? '_id';
  const dir = [1, 'asc', 'ascending'].includes(sort[field]) ? 1 : -1;
  const sortSpec = field === '_id' ? { _id: dir } : { [field]: dir, _id: dir };

  const query = { ...filter };
  if (cursor) {
    const c = decodeCursor(cursor);
    const op = dir === 1 ? '$gt' : '$lt';
    const cond =
      field === '_id'
        ? { _id: { [op]: c.id } }
        : { $or: [{ [field]: { [op]: c.v } }, { [field]: c.v, _id: { [op]: c.id } }] };
    query.$and = [...(filter.$and ?? []), cond];
  }

  let q = Model.find(query).sort(sortSpec).limit(limit + 1);
  if (select) q = q.select(select);
  if (populate) q = q.populate(populate);
  if (lean) q = q.lean();
  const docs = await q;

  const hasMore = docs.length > limit;
  const items = hasMore ? docs.slice(0, limit) : docs;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ v: last[field] ?? null, id: last._id }) : null;

  const meta = { limit, count: items.length, hasMore, nextCursor };
  if (countTotal) meta.total = await Model.countDocuments(filter);
  return { items, meta };
};
