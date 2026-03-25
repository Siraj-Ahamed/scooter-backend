const mongoose = require('mongoose');

/* ── Per-student sub-document ───────────────────────────── */
const studentSchema = new mongoose.Schema(
  {
    name:       { type: String, trim: true, default: '' },
    mark:       { type: Number, required: true, min: 0, max: 100 },
    grade:      { type: String, required: true },
    zScore:     { type: Number, required: true },
    percentile: { type: Number, required: true },
    rank:       { type: Number, required: true },
  },
  { _id: false }
);

/* ── Session document ────────────────────────────────────── */
const zScoreSessionSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    label: { type: String, trim: true, default: '' },
    stats: {
      mean:   { type: Number, required: true },
      stdDev: { type: Number, required: true },
      median: { type: Number, required: true },
      high:   { type: Number, required: true },
      low:    { type: Number, required: true },
      count:  { type: Number, required: true },
    },
    gradeDistribution: {
      'A+': { type: Number, default: 0 },
      'A':  { type: Number, default: 0 },
      'A-': { type: Number, default: 0 },
      'B':  { type: Number, default: 0 },
      'C':  { type: Number, default: 0 },
      'S':  { type: Number, default: 0 },
      'W+': { type: Number, default: 0 },
      'W':  { type: Number, default: 0 },
    },
    students: { type: [studentSchema], required: true },
  },
  {
    timestamps: true,
    collection: 'zscore_sessions',
  }
);

zScoreSessionSchema.index({ createdAt: -1 });
zScoreSessionSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('ZScoreSession', zScoreSessionSchema);
