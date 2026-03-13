const express  = require("express");
const Geofence = require("../models/Geofence");
const Scooter  = require("../models/Scooter");
const auth     = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// ── ownership guard ────────────────────────────────────────────────────────────
async function ownerOrAdmin(geofenceId, userId, role) {
  const g = await Geofence.findById(geofenceId);
  if (!g) return { error: "Geofence not found", status: 404 };
  if (role !== "admin" && String(g.owner) !== String(userId))
    return { error: "Access denied", status: 403 };
  return { geofence: g };
}

// POST /api/geofences
// Body: { name, scooterId, type, center?, radius?, coordinates?, onExit? }
router.post("/", async (req, res) => {
  try {
    const { name, scooterId, type, center, radius, coordinates, onExit } = req.body;
    if (!name || !scooterId || !type)
      return res.status(400).json({ message: "name, scooterId and type are required" });

    // Verify scooter belongs to user
    const scooter = await Scooter.findById(scooterId);
    if (!scooter) return res.status(404).json({ message: "Scooter not found" });
    if (req.user.role !== "admin" && String(scooter.owner) !== String(req.user.id))
      return res.status(403).json({ message: "Access denied" });

    if (type === "circle" && (!center || !radius))
      return res.status(400).json({ message: "Circle geofence requires center {lat,lng} and radius (metres)" });
    if (type === "polygon" && (!coordinates || coordinates.length < 3))
      return res.status(400).json({ message: "Polygon geofence requires at least 3 coordinates" });

    const geofence = await Geofence.create({
      name,
      owner:       req.user.id,
      scooter:     scooterId,
      type,
      center:      type === "circle"  ? center      : undefined,
      radius:      type === "circle"  ? radius      : undefined,
      coordinates: type === "polygon" ? coordinates : undefined,
      onExit:      onExit ?? "lock_engine",
    });

    res.status(201).json(geofence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geofences?scooterId=xxx
router.get("/", async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { owner: req.user.id };
    if (req.query.scooterId) filter.scooter = req.query.scooterId;
    const geofences = await Geofence.find(filter)
      .populate("scooter", "name model imei")
      .sort({ createdAt: -1 });
    res.json(geofences);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geofences/:id
router.get("/:id", async (req, res) => {
  try {
    const { geofence, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });
    res.json(geofence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/geofences/:id
router.put("/:id", async (req, res) => {
  try {
    const { geofence, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });

    const allowed = ["name", "center", "radius", "coordinates", "onExit", "active"];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    const updated = await Geofence.findByIdAndUpdate(geofence._id, updates, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/geofences/:id/toggle — enable/disable without deleting
router.patch("/:id/toggle", async (req, res) => {
  try {
    const { geofence, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });

    geofence.active = !geofence.active;
    await geofence.save();
    res.json({ message: `Geofence ${geofence.active ? "activated" : "deactivated"}`, active: geofence.active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/geofences/:id
router.delete("/:id", async (req, res) => {
  try {
    const { geofence, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });
    await geofence.deleteOne();
    res.json({ message: "Geofence deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
