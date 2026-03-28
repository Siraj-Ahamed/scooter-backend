const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const DEVICE_TYPES = ['gps_tracker', 'obd_dongle', 'custom_iot', 'sim_module', 'other'];

const deviceSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    serialNumber: {
      type: String,
      required: [true, 'Serial number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    name: {
      type: String,
      required: [true, 'Device name is required'],
      trim: true,
      maxlength: 80,
    },
    deviceType: {
      type: String,
      enum: DEVICE_TYPES,
      default: 'gps_tracker',
    },

    // ── Ownership ─────────────────────────────────────────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Assignment ────────────────────────────────────────────────────────────
    // null = unassigned (in stock / spare)
    assignedVehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Scooter',
      default: null,
    },
    assignedAt: { type: Date, default: null },

    // ── Hardware info ─────────────────────────────────────────────────────────
    manufacturer: { type: String, trim: true, default: '' },
    model:        { type: String, trim: true, default: '' },
    firmwareVersion: { type: String, trim: true, default: '' },

    // ── SIM / connectivity ────────────────────────────────────────────────────
    simNumber:  { type: String, trim: true, default: '' }, // ICCID or phone number
    simCarrier: { type: String, trim: true, default: '' },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['active', 'inactive', 'faulty', 'retired'],
      default: 'inactive',
    },

    // ── Last seen from MQTT telemetry ─────────────────────────────────────────
    lastSeenAt: { type: Date, default: null },

    // ── Free-text notes ───────────────────────────────────────────────────────
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

deviceSchema.index({ serialNumber: 1 });
deviceSchema.index({ owner: 1 });
deviceSchema.index({ assignedVehicle: 1 });
deviceSchema.index({ status: 1 });
deviceSchema.plugin(mongoosePaginate);

const Device = mongoose.model('Device', deviceSchema);
module.exports = Device;
