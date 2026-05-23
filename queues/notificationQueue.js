const { Queue, Worker } = require('bullmq');
const { createRedisClient } = require('../config/redis');

if (!process.env.REDIS_URL) {
  module.exports = { notificationQueue: null };
} else {
  const connection = createRedisClient('notification-queue');

  const notificationQueue = new Queue('notifications', { connection });
  const notificationWorker = new Worker(
    'notifications',
    async (job) => {
      const { userId, type, data } = job.data;

      const { Notification } = require('../notifications/models');
      const { sendMessageToUser } = require('../socket');

      const entry = { type, data: { ...data, createdAt: Date.now() }, read: false };
      const updated = await Notification.findOneAndUpdate(
        { _id: userId },
        { $push: { notifications: { $each: [entry], $slice: -1000 } } },
        { returnDocument: 'after' },
      );
      if (!updated) return null;

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
}
