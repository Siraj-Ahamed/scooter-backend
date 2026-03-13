const express = require("express");
const Alert   = require("../models/Alert");
const auth    = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// GET /api/alerts
// Query: ?scooterId=  &type=speed_alert  &read=false
router.get("/", async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { owner: req.user.id };
    if (req.query.scooterId)      filter.scooter = req.query.scooterId;
    if (req.query.type)           filter.type    = req.query.type;
    if (req.query.read !== undefined) filter.read = req.query.read === "true";

    const alerts = await Alert.find(filter)
      .populate("scooter", "name model imei")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts/unread-count
router.get("/unread-count", async (req, res) => {
  try {
    const count = await Alert.countDocuments({ owner: req.user.id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/alerts/:id/read
router.patch("/:id/read", async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: "Alert not found" });
    if (req.user.role !== "admin" && String(alert.owner) !== String(req.user.id))
      return res.status(403).json({ message: "Access denied" });
    alert.read = true;
    await alert.save();
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/alerts/read-all
router.patch("/read-all", async (req, res) => {
  try {
    await Alert.updateMany({ owner: req.user.id, read: false }, { read: true });
    res.json({ message: "All alerts marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/alerts/:id
router.delete("/:id", async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: "Alert not found" });
    if (req.user.role !== "admin" && String(alert.owner) !== String(req.user.id))
      return res.status(403).json({ message: "Access denied" });
    await alert.deleteOne();
    res.json({ message: "Alert deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
