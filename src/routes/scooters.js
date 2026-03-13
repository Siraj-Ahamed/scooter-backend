const express       = require("express");
const Scooter       = require("../models/Scooter");
const auth          = require("../middleware/auth");
const { sendCommand, addImeiToCache, removeImeiFromCache } = require("../services/mqttService");

const router = express.Router();
router.use(auth);

// ── ownership guard ────────────────────────────────────────────────────────────
async function ownerOrAdmin(scooterId, userId, role) {
  const s = await Scooter.findById(scooterId);
  if (!s) return { error: "Scooter not found", status: 404 };
  if (role !== "admin" && String(s.owner) !== String(userId))
    return { error: "Access denied", status: 403 };
  return { scooter: s };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

// POST /api/scooters
router.post("/", async (req, res) => {
  try {
    const { name, model, plateNumber, imei, speedLimit, lowBatteryThreshold } = req.body;
    if (!name || !model || !imei)
      return res.status(400).json({ message: "name, model and imei are required" });

    if (await Scooter.findOne({ imei }))
      return res.status(400).json({ message: "IMEI already registered" });

    const scooter = await Scooter.create({
      name, model, plateNumber, imei,
      owner:               req.user.id,
      speedLimit:          speedLimit          ?? 0,
      lowBatteryThreshold: lowBatteryThreshold ?? 20,
    });

    // Keep IMEI whitelist cache up to date immediately
    addImeiToCache(imei);

    res.status(201).json(scooter);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scooters
router.get("/", async (req, res) => {
  try {
    const filter   = req.user.role === "admin" ? {} : { owner: req.user.id };
    const scooters = await Scooter.find(filter).sort({ createdAt: -1 });
    res.json(scooters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scooters/:id
router.get("/:id", async (req, res) => {
  try {
    const { scooter, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });
    res.json(scooter);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/scooters/:id
router.put("/:id", async (req, res) => {
  try {
    const { scooter, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });

    const allowed = ["name", "model", "plateNumber", "speedLimit", "lowBatteryThreshold", "antitheftEnabled"];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    const updated = await Scooter.findByIdAndUpdate(scooter._id, updates, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/scooters/:id
router.delete("/:id", async (req, res) => {
  try {
    const { scooter, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });

    // Remove from IMEI cache so the device is immediately rejected
    removeImeiFromCache(scooter.imei);

    await scooter.deleteOne();
    res.json({ message: "Scooter deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REMOTE COMMANDS ───────────────────────────────────────────────────────────

// POST /api/scooters/:id/engine/on
router.post("/:id/engine/on", async (req, res) => {
  try {
    const { scooter, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });
    sendCommand(scooter.imei, "engine_on");
    res.json({ message: `Engine ON command sent to "${scooter.name}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scooters/:id/engine/off
router.post("/:id/engine/off", async (req, res) => {
  try {
    const { scooter, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });
    sendCommand(scooter.imei, "engine_off");
    res.json({ message: `Engine OFF command sent to "${scooter.name}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scooters/:id/lock
router.post("/:id/lock", async (req, res) => {
  try {
    const { scooter, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });
    sendCommand(scooter.imei, "lock");
    res.json({ message: `Lock command sent to "${scooter.name}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scooters/:id/unlock
router.post("/:id/unlock", async (req, res) => {
  try {
    const { scooter, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });
    sendCommand(scooter.imei, "unlock");
    res.json({ message: `Unlock command sent to "${scooter.name}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/scooters/:id/antitheft
router.patch("/:id/antitheft", async (req, res) => {
  try {
    const { scooter, error, status } = await ownerOrAdmin(req.params.id, req.user.id, req.user.role);
    if (error) return res.status(status).json({ message: error });

    scooter.antitheftEnabled = !scooter.antitheftEnabled;
    await scooter.save();
    sendCommand(scooter.imei, scooter.antitheftEnabled ? "antitheft_on" : "antitheft_off");

    res.json({
      message:          `Anti-theft ${scooter.antitheftEnabled ? "enabled" : "disabled"}`,
      antitheftEnabled: scooter.antitheftEnabled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
