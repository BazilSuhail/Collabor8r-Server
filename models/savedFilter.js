const mongoose = require('mongoose');

const savedFilterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  query: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('SavedFilter', savedFilterSchema);
