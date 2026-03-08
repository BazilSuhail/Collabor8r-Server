const { promptLLM, promptLLMStructured } = require('./ai');
const validate = require('./validate');
const { logActivity } = require('./activityLogger');
const { dispatchWebhook } = require('./webhookDispatcher');

module.exports = {
  promptLLM,
  promptLLMStructured,
  validate,
  logActivity,
  dispatchWebhook,
};
