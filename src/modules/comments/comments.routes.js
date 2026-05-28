import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './comments.controller.js';
import * as s from './comments.schemas.js';

const router = Router({ mergeParams: true });
const params = validate(s.commentParamsSchema, 'params');

router.get('/', auth, requireProjectRole('viewer'), validate(s.commentListQuerySchema, 'query'), c.listComments);
router.post('/', auth, requireProjectRole('reporter'), validate(s.createCommentSchema), c.createComment);
router.patch('/:commentId', auth, requireProjectRole('reporter'), params, validate(s.updateCommentSchema), c.updateComment);
router.delete('/:commentId', auth, requireProjectRole('reporter'), params, c.deleteComment);

export default router;
