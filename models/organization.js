const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  members: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Profile'
      },
      role: {
        type: String,
        enum: ['owner', 'admin', 'member'],
        default: 'member'
      }
    }
  ],
  projects: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Organization', organizationSchema);
