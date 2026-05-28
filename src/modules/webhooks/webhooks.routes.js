import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import * as c from './webhooks.controller.js';
import * as s from './webhooks.schemas.js';

const router = Router({ mergeParams: true });
const admin = [auth, requireProjectRole('admin')];

router.get('/', ...admin, validate(pageQuerySchema, 'query'), c.listWebhooks);
router.post('/', ...admin, validate(s.createWebhookSchema), c.createWebhook);
router.get('/:webhookId', ...admin, c.getWebhook);
router.patch('/:webhookId', ...admin, validate(s.updateWebhookSchema), c.updateWebhook);
router.delete('/:webhookId', ...admin, c.deleteWebhook);
router.post('/:webhookId/test', ...admin, c.testWebhook);
router.get('/:webhookId/deliveries', ...admin, validate(pageQuerySchema, 'query'), c.listDeliveries);
router.post('/:webhookId/deliveries/:deliveryId/redeliver', ...admin, c.redeliver);

export default router;
