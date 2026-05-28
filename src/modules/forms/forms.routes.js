import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import { pageQuerySchema } from '../../utils/pagination.js';
import * as c from './forms.controller.js';
import * as s from './forms.schemas.js';

const router = Router({ mergeParams: true });
const viewer = [auth, requireProjectRole('viewer')];
const lead = [auth, requireProjectRole('lead')];
const developer = [auth, requireProjectRole('developer')];

router.get('/', ...viewer, validate(pageQuerySchema, 'query'), c.listForms);
router.post('/', ...lead, validate(s.createFormSchema), c.createForm);
router.get('/:formId', ...viewer, c.getForm);
router.patch('/:formId', ...lead, validate(s.updateFormSchema), c.updateForm);
router.delete('/:formId', ...lead, c.deleteForm);
router.get('/:formId/submissions', ...developer, validate(pageQuerySchema, 'query'), c.listSubmissions);

export default router;
