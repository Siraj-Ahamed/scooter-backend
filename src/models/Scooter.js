const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const scooterSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Scooter name is required'], trim: true, maxlength: 50 },
    deviceId: { type: String, required: [true, 'Device ID is required'], unique: true, trim: true, uppercase: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['available', 'rented', 'locked', 'offline', 'maintenance'],
      default: 'offline',
    },
    isEngineOn: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    geofence: {
      isEnabled: { type: Boolean, default: false },
      name: { type: String, default: '' },
      // GeoJSON Polygon:
      //   coordinates[0]     = outer allowed ring
      //   coordinates[1..n]  = exclusion hole rings (scooter must NOT be here)
      polygon: {
        type: { type: String, enum: ['Polygon'] },
        coordinates: { type: [[[Number]]] },
      },
      // Human-readable metadata for the outer zone + each exclusion hole
      // Index 0 = outer zone meta, index 1..n = exclusion zones
      zoneMeta: [
        {
          name:  { type: String, default: '' },
          color: { type: String, default: '#00e5ff' },
          type:  { type: String, enum: ['outer', 'exclusion'], default: 'outer' },
        },
      ],
    },
    lastTelemetry: {
      speed: { type: Number, default: 0 },
      battery: { type: Number, default: 0 },
      odometer: { type: Number, default: 0 },
      timestamp: { type: Date },
    },
    currentTrip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
    model: { type: String, default: '' },
    plateNumber: { type: String, trim: true },
    color: { type: String, default: '' },
    year: { type: Number },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

scooterSchema.index({ location: '2dsphere' });
scooterSchema.index({ deviceId: 1 });
scooterSchema.index({ owner: 1 });
scooterSchema.index({ status: 1 });
scooterSchema.plugin(mongoosePaginate);

const Scooter = mongoose.models.Scooter || mongoose.model('Scooter', scooterSchema);
module.exports = Scooter;
