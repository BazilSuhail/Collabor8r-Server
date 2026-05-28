// HTTP helpers: error type, async wrapper, response envelopes.

export class ApiError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

// Forwards rejected promises to Express error handling.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const ok = (res, data = null, meta) =>
  res.status(200).json({ success: true, data, ...(meta && { meta }) });

export const created = (res, data, meta) =>
  res.status(201).json({ success: true, data, ...(meta && { meta }) });

// Keeps the envelope shape for endpoints with no body.
export const noContent = (res) => ok(res, null);

export const paged = (res, items, pageMeta) => ok(res, items, pageMeta);
