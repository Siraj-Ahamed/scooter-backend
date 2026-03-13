/**
 * seed.js — populates the database with sample data for testing
 *
 * Run with:  node seed.js
 *
 * What it creates:
 *   - 1 admin user
 *   - 2 vehicle owners
 *   - 4 scooters (2 per owner)
 *   - 2 geofences (circle + polygon)
 *   - 4 completed trips with GPS routes
 *   - 8 alerts of various types
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const User     = require("./src/models/User");
const Scooter  = require("./src/models/Scooter");
const Geofence = require("./src/models/Geofence");
const Trip     = require("./src/models/Trip");
const Alert    = require("./src/models/Alert");

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Move a GPS point forward by `metres` in a given `heading` (degrees) */
function movePoint(lat, lng, metres, heading) {
  const R   = 6371000;
  const d   = metres / R;
  const brg = (heading * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

/** Build a GPS breadcrumb route simulating a scooter trip */
function buildRoute(startLat, startLng, heading, points, intervalMetres, speedKmh) {
  const route = [];
  let lat = startLat, lng = startLng;
  const now = new Date();

  for (let i = 0; i < points; i++) {
    route.push({
      lat,
      lng,
      speed:     speedKmh + Math.floor(Math.random() * 5 - 2),
      heading,
      timestamp: new Date(now.getTime() - (points - i) * 5000), // 5 s intervals
    });
    const next = movePoint(lat, lng, intervalMetres, heading);
    lat = next.lat;
    lng = next.lng;
  }
  return route;
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // Wipe existing data
  await Promise.all([
    User.deleteMany({}),
    Scooter.deleteMany({}),
    Geofence.deleteMany({}),
    Trip.deleteMany({}),
    Alert.deleteMany({}),
  ]);
  console.log("🗑️  Cleared existing data");

  const hash = (pw) => bcrypt.hash(pw, 10);

  // ── USERS ────────────────────────────────────────────────────────────────────
  const [admin, owner1, owner2] = await User.insertMany([
    {
      name:     "Admin User",
      email:    "admin@scooter.com",
      password: await hash("admin123"),
      phone:    "+94 77 000 0000",
      role:     "admin",
    },
    {
      name:     "Kasun Perera",
      email:    "kasun@example.com",
      password: await hash("password123"),
      phone:    "+94 77 111 2233",
      role:     "owner",
    },
    {
      name:     "Nimali Fernando",
      email:    "nimali@example.com",
      password: await hash("password123"),
      phone:    "+94 71 987 6543",
      role:     "owner",
    },
  ]);
  console.log("👤 Users created");

  // ── SCOOTERS ─────────────────────────────────────────────────────────────────
  // Colombo, Sri Lanka coordinates
  const [s1, s2, s3, s4] = await Scooter.insertMany([
    {
      // owner1 — scooter A  (moving, engine on)
      name:        "Blue Flash",
      model:       "Xiaomi Mi Pro 2",
      plateNumber: "WP CAA-1234",
      imei:        "IMEI-001-KASUN-A",
      owner:       owner1._id,
      location:    { lat: 6.9271, lng: 79.8612 },
      speed:       18,
      heading:     90,
      battery:     72,
      signal:      -68,
      engineOn:    true,
      lockStatus:  "unlocked",
      isMoving:    true,
      status:      "moving",
      lastSeen:    new Date(),
      speedLimit:          40,
      lowBatteryThreshold: 20,
      antitheftEnabled:    true,
    },
    {
      // owner1 — scooter B  (parked, engine off)
      name:        "Red Rocket",
      model:       "Ninebot Max G30",
      plateNumber: "WP CBB-5678",
      imei:        "IMEI-002-KASUN-B",
      owner:       owner1._id,
      location:    { lat: 6.9355, lng: 79.8502 },
      speed:       0,
      heading:     0,
      battery:     15,   // low battery — should trigger alert
      signal:      -82,
      engineOn:    false,
      lockStatus:  "locked",
      isMoving:    false,
      status:      "parked",
      lastSeen:    new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      speedLimit:          35,
      lowBatteryThreshold: 20,
      antitheftEnabled:    false,
    },
    {
      // owner2 — scooter C  (idle — engine on but not moving)
      name:        "Green Streak",
      model:       "Segway Ninebot E45",
      plateNumber: "WP DCC-9012",
      imei:        "IMEI-003-NIMALI-C",
      owner:       owner2._id,
      location:    { lat: 6.9147, lng: 79.8728 },
      speed:       0,
      heading:     180,
      battery:     91,
      signal:      -55,
      engineOn:    true,
      lockStatus:  "unlocked",
      isMoving:    false,
      status:      "idle",
      lastSeen:    new Date(),
      speedLimit:          45,
      lowBatteryThreshold: 15,
      antitheftEnabled:    true,
    },
    {
      // owner2 — scooter D  (maintenance)
      name:        "Yellow Thunder",
      model:       "Xiaomi Mi 3 Lite",
      plateNumber: "WP EDD-3456",
      imei:        "IMEI-004-NIMALI-D",
      owner:       owner2._id,
      location:    { lat: 6.9500, lng: 79.8550 },
      speed:       0,
      heading:     0,
      battery:     45,
      signal:      0,
      engineOn:    false,
      lockStatus:  "locked",
      isMoving:    false,
      status:      "maintenance",
      lastSeen:    new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 h ago
      speedLimit:          0,
      lowBatteryThreshold: 20,
      antitheftEnabled:    false,
    },
  ]);
  console.log("🛴 Scooters created");

  // ── GEOFENCES ─────────────────────────────────────────────────────────────────
  await Geofence.insertMany([
    {
      // Circle geofence — "Home Zone" for s1 (Kasun scooter A)
      name:    "Home Zone",
      owner:   owner1._id,
      scooter: s1._id,
      type:    "circle",
      center:  { lat: 6.9271, lng: 79.8612 },
      radius:  500, // 500 metres
      onExit:  "lock_engine",
      active:  true,
    },
    {
      // Polygon geofence — "City Limits" for s2 (Kasun scooter B)
      name:    "City Limits",
      owner:   owner1._id,
      scooter: s2._id,
      type:    "polygon",
      coordinates: [
        { lat: 6.9500, lng: 79.8400 },
        { lat: 6.9500, lng: 79.8800 },
        { lat: 6.9100, lng: 79.8800 },
        { lat: 6.9100, lng: 79.8400 },
      ],
      onExit:  "alert_only",
      active:  true,
    },
    {
      // Circle geofence — "Office Zone" for s3 (Nimali scooter C)
      name:    "Office Zone",
      owner:   owner2._id,
      scooter: s3._id,
      type:    "circle",
      center:  { lat: 6.9147, lng: 79.8728 },
      radius:  300,
      onExit:  "lock_engine",
      active:  true,
    },
    {
      // Inactive geofence example
      name:    "Old Zone (disabled)",
      owner:   owner2._id,
      scooter: s4._id,
      type:    "circle",
      center:  { lat: 6.9500, lng: 79.8550 },
      radius:  200,
      onExit:  "alert_only",
      active:  false,
    },
  ]);
  console.log("📍 Geofences created");

  // ── TRIPS ─────────────────────────────────────────────────────────────────────
  const now = Date.now();

  // Trip 1 — s1 completed trip today (morning commute)
  const route1 = buildRoute(6.9271, 79.8612, 90, 40, 30, 20);
  const trip1End = movePoint(6.9271, 79.8612, 40 * 30, 90);
  await Trip.create({
    scooter:       s1._id,
    owner:         owner1._id,
    startTime:     new Date(now - 3 * 60 * 60 * 1000),   // 3 h ago
    endTime:       new Date(now - 2.5 * 60 * 60 * 1000), // 2.5 h ago
    startLocation: { lat: 6.9271, lng: 79.8612 },
    endLocation:   trip1End,
    route:         route1,
    distanceKm:    1.2,
    maxSpeedKmh:   24,
    avgSpeedKmh:   19,
    durationMin:   30,
    status:        "completed",
  });

  // Trip 2 — s1 active trip right now
  const route2 = buildRoute(6.9271, 79.8612, 45, 20, 25, 18);
  await Trip.create({
    scooter:       s1._id,
    owner:         owner1._id,
    startTime:     new Date(now - 8 * 60 * 1000), // started 8 min ago
    startLocation: { lat: 6.9271, lng: 79.8612 },
    route:         route2,
    distanceKm:    0.5,
    maxSpeedKmh:   22,
    avgSpeedKmh:   18,
    status:        "active",
  });

  // Trip 3 — s2 completed trip yesterday
  const route3 = buildRoute(6.9355, 79.8502, 270, 60, 20, 25);
  const trip3End = movePoint(6.9355, 79.8502, 60 * 20, 270);
  await Trip.create({
    scooter:       s2._id,
    owner:         owner1._id,
    startTime:     new Date(now - 26 * 60 * 60 * 1000),
    endTime:       new Date(now - 25 * 60 * 60 * 1000),
    startLocation: { lat: 6.9355, lng: 79.8502 },
    endLocation:   trip3End,
    route:         route3,
    distanceKm:    1.2,
    maxSpeedKmh:   31,
    avgSpeedKmh:   25,
    durationMin:   60,
    status:        "completed",
  });

  // Trip 4 — s3 completed trip today
  const route4 = buildRoute(6.9147, 79.8728, 180, 35, 30, 22);
  const trip4End = movePoint(6.9147, 79.8728, 35 * 30, 180);
  await Trip.create({
    scooter:       s3._id,
    owner:         owner2._id,
    startTime:     new Date(now - 4 * 60 * 60 * 1000),
    endTime:       new Date(now - 3 * 60 * 60 * 1000),
    startLocation: { lat: 6.9147, lng: 79.8728 },
    endLocation:   trip4End,
    route:         route4,
    distanceKm:    1.05,
    maxSpeedKmh:   28,
    avgSpeedKmh:   22,
    durationMin:   60,
    status:        "completed",
  });
  console.log("🛣️  Trips created");

  // ── ALERTS ────────────────────────────────────────────────────────────────────
  await Alert.insertMany([
    {
      owner:   owner1._id,
      scooter: s1._id,
      type:    "engine_on",
      message: "Engine turned ON — Blue Flash",
      read:    true,
      meta:    { location: { lat: 6.9271, lng: 79.8612 } },
      createdAt: new Date(now - 3 * 60 * 60 * 1000),
    },
    {
      owner:   owner1._id,
      scooter: s1._id,
      type:    "speed_alert",
      message: "Blue Flash exceeded speed limit: 48 km/h (limit: 40 km/h)",
      read:    false,
      meta:    { speed: 48, speedLimit: 40, location: { lat: 6.9280, lng: 79.8630 } },
      createdAt: new Date(now - 2.8 * 60 * 60 * 1000),
    },
    {
      owner:   owner1._id,
      scooter: s1._id,
      type:    "geofence_exit",
      message: "Blue Flash left geofence zone \"Home Zone\"",
      read:    false,
      meta:    { geofenceName: "Home Zone", location: { lat: 6.9310, lng: 79.8670 } },
      createdAt: new Date(now - 2.5 * 60 * 60 * 1000),
    },
    {
      owner:   owner1._id,
      scooter: s1._id,
      type:    "immobilized",
      message: "Blue Flash immobilized after leaving geofence \"Home Zone\"",
      read:    false,
      meta:    { geofenceName: "Home Zone", location: { lat: 6.9310, lng: 79.8670 } },
      createdAt: new Date(now - 2.5 * 60 * 60 * 1000),
    },
    {
      owner:   owner1._id,
      scooter: s2._id,
      type:    "low_battery",
      message: "Red Rocket battery is low: 15%",
      read:    false,
      meta:    { battery: 15, location: { lat: 6.9355, lng: 79.8502 } },
      createdAt: new Date(now - 15 * 60 * 1000),
    },
    {
      owner:   owner1._id,
      scooter: s2._id,
      type:    "engine_off",
      message: "Engine turned OFF — Red Rocket",
      read:    true,
      meta:    { location: { lat: 6.9355, lng: 79.8502 } },
      createdAt: new Date(now - 10 * 60 * 1000),
    },
    {
      owner:   owner2._id,
      scooter: s3._id,
      type:    "geofence_enter",
      message: "Green Streak entered geofence zone \"Office Zone\"",
      read:    true,
      meta:    { geofenceName: "Office Zone", location: { lat: 6.9147, lng: 79.8728 } },
      createdAt: new Date(now - 60 * 60 * 1000),
    },
    {
      owner:   owner2._id,
      scooter: s3._id,
      type:    "theft_detected",
      message: "⚠️ Unauthorized movement detected — Green Streak",
      read:    false,
      meta:    { location: { lat: 6.9150, lng: 79.8730 } },
      createdAt: new Date(now - 20 * 60 * 1000),
    },
  ]);
  console.log("🔔 Alerts created");

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Seed complete! Use these credentials to test:\n");
  console.log("  👤 Admin");
  console.log("     email   : admin@scooter.com");
  console.log("     password: admin123\n");
  console.log("  👤 Owner 1 — Kasun (2 scooters)");
  console.log("     email   : kasun@example.com");
  console.log("     password: password123\n");
  console.log("  👤 Owner 2 — Nimali (2 scooters)");
  console.log("     email   : nimali@example.com");
  console.log("     password: password123\n");
  console.log("  🛴 Scooters & IMEIs:");
  console.log("     Blue Flash    → IMEI-001-KASUN-A  (moving, engine ON)");
  console.log("     Red Rocket    → IMEI-002-KASUN-B  (parked, low battery 15%)");
  console.log("     Green Streak  → IMEI-003-NIMALI-C (idle, engine ON)");
  console.log("     Yellow Thunder→ IMEI-004-NIMALI-D (maintenance)");
  console.log("\n  🧪 Simulate IoT telemetry (Mosquitto):");
  console.log('     mosquitto_pub -h localhost -t "scooters/IMEI-001-KASUN-A/telemetry" \\');
  console.log('       -m "{\\"lat\\":6.9271,\\"lng\\":79.8612,\\"battery\\":72,\\"signal\\":-68,\\"speed\\":20,\\"heading\\":90,\\"engineOn\\":true,\\"lockStatus\\":\\"unlocked\\"}"');
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
