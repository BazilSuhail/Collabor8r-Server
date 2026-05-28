import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createApiTokenSchema,
  searchQuerySchema,
  sessionParamSchema,
  tokenParamSchema,
  updatePrefsSchema,
  updateProfileSchema,
} from './user.schemas.js';
import {
  createApiToken,
  getPrefs,
  getProfile,
  listApiTokens,
  listSessions,
  revokeApiToken,
  revokeSession,
  searchUsers,
  updatePrefs,
  updateProfile,
} from './user.controller.js';

const router = Router();

router.get('/me', auth, getProfile);
router.patch('/me', auth, validate(updateProfileSchema), updateProfile);
router.get('/search', auth, validate(searchQuerySchema, 'query'), searchUsers);
router.get('/me/sessions', auth, listSessions);
router.delete('/me/sessions/:sessionId', auth, validate(sessionParamSchema, 'params'), revokeSession);
router.get('/me/api-tokens', auth, listApiTokens);
router.post('/me/api-tokens', auth, validate(createApiTokenSchema), createApiToken);
router.delete('/me/api-tokens/:tokenId', auth, validate(tokenParamSchema, 'params'), revokeApiToken);
router.get('/me/notification-prefs', auth, getPrefs);
router.put('/me/notification-prefs', auth, validate(updatePrefsSchema), updatePrefs);

export default router;
