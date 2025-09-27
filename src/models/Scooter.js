const mongoose = require('mongoose');

const ScooterSchema = new mongoose.Schema({
  name: String,
  model: String,
  battery: { type: Number, default: 100 },
  status: { type: String, enum: ['available','in_use','charging','maintenance'], default: 'available' },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0,0] } // [lng, lat]
  },
  lastSeen: Date
});

// create 2dsphere index for geo queries
ScooterSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Scooter', ScooterSchema);
