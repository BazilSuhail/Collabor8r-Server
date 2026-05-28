import { asyncHandler, ok, created, noContent, paged } from '../../utils/http.js';
import { writeAudit } from '../../services/audit.service.js';
import * as svc from './integrations.service.js';

const audit = (req, action, integration, after) => writeAudit({
  req,
  orgId: req.project.orgId ?? null,
  projectId: req.project._id,
  action,
  targetType: 'integration',
  targetId: integration._id,
  targetName: integration.displayName,
  after,
});

export const listIntegrations = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listIntegrations(req.project._id, req.valid.query);
  paged(res, items, meta);
});

export const createIntegration = asyncHandler(async (req, res) => {
  const integration = await svc.createIntegration(req.project, req.user.id, req.valid.body);
  await audit(req, 'integration.created', integration, { provider: integration.provider });
  created(res, integration);
});

export const getIntegration = asyncHandler(async (req, res) => {
  ok(res, await svc.getIntegration(req.project._id, req.params.integrationId));
});

export const updateIntegration = asyncHandler(async (req, res) => {
  const integration = await svc.updateIntegration(req.project._id, req.params.integrationId, req.valid.body);
  await audit(req, 'integration.updated', integration, { displayName: req.valid.body.displayName });
  ok(res, integration);
});

export const deleteIntegration = asyncHandler(async (req, res) => {
  const integration = await svc.getIntegration(req.project._id, req.params.integrationId);
  await svc.deleteIntegration(req.project._id, req.params.integrationId);
  await audit(req, 'integration.deleted', integration);
  noContent(res);
});

export const connectIntegration = asyncHandler(async (req, res) => {
  const integration = await svc.setConnection(req.project._id, req.user.id, req.params.integrationId, true);
  await audit(req, 'integration.connected', integration);
  ok(res, integration);
});

export const disconnectIntegration = asyncHandler(async (req, res) => {
  const integration = await svc.setConnection(req.project._id, req.user.id, req.params.integrationId, false);
  await audit(req, 'integration.disconnected', integration);
  ok(res, integration);
});

export const listLinks = asyncHandler(async (req, res) => {
  const integration = await svc.getIntegration(req.project._id, req.params.integrationId);
  const { items, meta } = await svc.listLinks(req.project._id, integration, req.valid.query);
  paged(res, items, meta);
});

export const createLink = asyncHandler(async (req, res) => {
  const integration = await svc.getIntegration(req.project._id, req.params.integrationId);
  created(res, await svc.createLink(req.project, integration, req.valid.body));
});

export const deleteLink = asyncHandler(async (req, res) => {
  const integration = await svc.getIntegration(req.project._id, req.params.integrationId);
  await svc.deleteLink(req.project._id, integration, req.params.linkId);
  noContent(res);
});
