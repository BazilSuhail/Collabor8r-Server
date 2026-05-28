import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as c from './mywork.controller.js';
import { myWorkQuerySchema } from '../issue/issue.schemas.js';

const router = Router();

router.get('/issues', auth, validate(myWorkQuerySchema, 'query'), c.listMyIssues);
router.get('/worklogs', auth, validate(myWorkQuerySchema, 'query'), c.listMyWorklogs);

export default router;
