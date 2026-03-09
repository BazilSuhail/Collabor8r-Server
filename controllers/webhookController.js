// GET /webhooks/project/:projectId → list webhooks
// POST /webhooks → create webhook { name?, url, projectId, events, secret? }
// PUT /webhooks/:webhookId → update webhook
// DELETE /webhooks/:webhookId → delete webhook
// POST /webhooks/:webhookId/test → test dispatch

const Webhook = require('../models/webhook');
const { validate, required, isString, isArray } = require('../utils/validate');

exports.getProjectWebhooks = async (req, res) => {
  try {
    const webhooks = await Webhook.find({ projectId: req.params.projectId });
    res.json(webhooks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
};

exports.createWebhook = async (req, res) => {
  try {
    const errors = validate({
      url: [required, isString],
      events: [required, isArray],
    }, req.body);
    if (errors) return res.status(400).json({ errors });

    const webhook = new Webhook({ ...req.body, createdBy: req.user.id });
    await webhook.save();
    res.status(201).json(webhook);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create webhook' });
  }
};

exports.updateWebhook = async (req, res) => {
  try {
    const webhook = await Webhook.findByIdAndUpdate(req.params.webhookId, req.body, { new: true });
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });
    res.json(webhook);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update webhook' });
  }
};

exports.deleteWebhook = async (req, res) => {
  try {
    const webhook = await Webhook.findByIdAndDelete(req.params.webhookId);
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ message: 'Webhook deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
};

exports.testWebhook = async (req, res) => {
  try {
    const webhook = await Webhook.findById(req.params.webhookId);
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

    const payload = { event: 'test', payload: { message: 'Webhook test from Collabora8r' }, timestamp: new Date().toISOString() };
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhook.secret || '' },
      body: JSON.stringify(payload),
    });

    res.json({ status: response.ok ? 'success' : 'failed', statusCode: response.status });
  } catch (err) {
    res.status(500).json({ error: 'Webhook test failed', detail: err.message });
  }
};
