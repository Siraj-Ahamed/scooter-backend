const express = require("express");
const Scooter = require("../models/Scooter");
const router = express.Router();
const auth = require("../middleware/auth")

// // Add scooter
// router.post("/", async (req, res) => {
//     try {
//         const { model, battery, location } = req.body;
//         const scooter = new Scooter({ model, battery, location });
//         await scooter.save();
//         res.status(201).json(scooter);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

// POST new scooter → only admin can create
router.post("/", auth, async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
  
    try {
      const scooter = await Scooter.create(req.body);
      res.status(201).json(scooter);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// // Get all scooters
// router.get("/", async (req, res) => {
//     try {
//         const scooters = await Scooter.find();
//         res.json(scooters);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

// GET all scooters → only admin can view
router.get("/", auth, async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
  
    try {
      const scooters = await Scooter.find();
      res.json(scooters);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  

// Update scooter
router.put("/:id", auth, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }
    try {
        const scooter = await Scooter.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        if (!scooter)
            return res.status(404).json({ message: "Scooter not found" });
        res.json(scooter);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete scooter
router.delete("/:id", async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }
    try {
        const scooter = await Scooter.findByIdAndDelete(req.params.id);
        if (!scooter)
            return res.status(404).json({ message: "Scooter not found" });
        res.json({ message: "Scooter deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
