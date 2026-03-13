const mongoose = require("mongoose");

/*
 * Geofence — virtual boundary tied to a specific scooter.
 * Supports two shapes: circle (center + radius) and polygon (array of points).
 *
 * Features covered:
 *   - Geofencing configuration
 *   - Alert or immobilize action on exit
 */
const geofenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "Home Zone", "City Limits"

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    scooter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Scooter",
      required: true,
    },

    // Shape
    type: {
      type: String,
      enum: ["circle", "polygon"],
      required: true,
    },

    // Circle fields
    center: {
      lat: { type: Number },
      lng: { type: Number },
    },
    radius: { type: Number }, // metres

    // Polygon fields
    coordinates: [
      {
        lat: { type: Number },
        lng: { type: Number },
        _id: false,
      },
    ],

    // Behaviour on breach
    onExit: {
      type: String,
      enum: ["alert_only", "lock_engine"], // alert_only = notify; lock_engine = notify + immobilize
      default: "lock_engine",
    },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Geofence", geofenceSchema);
