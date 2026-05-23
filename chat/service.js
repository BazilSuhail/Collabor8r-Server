// Project chat: read (cursor pagination) + write (emits to project room).
const { ChatMessage } = require('./models');
const { Profile } = require('../auth/models');
const { sendToProjectRoom } = require('../socket');

async function getMessages(projectId, { before, limit = 50 } = {}) {
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

  return messages.map((m) => ({
    ...m,
    user: userMap[m.userId?.toString()] || { name: 'Unknown', avatar: null },
  }));
}

async function sendMessage(projectId, userId, { content, type }) {
  const message = await ChatMessage.create({
    projectId,
    userId,
    content,
    type: type || 'text',
  });

  const user = await Profile.findById(userId).select('name avatar').lean();

  const payload = {
    _id: message._id,
    projectId,
    userId,
    content,
    type: message.type,
    createdAt: message.createdAt,
    user: user || { name: 'Unknown', avatar: null },
  };

  sendToProjectRoom(projectId, 'chat:message', payload);

  return payload;
}

module.exports = { getMessages, sendMessage };
