const Webhook = require('../models/webhook');

async function dispatchWebhook(event, payload) {
  try {
    const webhooks = await Webhook.find({
      events: event,
      isActive: true,
    });

    const results = await Promise.allSettled(
      webhooks.map(async (webhook) => {
        const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
        const headers = { 'Content-Type': 'application/json' };
        if (webhook.secret) {
          headers['X-Webhook-Secret'] = webhook.secret;
        }
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
        });
        if (!response.ok) {
          throw new Error(`Webhook ${webhook.url} returned ${response.status}`);
        }
        return response;
      })
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error(`Webhook dispatch: ${failed.length} failed`);
    }

    return results;
  } catch (err) {
    console.error('Webhook dispatch error:', err.message);
  }
}

module.exports = { dispatchWebhook };
