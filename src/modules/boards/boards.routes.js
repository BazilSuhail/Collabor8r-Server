import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import * as c from './boards.controller.js';
import * as s from './boards.schemas.js';

const router = Router({ mergeParams: true });

router.get('/boards', auth, requireProjectRole('viewer'), c.listBoards);
router.post('/boards', auth, requireProjectRole('lead'), validate(s.createBoardSchema), c.createBoard);
router.get('/boards/:boardId', auth, requireProjectRole('viewer'), c.getBoard);
router.patch('/boards/:boardId', auth, requireProjectRole('lead'), validate(s.updateBoardSchema), c.updateBoard);
router.delete('/boards/:boardId', auth, requireProjectRole('lead'), c.deleteBoard);
router.get('/boards/:boardId/issues', auth, requireProjectRole('viewer'), validate(s.boardQuerySchema, 'query'), c.getBoardIssues);
router.get('/backlog', auth, requireProjectRole('viewer'), validate(s.backlogQuerySchema, 'query'), c.getBacklog);
router.patch('/issues/:issueId/rank', auth, requireProjectRole('developer'), validate(s.rankIssueSchema), c.rankIssue);

export default router;
