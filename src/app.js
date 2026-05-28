// Express app: middleware, mounts, error handling.
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import { requestId } from './middleware/requestId.js';
import { env } from './config/env.js';
import { ApiError } from './utils/http.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/user/user.routes.js';
import orgRoutes from './modules/org/org.routes.js';
import myWorkRoutes from './modules/mywork/mywork.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import publicFormRoutes from './modules/forms/forms.public.routes.js';
import projectRoutes from './modules/project/project.routes.js';
import rolesRoutes from './modules/roles/roles.routes.js';
import projectConfigRoutes from './modules/projectconfig/projectconfig.routes.js';
import workflowRoutes from './modules/workflows/workflows.routes.js';
import boardRoutes from './modules/boards/boards.routes.js';
import sprintRoutes from './modules/sprints/sprints.routes.js';
import releaseRoutes from './modules/releases/releases.routes.js';
import issueRoutes from './modules/issue/issue.routes.js';
import commentRoutes from './modules/comments/comments.routes.js';
import uploadsRoutes from './modules/uploads/uploads.routes.js';
import attachmentRoutes from './modules/attachments/attachments.routes.js';
import linkRoutes from './modules/links/links.routes.js';
import historyRoutes from './modules/history/history.routes.js';
import worklogRoutes from './modules/worklogs/worklogs.routes.js';
import wikiRoutes from './modules/wiki/wiki.routes.js';
import dashboardRoutes from './modules/dashboards/dashboards.routes.js';
import reportRoutes from './modules/reports/reports.routes.js';
import automationRoutes from './modules/automation/automation.routes.js';
import webhookRoutes from './modules/webhooks/webhooks.routes.js';
import integrationRoutes from './modules/integrations/integrations.routes.js';
import serviceDeskRoutes from './modules/servicedesk/servicedesk.routes.js';
import formRoutes from './modules/forms/forms.routes.js';
import testMgmtRoutes from './modules/testmgmt/testmgmt.routes.js';
import riskRoutes from './modules/risks/risks.routes.js';
import budgetRoutes from './modules/budget/budget.routes.js';
import catRoutes from './modules/cat/cat.routes.js';
import activityRoutes from './modules/activity/activity.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import boardHubRoutes from './modules/boardhub/boardhub.routes.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);

app.use(requestId);
morgan.token('id', (req) => req.id);
morgan.token('path', (req) => req.originalUrl.split('?')[0]); // keeps signed-URL query strings out of logs
app.use(morgan(env.isProd ? ':remote-addr - :remote-user [:date[clf]] ":method :path HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :id' : ':method :path :status :response-time ms :id'));
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || env.clientOrigins.includes(origin)),
    credentials: true,
    exposedHeaders: ['x-request-id'],
  }),
);
// Signed-URL file storage: outside /api, mounted before express.json so the raw body stays a stream.
app.use('/uploads', helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }), uploadsRoutes);
app.use(express.json({ limit: '100kb' }));

const limiter = (limit, windowMs, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new ApiError(429, message)),
  });

// Liveness (no DB) and readiness (Mongo connected). Registered before rate limits.
app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));
app.get('/api/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ success: ready, data: { status: ready ? 'ready' : 'not ready' } });
});

app.use('/api', limiter(env.apiRateLimit, 60 * 1000, 'Too many requests, slow down'));
app.use(['/api/auth/login', '/api/auth/register'], limiter(env.authRateLimit, 15 * 60 * 1000, 'Too many attempts, try again later'));
app.use('/api/auth', limiter(env.authRateLimit * 10, 15 * 60 * 1000, 'Too many attempts, try again later'));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/my-work', myWorkRoutes);
app.use('/api/board', boardHubRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/public/forms', publicFormRoutes);
app.use('/api', projectRoutes);
app.use('/api/projects/:projectId/roles', rolesRoutes);
app.use('/api/projects/:projectId', projectConfigRoutes);
app.use('/api/projects/:projectId/workflows', workflowRoutes);
app.use('/api/projects/:projectId', boardRoutes);
app.use('/api/projects/:projectId/sprints', sprintRoutes);
app.use('/api/projects/:projectId/releases', releaseRoutes);
app.use('/api/projects/:projectId/issues', issueRoutes);
app.use('/api/projects/:projectId/issues/:issueId/comments', commentRoutes);
app.use('/api/projects/:projectId/issues/:issueId/attachments', attachmentRoutes);
app.use('/api/projects/:projectId/issues/:issueId/links', linkRoutes);
app.use('/api/projects/:projectId/issues/:issueId/history', historyRoutes);
app.use('/api/projects/:projectId', worklogRoutes);
app.use('/api/projects/:projectId/wiki', wikiRoutes);
app.use('/api/projects/:projectId', dashboardRoutes);
app.use('/api/projects/:projectId/reports', reportRoutes);
app.use('/api/projects/:projectId/automation', automationRoutes);
app.use('/api/projects/:projectId/webhooks', webhookRoutes);
app.use('/api/projects/:projectId/integrations', integrationRoutes);
app.use('/api/projects/:projectId/servicedesk', serviceDeskRoutes);
app.use('/api/projects/:projectId/forms', formRoutes);
app.use('/api/projects/:projectId', testMgmtRoutes);
app.use('/api/projects/:projectId', riskRoutes);
app.use('/api/projects/:projectId', budgetRoutes);
app.use('/api/projects/:projectId', catRoutes);
app.use('/api/projects/:projectId/activity', activityRoutes);
app.use('/api', auditRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
