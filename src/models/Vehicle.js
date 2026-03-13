const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const VEHICLE_TYPES = ['scooter', 'motorcycle', 'car', 'van', 'truck', 'bicycle', 'bus', 'other'];

const vehicleSchema = new mongoose.Schema(
  {
    name:       { type: String, required: [true, 'Vehicle name is required'], trim: true, maxlength: 50 },
    deviceId:   { type: String, required: [true, 'Device ID is required'], unique: true, trim: true, uppercase: true },
    vehicleType:{ type: String, enum: VEHICLE_TYPES, default: 'scooter' },
    owner:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['available', 'rented', 'locked', 'offline', 'maintenance'],
      default: 'offline',
    },
    isEngineOn: { type: Boolean, default: false },
    isOnline:   { type: Boolean, default: false },
    location: {
      type:        { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    // Legacy single zone reference (kept for backward compatibility)
    assignedZone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    // Multiple predefined zones can be assigned to a vehicle
    assignedZones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: [] }],

    geofence: {
      isEnabled:           { type: Boolean, default: false },
      name:                { type: String, default: '' },
      // useCustomZone: when true the vehicle uses its own drawn outer polygon;
      // when false it can rely on predefined assigned zones (if set).
      useCustomZone:       { type: Boolean, default: false },
      // useCustomExclusion: when true the vehicle has its own exclusion zones
      // drawn separately from the predefined zone's exclusions.
      useCustomExclusion:  { type: Boolean, default: false },
      polygon: {
        type:        { type: String, enum: ['Polygon'] },
        coordinates: { type: [[[Number]]] },
      },
      zoneMeta: [
        {
          name:  { type: String, default: '' },
          color: { type: String, default: '#00e5ff' },
          type:  { type: String, enum: ['outer', 'exclusion'], default: 'outer' },
        },
      ],
    },
    lastTelemetry: {
      speed:    { type: Number, default: 0 },
      battery:  { type: Number, default: 0 },
      odometer: { type: Number, default: 0 },
      timestamp:{ type: Date },
    },
    currentTrip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
    model:       { type: String, default: '' },
    plateNumber: { type: String, trim: true },
    color:       { type: String, default: '' },
    year:        { type: Number },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

vehicleSchema.index({ location: '2dsphere' });
vehicleSchema.index({ deviceId: 1 });
vehicleSchema.index({ owner: 1 });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ vehicleType: 1 });
vehicleSchema.plugin(mongoosePaginate);

// Keep model name 'Scooter' so existing MongoDB collection (scooters) is reused.
// Use mongoose.models check to avoid OverwriteModelError when both scooterController
// (legacy) and vehicleController require this file via different paths.
const Vehicle = mongoose.models.Scooter || mongoose.model('Scooter', vehicleSchema);
module.exports = Vehicle;
