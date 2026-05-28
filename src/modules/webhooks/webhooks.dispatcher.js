import crypto from 'node:crypto';
import { logger } from '../../utils/logger.js';
import mongoose from 'mongoose';
import { Webhook, WebhookDelivery } from '../../models/index.js';
import { env } from '../../config/env.js';
import { assertSafeWebhookUrl } from './webhooks.ssrf.js';
import { onEvent } from '../../services/events.service.js';

const DAY = 86400000;
const MAX_FAILURES = 20;
const RETRY_DELAY_MS = 5000;

// Signature verification rule for receivers:
//   X-Webhook-Timestamp: unix time in seconds when the request was sent.
//   X-PM-Signature: "sha256=" + hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)).
// Receivers must recompute the HMAC over the timestamp header value, a ".", and the raw request body,
// compare in constant time, and reject requests whose timestamp is more than ~5 minutes from their clock
// (this bounds replay). A fresh timestamp and signature are generated on every attempt, including retries.
const sign = (secret, timestamp, body) => `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

async function attemptOnce(webhook, body, deliveryId, eventType) {
  const started = Date.now();
  const fail = (error, retryable) => ({ responseCode: 0, error, durationMs: Date.now() - started, retryable });
  try {
    // Re-check at dispatch time: DNS may have changed since the URL was saved.
    await assertSafeWebhookUrl(webhook.url);
  } catch (err) {
    return fail(err.message, false);
  }
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Webhook-Timestamp': timestamp,
        'X-PM-Signature': sign(webhook.secret, timestamp, body),
        'X-PM-Event': eventType,
        'X-PM-Delivery': String(deliveryId),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(env.webhookTimeoutMs),
    });
    // Never read or surface the response body; status code only.
    res.body?.cancel().catch(() => {});
    const isRedirect = res.status >= 300 && res.status < 400;
    return {
      responseCode: res.status,
      error: res.ok ? '' : isRedirect ? 'Redirects are not followed' : `HTTP ${res.status}`,
      durationMs: Date.now() - started,
      retryable: res.status >= 500,
    };
  } catch {
    // Generic text only: raw network errors (ECONNREFUSED, ENOTFOUND, ...) would act as a port-scan oracle.
    return fail('Delivery failed', true);
  }
}

// Sends one event to one webhook, records the delivery and updates health counters.
// Pass opts.rawBody to re-send a previously stored body verbatim (redelivery).
export async function deliverWebhook(webhook, event, { attempt = 1, rawBody = null } = {}) {
  const id = new mongoose.Types.ObjectId();
  const body = rawBody ?? JSON.stringify({
    id,
    type: event.type,
    projectId: webhook.projectId,
    at: event.at ?? new Date(),
    issueId: event.issueId ?? null,
    actorId: event.actorId ?? null,
    changes: event.changes ?? null,
    payload: event.payload ?? null,
  });

  let attempts = attempt;
  let result = await attemptOnce(webhook, body, id, event.type);
  if (result.retryable && attempt === 1) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    attempts = 2;
    result = await attemptOnce(webhook, body, id, event.type);
  }

  const delivered = !result.error && result.responseCode >= 200 && result.responseCode < 300;
  const now = new Date();
  const delivery = await WebhookDelivery.create({
    _id: id,
    webhookId: webhook._id,
    projectId: webhook.projectId,
    event: event.type,
    payloadId: new mongoose.Types.ObjectId(),
    requestBody: body,
    responseCode: result.responseCode,
    attempts,
    nextAttemptAt: null,
    durationMs: result.durationMs,
    error: result.error,
    createdAt: now,
    expireAt: new Date(now.getTime() + 14 * DAY),
  });

  const update = delivered
    ? { $set: { lastStatus: result.responseCode, lastDeliveredAt: now, failureCount: 0 } }
    : { $set: { lastStatus: result.error || result.responseCode }, $inc: { failureCount: 1 } };
  const after = await Webhook.findOneAndUpdate({ _id: webhook._id }, update, { returnDocument: 'after' }).lean();
  if (!delivered && after && after.failureCount >= MAX_FAILURES) {
    await Webhook.updateOne({ _id: webhook._id }, { $set: { active: false } });
  }
  return delivery.toObject();
}

let registered = false;

// Registers the event handler once per process; calling again is a no-op.
export function registerWebhookDispatcher() {
  if (registered) return;
  registered = true;
  onEvent(async (event) => {
    if (!event.projectId) return;
    try {
      const hooks = await Webhook.find({ projectId: event.projectId, active: true, events: event.type }).select('+secret').lean();
      await Promise.all(hooks.map((hook) => deliverWebhook(hook, event, { attempt: 1 })));
    } catch (err) {
      logger.error('webhook dispatch failed', err);
    }
  });
}
