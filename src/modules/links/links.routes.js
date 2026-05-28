import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './links.controller.js';
import * as s from './links.schemas.js';

const router = Router({ mergeParams: true });

router.get('/', auth, requireProjectRole('viewer'), c.listLinks);
router.post('/', auth, requireProjectRole('developer'), validate(s.createLinkSchema), c.createLink);
router.delete('/:linkId', auth, requireProjectRole('developer'), validate(s.linkParamsSchema, 'params'), c.deleteLink);

export default router;
