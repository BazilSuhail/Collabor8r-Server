const Notification = require('../models/notifications');
const { sendMessageToUser } = require('../socket');

let notificationQueue = null;
try {
  notificationQueue = require('../queues/notificationQueue').notificationQueue;
} catch (_) {}

async function sendNotification(userId, type, data) {
  if (notificationQueue) {
    await notificationQueue.add('send', { userId, type, data }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return { queued: true };
  }

  const notificationDoc = await Notification.findById(userId);
  if (!notificationDoc) return null;

  const entry = { type, data: { ...data, createdAt: Date.now() }, read: false };
  notificationDoc.notifications.push(entry);

  // Prune notifications older than 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  notificationDoc.notifications = notificationDoc.notifications.filter(
    (n) => !n.data || !n.data.createdAt || n.data.createdAt >= thirtyDaysAgo
  );

  await notificationDoc.save();

  sendMessageToUser(userId, entry);

  return entry;
}

async function markAsRead(userId, notificationIndex) {
  const notificationDoc = await Notification.findById(userId);
  if (!notificationDoc) throw new Error('Notifications not found');

  if (notificationIndex === undefined) {
    notificationDoc.notifications.forEach((n) => { n.read = true; });
  } else if (notificationDoc.notifications[notificationIndex]) {
    notificationDoc.notifications[notificationIndex].read = true;
  }

  await notificationDoc.save();
  return notificationDoc;
}

async function getNotifications(userId) {
  const notificationDoc = await Notification.findById(userId);
  if (!notificationDoc) return [];

  // Prune notifications older than 30 days
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
