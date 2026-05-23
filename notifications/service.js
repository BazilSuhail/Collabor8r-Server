// Notification inbox: queue-first via BullMQ when REDIS_URL set, else direct write + socket push.
const { Notification } = require('./models');
const { sendMessageToUser } = require('../socket');

let notificationQueue = null;
if (process.env.REDIS_URL) {
  try {
    notificationQueue = require('../queues/notificationQueue').notificationQueue;
  } catch (_) {}
}

async function sendNotification(userId, type, data) {
  if (notificationQueue) {
    await notificationQueue.add('send', { userId, type, data }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return { queued: true };
  }

  const entry = { type, data: { ...data, createdAt: Date.now() }, read: false };

  const updated = await Notification.findOneAndUpdate(
    { _id: userId },
    {
      $push: {
        notifications: {
          $each: [entry],
          $slice: -1000,
        },
      },
    },
    { returnDocument: 'after' },
  );
  if (!updated) return null;

  sendMessageToUser(userId, entry);

  return entry;
}

async function markAsRead(userId, notificationIndex) {
  if (notificationIndex === undefined) {
    const updated = await Notification.findOneAndUpdate(
      { _id: userId },
      { $set: { 'notifications.$[].read': true } },
      { arrayFilters: [{ 'elem.read': false }], returnDocument: 'after' },
    );
    if (!updated) throw new Error('Notifications not found');
    return updated;
  }

  const updated = await Notification.findOneAndUpdate(
    { _id: userId, [`notifications.${notificationIndex}`]: { $exists: true } },
    { $set: { [`notifications.${notificationIndex}.read`]: true } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new Error('Notifications not found');
  return updated;
}

async function getNotifications(userId) {
  const notificationDoc = await Notification.findById(userId);
  if (!notificationDoc) return [];

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const initialLength = notificationDoc.notifications.length;
  notificationDoc.notifications = notificationDoc.notifications.filter(
    (n) => !n.data || !n.data.createdAt || n.data.createdAt >= thirtyDaysAgo
  );

  if (notificationDoc.notifications.length !== initialLength) {
    await notificationDoc.save();
  }

  return notificationDoc.notifications;
}

async function getUnreadCount(userId) {
  const notificationDoc = await Notification.findById(userId);
  if (!notificationDoc) return 0;
  return notificationDoc.notifications.filter((n) => !n.read).length;
}

module.exports = { sendNotification, markAsRead, getNotifications, getUnreadCount };
