import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import * as c from './integrations.controller.js';
import * as s from './integrations.schemas.js';

const router = Router({ mergeParams: true });
const admin = [auth, requireProjectRole('admin')];
const read = [auth, requireProjectRole('viewer')];
const developer = [auth, requireProjectRole('developer')];

router.get('/', ...admin, validate(pageQuerySchema, 'query'), c.listIntegrations);
router.post('/', ...admin, validate(s.createIntegrationSchema), c.createIntegration);
router.get('/:integrationId', ...admin, c.getIntegration);
router.patch('/:integrationId', ...admin, validate(s.updateIntegrationSchema), c.updateIntegration);
router.delete('/:integrationId', ...admin, c.deleteIntegration);
router.post('/:integrationId/connect', ...admin, c.connectIntegration);
router.post('/:integrationId/disconnect', ...admin, c.disconnectIntegration);

router.get('/:integrationId/links', ...read, validate(s.listLinksQuerySchema, 'query'), c.listLinks);
router.post('/:integrationId/links', ...developer, validate(s.createIntegrationLinkSchema), c.createLink);
router.delete('/:integrationId/links/:linkId', ...developer, c.deleteLink);

export default router;
