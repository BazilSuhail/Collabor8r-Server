// Per-user notification inbox (doc _id mirrors Profile id).
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  notifications: [
    {
      _id: false,
      type: {
        type: String,
        required: true,
      },
      data: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({ createdAt: Date.now() }),
      },
      read: {
        type: Boolean,
        default: false,
      },
    },
  ],
});

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { Notification };
