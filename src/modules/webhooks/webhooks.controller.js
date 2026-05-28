import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import { writeAudit } from '../../services/audit.service.js';
import * as svc from './webhooks.service.js';

const audit = (req, action, hook, after) => writeAudit({
  req,
  orgId: req.project.orgId ?? null,
  projectId: req.project._id,
  action,
  targetType: 'webhook',
  targetId: hook._id,
  targetName: hook.name,
  after,
});

export const listWebhooks = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listWebhooks(req.project._id, req.valid.query);
  paged(res, items, meta);
});

export const createWebhook = asyncHandler(async (req, res) => {
  const hook = await svc.createWebhook(req.project, req.user.id, req.valid.body);
  await audit(req, 'webhook.created', hook, { name: hook.name, events: hook.events });
  created(res, hook);
});

export const getWebhook = asyncHandler(async (req, res) => {
  ok(res, await svc.getWebhook(req.project._id, req.params.webhookId));
});

export const updateWebhook = asyncHandler(async (req, res) => {
  const hook = await svc.updateWebhook(req.project._id, req.params.webhookId, req.valid.body);
  await audit(req, 'webhook.updated', hook, req.valid.body);
  ok(res, hook);
});

export const deleteWebhook = asyncHandler(async (req, res) => {
  const hook = await svc.getWebhook(req.project._id, req.params.webhookId);
  await svc.deleteWebhook(req.project._id, req.params.webhookId);
  await audit(req, 'webhook.deleted', hook);
  noContent(res);
});

export const testWebhook = asyncHandler(async (req, res) => {
  ok(res, await svc.testWebhook(req.project._id, req.params.webhookId));
});

export const listDeliveries = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listDeliveries(req.project._id, req.params.webhookId, req.valid.query);
  paged(res, items, meta);
});

export const redeliver = asyncHandler(async (req, res) => {
  ok(res, await svc.redeliver(req.project._id, req.params.webhookId, req.params.deliveryId));
});
