// Git commit linked to a task/project.
const mongoose = require('mongoose');

const gitCommitSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  commitHash: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  author: {
    name: String,
    email: String,
  },
  branch: String,
  url: String,
  committedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

gitCommitSchema.index({ taskId: 1 });
gitCommitSchema.index({ projectId: 1 });
gitCommitSchema.index({ commitHash: 1 }, { unique: true });
gitCommitSchema.index({ projectId: 1, committedAt: -1 });

const GitCommit = mongoose.model('GitCommit', gitCommitSchema);

module.exports = { GitCommit };
