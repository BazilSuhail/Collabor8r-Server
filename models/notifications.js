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
        type: String, // Represent the notification type
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

module.exports = mongoose.model('Notification', notificationSchema);
