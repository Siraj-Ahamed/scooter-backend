const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const routePointSchema = new mongoose.Schema(
  { coordinates: { type: [Number], required: true }, speed: { type: Number, default: 0 }, timestamp: { type: Date, default: Date.now } },
  { _id: false }
);

const tripEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['geofence_exit', 'geofence_enter', 'engine_locked', 'engine_unlocked', 'low_battery', 'trip_started', 'trip_ended', 'sos'],
      required: true,
    },
    message: { type: String },
    location: { type: [Number] },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    scooter: { type: mongoose.Schema.Types.ObjectId, ref: 'Scooter', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rider: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'completed', 'cancelled', 'interrupted'], default: 'active' },
    startLocation: { address: String, coordinates: [Number] },
    endLocation: { address: String, coordinates: [Number] },
    route: [routePointSchema],
    distanceKm: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: 0 },
    events: [tripEventSchema],
    ratePerMinute: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    isPaid: { type: Boolean, default: false },
    notes: { type: String },
  },
  { timestamps: true }
);

tripSchema.index({ scooter: 1, status: 1 });
tripSchema.index({ owner: 1, createdAt: -1 });
tripSchema.index({ status: 1 });
tripSchema.plugin(mongoosePaginate);

const Trip = mongoose.model('Trip', tripSchema);
module.exports = Trip;
