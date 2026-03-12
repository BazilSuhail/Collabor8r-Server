const ActivityLog = require('../models/activityLog');
const Profile = require('../models/profile');
const Project = require('../models/projects');

async function logActivity({ actorId, actorName, actorAvatar, action, entityType, entityId, entityName, projectId, projectName, changes, description }) {
  try {
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
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

module.exports = { logActivity };
