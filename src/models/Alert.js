const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const alertSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scooter: { type: mongoose.Schema.Types.ObjectId, ref: 'Scooter', required: true },
    trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
    type: {
      type: String,
      enum: ['geofence_exit', 'geofence_enter', 'engine_locked', 'low_battery', 'offline', 'sos', 'speeding'],
      required: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    location: { coordinates: [Number] },
    isRead: { type: Boolean, default: false },
    readAt: Date,
    notificationSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

alertSchema.index({ owner: 1, isRead: 1, createdAt: -1 });
alertSchema.index({ scooter: 1 });
alertSchema.plugin(mongoosePaginate);

const Alert = mongoose.model('Alert', alertSchema);
module.exports = Alert;
