const mongoose = require('mongoose');

const taskLinkSchema = new mongoose.Schema({
  sourceTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  targetTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  linkType: {
    type: String,
    enum: ['blocks', 'blocked-by', 'relates-to', 'duplicates', 'depends-on'],
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  }
});

module.exports = mongoose.model('TaskLink', taskLinkSchema);
