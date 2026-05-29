import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../utils/http.js';
import * as c from './forms.controller.js';
import { submitFormSchema } from './forms.schemas.js';

const router = Router();
const WINDOW_MS = 60000;
const MAX_PER_WINDOW = 10;
const hits = new Map();

// Bounded cleanup: drop IPs whose hits have all expired.
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    if (!list.some((t) => now - t < WINDOW_MS)) hits.delete(ip);
  }
}, WINDOW_MS).unref();

// In-memory limit: 10 submissions per minute per IP.
function submitLimit(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return next(new ApiError(429, 'Too many submissions, try again later'));
  recent.push(now);
  hits.set(req.ip, recent);
  return next();
}

router.get('/:publicKey', c.getPublicForm);
router.post('/:publicKey/submit', submitLimit, validate(submitFormSchema), c.submitPublicForm);

export default router;
