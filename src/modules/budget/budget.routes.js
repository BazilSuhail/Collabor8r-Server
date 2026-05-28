import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { makeProjectCrud } from '../../utils/crud.js';
import { asyncHandler, ok, ApiError } from '../../utils/http.js';
import { BudgetLine, BudgetActual } from '../../models/index.js';
import { actorOf } from '../../services/activity.service.js';
import * as s from './budget.schemas.js';
import { budgetSummary } from './budget.service.js';

const router = Router({ mergeParams: true });

// Declared before the crud mount so "summary" is not read as a line id.
router.get('/budget-lines/summary', auth, requireProjectRole('viewer'), asyncHandler(async (req, res) => {
  ok(res, await budgetSummary(req.project._id));
}));

router.use('/budget-lines', makeProjectCrud({
  Model: BudgetLine,
  name: 'budgetLine',
  createSchema: s.createBudgetLineSchema,
  updateSchema: s.updateBudgetLineSchema,
  filterFields: ['category'],
  searchFields: ['name', 'category'],
}));

router.use('/budget-actuals', makeProjectCrud({
  Model: BudgetActual,
  name: 'budgetActual',
  createSchema: s.createBudgetActualSchema,
  updateSchema: s.updateBudgetActualSchema,
  filterFields: ['budgetLineId'],
  beforeCreate: async (req, body) => {
    const line = await BudgetLine.exists({ _id: body.budgetLineId, projectId: req.project._id });
    if (!line) throw new ApiError(422, 'Budget line not found in project');
    const enteredBy = await actorOf({ id: req.user.id });
    return { ...body, enteredBy: req.user.id, enteredByName: enteredBy.name };
  },
}));

export default router;
