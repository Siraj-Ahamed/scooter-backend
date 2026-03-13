const express = require("express");
const Trip    = require("../models/Trip");
const auth    = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// GET /api/trips
// Query: ?scooterId=  &status=completed  &days=7
router.get("/", async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { owner: req.user.id };
    if (req.query.scooterId) filter.scooter = req.query.scooterId;
    if (req.query.status)    filter.status  = req.query.status;
    if (req.query.days) {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(req.query.days));
      filter.startTime = { $gte: since };
    }

    // Exclude heavy route array for list views
    const trips = await Trip.find(filter)
      .populate("scooter", "name model imei")
      .select("-route")
      .sort({ startTime: -1 })
      .limit(200);

    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/:id  — full route included for playback
router.get("/:id", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id).populate("scooter", "name model imei");
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    if (req.user.role !== "admin" && String(trip.owner) !== String(req.user.id))
      return res.status(403).json({ message: "Access denied" });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id
router.delete("/:id", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    if (req.user.role !== "admin" && String(trip.owner) !== String(req.user.id))
      return res.status(403).json({ message: "Access denied" });
    await trip.deleteOne();
    res.json({ message: "Trip deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
