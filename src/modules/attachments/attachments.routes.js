import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './attachments.controller.js';
import * as s from './attachments.schemas.js';

const router = Router({ mergeParams: true });
const params = validate(s.attachmentParamsSchema, 'params');

router.get('/', auth, requireProjectRole('viewer'), validate(s.attachmentListQuerySchema, 'query'), c.listAttachments);
router.post('/upload-url', auth, requireProjectRole('developer'), validate(s.uploadUrlSchema), c.createUploadUrl);
router.post('/', auth, requireProjectRole('developer'), validate(s.createAttachmentSchema), c.createAttachment);
router.get('/:attachmentId/download-url', auth, requireProjectRole('viewer'), params, c.downloadUrl);
router.delete('/:attachmentId', auth, requireProjectRole('reporter'), params, c.deleteAttachment);

export default router;
