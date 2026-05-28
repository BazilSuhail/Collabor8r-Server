import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './releases.controller.js';
import * as s from './releases.schemas.js';

const router = Router({ mergeParams: true });

router.get('/', auth, requireProjectRole('viewer'), validate(s.listReleasesQuerySchema, 'query'), c.listReleases);
router.post('/', auth, requireProjectRole('lead'), validate(s.createReleaseSchema), c.createRelease);
router.get('/:releaseId', auth, requireProjectRole('viewer'), c.getRelease);
router.patch('/:releaseId', auth, requireProjectRole('lead'), validate(s.updateReleaseSchema), c.updateRelease);
router.post('/:releaseId/ship', auth, requireProjectRole('lead'), c.shipRelease);
router.delete('/:releaseId', auth, requireProjectRole('lead'), c.deleteRelease);

export default router;
