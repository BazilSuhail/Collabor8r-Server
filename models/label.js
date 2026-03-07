const mongoose = require('mongoose');

const labelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: '#3498db'
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  }
});

module.exports = mongoose.model('Label', labelSchema);
