const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const zoneSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:  { type: String, required: [true, 'Zone name is required'], trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    color: { type: String, default: '#00e5ff' },
    polygon: {
      type:        { type: String, enum: ['Polygon'], default: 'Polygon' },
      coordinates: { type: [[[Number]]], required: true },
    },
    ringMeta: [
      {
        name:  { type: String, default: '' },
        color: { type: String, default: '#00e5ff' },
        type:  { type: String, enum: ['outer', 'exclusion'], default: 'outer' },
      },
    ],
    assignedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

zoneSchema.index({ owner: 1 });
zoneSchema.plugin(mongoosePaginate);

const Zone = mongoose.models.Zone || mongoose.model('Zone', zoneSchema);
module.exports = Zone;
