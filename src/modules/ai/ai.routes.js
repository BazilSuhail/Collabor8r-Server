import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import * as c from './ai.controller.js';
import * as s from './ai.schemas.js';

const router = Router();

router.post('/drafts', auth, validate(s.createDraftSchema), c.createDraft);
router.get('/drafts', auth, validate(pageQuerySchema, 'query'), c.listMyDrafts);
router.get('/drafts/:draftId', auth, c.getDraft);
router.post('/drafts/:draftId/accept', auth, validate(s.acceptDraftSchema), c.acceptDraft);
router.post('/drafts/:draftId/discard', auth, c.discardDraft);
router.get('/usage', auth, c.getUsage);

export default router;
