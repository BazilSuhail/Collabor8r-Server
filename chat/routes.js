// Chat routes.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getMessages, sendMessage } = require('./service');
const { validate, required, isString } = require('../lib/validate');

router.get('/:projectId/messages', authMiddleware, async (req, res) => {
  try {
    const messages = await getMessages(req.params.projectId, {
      before: req.query.before,
      limit: req.query.limit || 50,
    });
    res.status(200).json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/:projectId/messages', authMiddleware, async (req, res) => {
  try {
    const errors = validate({ content: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });
    const payload = await sendMessage(req.params.projectId, req.user.id, {
      content: req.body.content,
      type: req.body.type,
    });
    res.status(201).json({ message: payload });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
