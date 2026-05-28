import mongoose from 'mongoose';
import { Webhook, WebhookDelivery } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { paginate, parsePageQuery } from '../../utils/pagination.js';
import { randomToken } from '../../utils/helpers.js';
import { deliverWebhook } from './webhooks.dispatcher.js';
import { assertSafeWebhookUrl } from './webhooks.ssrf.js';

const oid = (v) => new mongoose.Types.ObjectId(v);

async function hookWithSecret(projectId, id) {
  const hook = await Webhook.findOne({ _id: id, projectId }).select('+secret').lean();
  if (!hook) throw new ApiError(404, 'Webhook not found');
  return hook;
}

export function listWebhooks(projectId, query) {
  return paginate(Webhook, { projectId }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, select: '-secret', lean: true });
}

// The signing secret is returned once here and never listed again.
async function assertUrl(url) {
  try {
    await assertSafeWebhookUrl(url);
  } catch (err) {
    throw new ApiError(400, err.message);
  }
}

export async function createWebhook(project, userId, body) {
  await assertUrl(body.url);
  const secret = randomToken(32);
  const hook = await Webhook.create({
    ...body,
    projectId: project._id,
    orgId: project.orgId ?? null,
    secret,
    active: body.active ?? true,
    failureCount: 0,
    createdBy: userId,
  });
  const { secret: _omit, ...rest } = hook.toObject();
  return { ...rest, secret };
}

export async function getWebhook(projectId, id) {
  const hook = await Webhook.findOne({ _id: id, projectId }).select('-secret').lean();
  if (!hook) throw new ApiError(404, 'Webhook not found');
  return hook;
}

export async function updateWebhook(projectId, id, body) {
  if (body.url) await assertUrl(body.url);
  const set = { ...body };
  if (body.active === true) set.failureCount = 0;
  const hook = await Webhook.findOneAndUpdate({ _id: id, projectId }, { $set: set }, { returnDocument: 'after', runValidators: true }).select('-secret').lean();
  if (!hook) throw new ApiError(404, 'Webhook not found');
  return hook;
}

export async function deleteWebhook(projectId, id) {
  const res = await Webhook.deleteOne({ _id: id, projectId });
  if (!res.deletedCount) throw new ApiError(404, 'Webhook not found');
  await WebhookDelivery.deleteMany({ webhookId: oid(id), projectId });
}

export async function testWebhook(projectId, id) {
  const hook = await hookWithSecret(projectId, id);
  return deliverWebhook(hook, { type: 'ping', projectId, at: new Date(), payload: { message: 'ping' } }, { attempt: 1 });
}

export async function listDeliveries(projectId, id, query) {
  await getWebhook(projectId, id);
  return paginate(WebhookDelivery, { projectId, webhookId: oid(id) }, { ...parsePageQuery(query, {}), sort: { _id: -1 }, lean: true });
}

// Redelivers a stored delivery's event type to the webhook, as a new attempt.
export async function redeliver(projectId, id, deliveryId) {
  const hook = await hookWithSecret(projectId, id);
  const delivery = await WebhookDelivery.findOne({ _id: deliveryId, webhookId: hook._id, projectId }).lean();
  if (!delivery) throw new ApiError(404, 'Delivery not found');
  if (!delivery.requestBody) throw new ApiError(409, 'Original payload is not available for redelivery');
  // Re-sends the exact stored body; a fresh timestamp/signature is generated at send time.
  return deliverWebhook(hook, { type: delivery.event }, { attempt: delivery.attempts + 1, rawBody: delivery.requestBody });
}
