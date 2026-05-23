// Time-entry schema.
const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  hours: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

timeEntrySchema.index({ taskId: 1, date: -1 });
timeEntrySchema.index({ userId: 1, date: -1 });

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);

module.exports = { TimeEntry };
