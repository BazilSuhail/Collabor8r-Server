// Assigns a request id (incoming x-request-id or a new UUID) and exposes it in the response and log context.
import crypto from 'node:crypto';
import { requestContext } from '../utils/logger.js';

const SAFE_ID = /^[\w.-]{1,64}$/;

export const requestId = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  requestContext.run({ requestId: req.id }, next);
};
