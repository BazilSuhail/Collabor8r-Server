const { Queue, Worker } = require('bullmq');
const { createRedisClient } = require('../config/redis');

if (!process.env.REDIS_URL) {
  module.exports = { activityQueue: null };
} else {
  const connection = createRedisClient('activity-queue');

  const activityQueue = new Queue('activity-logs', { connection });
  const activityWorker = new Worker(
  'activity-logs',
  async (job) => {
    const { actorId, actorName, actorAvatar, action, entityType, entityId, entityName, projectId, projectName, changes, description } = job.data;

    const { ActivityLog } = require('../activity/models');
    const { Profile } = require('../auth/models');
    const { Project } = require('../projects/models');

    const entryData = { actorId, action, entityType, entityId, changes, description };

    if (actorName) {
      entryData.actorName = actorName;
      entryData.actorAvatar = actorAvatar;
    } else if (actorId) {
      const p = await Profile.findById(actorId).select('name avatar').lean();
      if (p) {
        entryData.actorName = p.name;
        entryData.actorAvatar = p.avatar;
      }
    }

    if (entityName) entryData.entityName = entityName;

    if (projectId) {
      entryData.projectId = projectId;
      if (projectName) {
        entryData.projectName = projectName;
      } else {
        const proj = await Project.findById(projectId).select('name').lean();
        if (proj) entryData.projectName = proj.name;
      }
    }

    const entry = new ActivityLog(entryData);
    await entry.save();
    return entry;
  },
  {
    connection,
    concurrency: 20,
    limiter: { max: 100, duration: 1000 },
  }
);

activityWorker.on('failed', (job, err) => {
  console.error(`❌ Activity log job ${job.id} failed:`, err.message);
});

activityWorker.on('completed', (job) => {
  console.log(`✅ Activity log job ${job.id} completed`);
});

  module.exports = { activityQueue };
}
