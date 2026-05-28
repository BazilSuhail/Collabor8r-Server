import mongoose from 'mongoose';
import { Integration, IntegrationLink } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { actorOf } from '../../services/activity.service.js';
import { getIssueInProject } from '../issue/issue.service.js';

const MASK = '********';
const SECRET_KEY = /token|secret|key|password/i;
const oid = (v) => new mongoose.Types.ObjectId(v);

// Secret-looking config values are never sent back to the client.
function maskConfig(config = {}) {
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [k, SECRET_KEY.test(k) && v ? MASK : v]));
}

async function integrationInProject(projectId, id) {
  const integration = await Integration.findOne({ _id: id, projectId }).lean();
  if (!integration) throw new ApiError(404, 'Integration not found');
  return integration;
}

export async function listIntegrations(projectId, query) {
  const { items, meta } = await paginate(Integration, { projectId }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
  return { items: items.map((i) => ({ ...i, config: maskConfig(i.config) })), meta };
}

export async function createIntegration(project, userId, body) {
  const integration = await Integration.create({
    ...body,
    projectId: project._id,
    orgId: project.orgId ?? null,
    status: 'disconnected',
  });
  return { ...integration.toObject(), config: maskConfig(integration.config) };
}

export async function getIntegration(projectId, id) {
  const integration = await integrationInProject(projectId, id);
  return { ...integration, config: maskConfig(integration.config) };
}

export async function updateIntegration(projectId, id, body) {
  const current = await integrationInProject(projectId, id);
  const set = { ...body };
  if (body.config) {
    const kept = Object.fromEntries(Object.entries(body.config).filter(([, v]) => v !== MASK));
    set.config = { ...(current.config ?? {}), ...kept };
  }
  const updated = await Integration.findOneAndUpdate({ _id: id, projectId }, { $set: set }, { returnDocument: 'after', runValidators: true }).lean();
  return { ...updated, config: maskConfig(updated.config) };
}

export async function deleteIntegration(projectId, id) {
  await integrationInProject(projectId, id);
  await Integration.deleteOne({ _id: id, projectId });
}

// No network calls: connect and disconnect only record state.
export async function setConnection(projectId, userId, id, connect) {
  await integrationInProject(projectId, id);
  const update = connect
    ? { status: 'connected', lastError: '', connectedBy: userId, connectedByName: (await actorOf({ id: userId })).name }
    : { status: 'disconnected' };
  const updated = await Integration.findOneAndUpdate({ _id: id, projectId }, { $set: update }, { returnDocument: 'after' }).lean();
  return { ...updated, config: maskConfig(updated.config) };
}

export async function listLinks(projectId, integration, query) {
  const filter = { projectId, provider: integration.provider };
  if (query.issueId) filter.issueId = oid(query.issueId);
  return paginate(IntegrationLink, filter, { ...parsePageQuery(query, {}), sort: { at: -1 }, cursorField: 'at', lean: true });
}

export async function createLink(project, integration, body) {
  await getIssueInProject(project._id, body.issueId);
  const link = await IntegrationLink.create({
    projectId: project._id,
    issueId: body.issueId,
    provider: integration.provider,
    externalType: body.externalType,
    externalId: body.externalId,
    title: body.title ?? '',
    url: body.url ?? '',
    status: body.status ?? 'open',
    author: body.author ?? '',
    at: body.at ?? new Date(),
  });
  return link.toObject();
}

export async function deleteLink(projectId, integration, linkId) {
  const res = await IntegrationLink.deleteOne({ _id: linkId, projectId, provider: integration.provider });
  if (!res.deletedCount) throw new ApiError(404, 'Link not found');
}
