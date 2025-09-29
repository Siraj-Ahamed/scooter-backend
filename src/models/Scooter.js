// const mongoose = require('mongoose');

// const ScooterSchema = new mongoose.Schema({
//   name: String,
//   model: String,
//   battery: { type: Number, default: 100 },
//   status: { type: String, enum: ['available','in_use','charging','maintenance'], default: 'available' },
//   location: {
//     type: { type: String, enum: ['Point'], default: 'Point' },
//     coordinates: { type: [Number], default: [0,0] } // [lng, lat]
//   },
//   lastSeen: Date
// });

// // create 2dsphere index for geo queries
// ScooterSchema.index({ location: '2dsphere' });

// module.exports = mongoose.model('Scooter', ScooterSchema);


const mongoose = require("mongoose");

const scooterSchema = new mongoose.Schema({
  model: { type: String, required: true },       // e.g. "Toyota Camry"
  description: { type: String, required: true },       // e.g. "ABC-123"
  battery: { type: Number, required: true },     // 85
  speed: { type: Number, required: true },     // 45
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ["available", "in-use", "charging"],
    default: "available"
  }
}, { timestamps: true });

module.exports = mongoose.model("Scooter", scooterSchema);
