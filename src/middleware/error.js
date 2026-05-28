// 404 and the global error envelope. Every error response carries the request id.
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/http.js';

export const notFound = (req, res, next) => next(new ApiError(404, 'Route not found'));

const JWT_ERRORS = ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'];

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = 500;
  let message = 'Internal server error';
  let errors;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
    errors = [{ path: err.path, message: `Invalid ${err.kind || 'value'}` }];
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyValue || {});
    message = `Duplicate value${fields.length ? ` for ${fields.join(', ')}` : ''}`;
    errors = fields.map((path) => ({ path, message: 'Already exists' }));
  } else if (JWT_ERRORS.includes(err.name)) {
    status = 401;
    message = 'Invalid or expired token';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  } else if (!env.isProd && err.message) {
    message = err.message;
  }

  const line = `${req.method} ${req.originalUrl.split("?")[0]} -> ${status}`;
  if (status >= 500) (err instanceof ApiError ? logger.warn(`${line} ${err.message}`) : logger.error(line, err));
  res.status(status).json({ success: false, message, ...(errors && { errors }), requestId: req.id });
};
