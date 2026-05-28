import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './activity.controller.js';

const router = Router({ mergeParams: true });

router.get('/', auth, requireProjectRole('viewer'), validate(c.activityQuerySchema, 'query'), c.listActivity);

export default router;
