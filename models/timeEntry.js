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

module.exports = mongoose.model('TimeEntry', timeEntrySchema);
