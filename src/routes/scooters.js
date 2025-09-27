const express = require('express');
const router = express.Router();
const Scooter = require('../models/Scooter');
const { auth, adminOnly } = require('../middlewares/auth');

// GET /api/scooters?lng=..&lat=..&radius=meters
router.get('/', async (req,res) => {
  try{
    const { lng, lat, radius } = req.query;
    if(lng && lat){
      const lngN = parseFloat(lng), latN = parseFloat(lat);
      const maxDistance = radius ? parseInt(radius) : 1000; // meters
      // $geoNear in aggregation:
      const nearby = await Scooter.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [lngN, latN] },
            distanceField: "dist.calculated",
            maxDistance: maxDistance,
            spherical: true,
            query: { status: "available" }
          }
        }
      ]);
      return res.json(nearby);
    }
    const list = await Scooter.find();
    res.json(list);
  }catch(err){
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// create scooter (admin)
router.post('/', auth, adminOnly, async (req,res) => {
  try{
    const data = req.body;
    // ensure data.location is of form { type: 'Point', coordinates:[lng,lat] }
    const s = await Scooter.create(data);
    res.json(s);
  }catch(err){
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// update
router.patch('/:id', auth, adminOnly, async (req,res) => {
  try{
    const updated = await Scooter.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  }catch(err){
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// optional: endpoint for scooter/mobile to push location updates (authenticated)
router.post('/:id/location', auth, async (req,res) => {
  try{
    const { coords, battery } = req.body; // coords: [lng,lat]
    const update = {};
    if(coords) update.location = { type: 'Point', coordinates: coords };
    if(battery !== undefined) update.battery = battery;
    update.lastSeen = new Date();
    const s = await Scooter.findByIdAndUpdate(req.params.id, update, { new: true });
    // emit via socket.io to admin room (if server exported io)
    try{
      const { io } = require('../../server'); // careful: require circular? server exports io — works here
      if(io) io.to('admin').emit('scooterLocation', { scooterId: s._id, coords: s.location.coordinates, battery: s.battery });
    }catch(e){ /* ignore if circular import fails */ }
    res.json(s);
  }catch(err){
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
