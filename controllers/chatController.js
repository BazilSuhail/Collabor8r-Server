const ChatMessage = require('../models/chatMessage');
const Profile = require('../models/profile');
const { sendToProjectRoom } = require('../socket');
const { validate, required, isString } = require('../utils/validate');

exports.getMessages = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { before, limit = 50 } = req.query;

    const query = { projectId };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 100))
      .lean();

    const userIds = [...new Set(messages.map((m) => m.userId?.toString()).filter(Boolean))];
    const users = userIds.length
      ? await Profile.find({ _id: { $in: userIds } }).select('name avatar').lean()
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    const enriched = messages.map((m) => ({
      ...m,
      user: userMap[m.userId?.toString()] || { name: 'Unknown', avatar: null },
    }));

    res.status(200).json({ messages: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const errors = validate({ content: [required, isString] }, req.body);
    if (errors) return res.status(400).json({ errors });

    const { projectId } = req.params;
    const { content, type } = req.body;

    const message = await ChatMessage.create({
      projectId,
      userId: req.user.id,
      content,
      type: type || 'text',
    });

    const user = await Profile.findById(req.user.id).select('name avatar').lean();

    const payload = {
      _id: message._id,
      projectId,
      userId: req.user.id,
      content,
      type: message.type,
      createdAt: message.createdAt,
      user: user || { name: 'Unknown', avatar: null },
    };

    sendToProjectRoom(projectId, 'chat:message', payload);

    res.status(201).json({ message: payload });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
};
