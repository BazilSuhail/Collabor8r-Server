import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as c from './notifications.controller.js';

const router = Router();

router.get('/', auth, validate(c.listNotificationsQuerySchema, 'query'), c.listNotifications);
router.get('/unread-count', auth, validate(c.scopeQuerySchema, 'query'), c.unreadCount);
router.post('/read-all', auth, validate(c.readAllSchema, 'body'), c.markAllRead);
router.post('/:notificationId/read', auth, c.markRead);

export default router;
