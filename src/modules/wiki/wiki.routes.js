import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import * as c from './wiki.controller.js';
import * as s from './wiki.schemas.js';

const router = Router({ mergeParams: true });

router.get('/spaces', auth, requireProjectRole('viewer'), validate(pageQuerySchema, 'query'), c.listSpaces);
router.post('/spaces', auth, requireProjectRole('lead'), validate(s.createSpaceSchema), c.createSpace);
router.patch('/spaces/:spaceId', auth, requireProjectRole('lead'), validate(s.updateSpaceSchema), c.updateSpace);
router.delete('/spaces/:spaceId', auth, requireProjectRole('lead'), c.deleteSpace);

router.get('/pages', auth, requireProjectRole('viewer'), validate(s.listPagesQuerySchema, 'query'), c.listPages);
router.get('/pages/:pageId', auth, requireProjectRole('viewer'), c.getPage);
router.post('/pages', auth, requireProjectRole('developer'), validate(s.createPageSchema), c.createPage);
router.patch('/pages/:pageId', auth, requireProjectRole('developer'), validate(s.updatePageSchema), c.updatePage);
router.delete('/pages/:pageId', auth, requireProjectRole('lead'), c.deletePage);

router.get('/pages/:pageId/versions', auth, requireProjectRole('viewer'), validate(pageQuerySchema, 'query'), c.listVersions);
router.get('/pages/:pageId/versions/:versionId', auth, requireProjectRole('viewer'), c.getVersion);
router.post('/pages/:pageId/versions/:versionId/restore', auth, requireProjectRole('developer'), c.restoreVersion);

export default router;
