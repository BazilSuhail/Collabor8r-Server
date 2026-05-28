import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { requireProjectRole } from '../../middleware/projectRole.js';
import { validate } from '../../middleware/validate.js';
import goalsRouter from './goals.routes.js';
import * as c from './dashboards.controller.js';
import * as s from './dashboards.schemas.js';

const router = Router({ mergeParams: true });

router.get('/dashboards', auth, requireProjectRole('viewer'), validate(s.listDashboardsQuerySchema, 'query'), c.listDashboards);
router.post('/dashboards', auth, requireProjectRole('reporter'), validate(s.createDashboardSchema), c.createDashboard);
router.get('/dashboards/:dashboardId', auth, requireProjectRole('viewer'), c.getDashboard);
router.patch('/dashboards/:dashboardId', auth, requireProjectRole('reporter'), validate(s.updateDashboardSchema), c.updateDashboard);
router.delete('/dashboards/:dashboardId', auth, requireProjectRole('reporter'), c.deleteDashboard);

router.use('/goals', goalsRouter);

export default router;
