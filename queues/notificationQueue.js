const { Queue, Worker } = require('bullmq');
const { createRedisClient } = require('../config/redis');

const connection = createRedisClient('notification-queue');

const notificationQueue = new Queue('notifications', { connection });
const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    const { userId, type, data } = job.data;

    const Notification = require('../models/notifications');
    const { sendMessageToUser } = require('../socket');

    const notificationDoc = await Notification.findById(userId);
    if (!notificationDoc) return null;

    const entry = { type, data: { ...data, createdAt: Date.now() }, read: false };
    notificationDoc.notifications.push(entry);
    await notificationDoc.save();

    sendMessageToUser(userId, entry);

    return entry;
  },
  {
    connection,
    concurrency: 10,
    limiter: { max: 50, duration: 1000 },
  }
);

notificationWorker.on('failed', (job, err) => {
  console.error(`❌ Notification job ${job.id} failed:`, err.message);
});

notificationWorker.on('completed', (job) => {
  console.log(`✅ Notification job ${job.id} completed`);
});

module.exports = { notificationQueue };
