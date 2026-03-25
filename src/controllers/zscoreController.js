'use strict';

const ZScoreSession = require('../models/ZScoreSession');

/* ── Grade scale ────────────────────────────────────────── */
const GRADES = [
  { label: 'A+', min: 91, max: 100 },
  { label: 'A',  min: 81, max: 90  },
  { label: 'A-', min: 75, max: 80  },
  { label: 'B',  min: 65, max: 74  },
  { label: 'C',  min: 55, max: 64  },
  { label: 'S',  min: 45, max: 54  },
  { label: 'W+', min: 40, max: 44  },
  { label: 'W',  min: 0,  max: 39  },
];

function getGrade(mark) {
  for (const g of GRADES) {
    if (mark >= g.min && mark <= g.max) return g.label;
  }
  return 'W';
}

function mean(arr)       { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stdDev(arr, mu) { return Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length); }
function median(sorted)  {
  const n = sorted.length;
  return n % 2 === 0 ? (sorted[n/2-1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
}
function normalCDF(z) {
  const t = 1 / (1 + 0.2315419 * Math.abs(z));
  const d = 0.3989422820 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.821256 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}

/* ── POST /api/v1/zscore/analyse ────────────────────────── */
exports.analyse = async (req, res) => {
  try {
    const { label = '', students: rawStudents } = req.body;

    if (!Array.isArray(rawStudents) || rawStudents.length < 2) {
      return res.status(400).json({ success: false, message: 'Provide at least 2 students.' });
    }

    const students = [];
    for (let i = 0; i < rawStudents.length; i++) {
      const { name = '', mark } = rawStudents[i];
      const m = parseFloat(mark);
      if (isNaN(m) || m < 0 || m > 100) {
        return res.status(400).json({
          success: false,
          message: `Student at index ${i} has an invalid mark "${mark}". Must be 0–100.`,
        });
      }
      students.push({ name: (name + '').trim() || `Student ${i + 1}`, mark: m });
    }

    const marks  = students.map(s => s.mark);
    const mu     = mean(marks);
    const sigma  = stdDev(marks, mu);
    const sorted = [...marks].sort((a, b) => a - b);
    const med    = median(sorted);

    const results = students.map(s => {
      const z    = sigma > 0 ? (s.mark - mu) / sigma : 0;
      const perc = normalCDF(z) * 100;
      return { ...s, grade: getGrade(s.mark), zScore: z, percentile: perc };
    });

    // Sort desc, assign rank (ties = same rank)
    const ranked = [...results].sort((a, b) => b.mark - a.mark);
    let rank = 1;
    ranked.forEach((r, i) => {
      if (i > 0 && r.mark < ranked[i - 1].mark) rank = i + 1;
      r.rank = rank;
    });

    const dist = { 'A+': 0, 'A': 0, 'A-': 0, 'B': 0, 'C': 0, 'S': 0, 'W+': 0, 'W': 0 };
    ranked.forEach(r => { if (dist[r.grade] !== undefined) dist[r.grade]++; });

    const session = await ZScoreSession.create({
      createdBy: req.user?._id ?? null,
      label,
      stats: { mean: mu, stdDev: sigma, median: med, high: Math.max(...marks), low: Math.min(...marks), count: students.length },
      gradeDistribution: dist,
      students: ranked,
    });

    return res.status(201).json({
      success: true,
      data: {
        sessionId: session._id,
        label:     session.label,
        stats:     session.stats,
        gradeDistribution: session.gradeDistribution,
        students:  session.students,
        createdAt: session.createdAt,
      },
    });
  } catch (err) {
    console.error('[ZScore] analyse error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/* ── GET /api/v1/zscore/sessions ────────────────────────── */
exports.getSessions = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const filter = req.user ? { createdBy: req.user._id } : {};

    const [sessions, total] = await Promise.all([
      ZScoreSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-students').lean(),
      ZScoreSession.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: sessions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[ZScore] getSessions error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/* ── GET /api/v1/zscore/sessions/:id ────────────────────── */
exports.getSession = async (req, res) => {
  try {
    const session = await ZScoreSession.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    return res.json({ success: true, data: session });
  } catch (err) {
    console.error('[ZScore] getSession error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/* ── DELETE /api/v1/zscore/sessions/:id ─────────────────── */
exports.deleteSession = async (req, res) => {
  try {
    const session = await ZScoreSession.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    return res.json({ success: true, message: 'Session deleted.' });
  } catch (err) {
    console.error('[ZScore] deleteSession error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};
