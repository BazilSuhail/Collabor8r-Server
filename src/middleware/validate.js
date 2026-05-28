// Request validation: parses req[source] with a zod schema into req.valid[source].
import { ApiError } from '../utils/http.js';

export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return next(new ApiError(422, 'Validation failed', errors));
  }
  req.valid = req.valid || {};
  req.valid[source] = result.data;
  next();
};
