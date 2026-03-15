const { getDistance }      = require("geolib");
const { getClient }        = require("../config/mqtt");
const Scooter              = require("../models/Scooter");
const Geofence             = require("../models/Geofence");
const Trip                 = require("../models/Trip");
const Alert                = require("../models/Alert");
const { isInsideGeofence } = require("./geofenceService");

/*
 * MQTT Topics
 *   IoT  → Server  :  scooters/{imei}/telemetry
 *   Server → IoT   :  scooters/{imei}/commands
 *
 * Security layers:
 *   1. Broker level  — username/password required (Mosquitto passwd.txt)
 *   2. Topic level   — ACL restricts what each user can pub/sub (acl.txt)
 *   3. App level     — IMEI whitelist: only registered scooters are processed
 */

// ── IMEI whitelist cache ───────────────────────────────────────────────────────
// Loaded from MongoDB on startup, refreshed every 5 minutes.
// Avoids a DB hit on every single MQTT message.
let knownImeis       = new Set();
let isCacheWarmedUp  = false;
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

async function refreshImeiCache() {
  try {
    const scooters = await Scooter.find({}, "imei").lean();
    knownImeis     = new Set(scooters.map((s) => s.imei));
    isCacheWarmedUp = true;
    console.log(`🔑 IMEI cache refreshed — ${knownImeis.size} registered device(s)`);
  } catch (err) {
    console.error("❌ Failed to refresh IMEI cache:", err.message);
  }
}

// Called by scooters route when a new scooter is registered,
// so the cache is immediately up to date without waiting for the TTL.
function addImeiToCache(imei) {
  knownImeis.add(imei);
}

// Called by scooters route when a scooter is deleted.
function removeImeiFromCache(imei) {
  knownImeis.delete(imei);
}

// ── Geofence state cache ───────────────────────────────────────────────────────
// Tracks which zones each scooter was inside on the previous telemetry tick.
// Key: scooterId string → Value: Set<geofenceId string>
const geofenceStateCache = {};

// ─────────────────────────────────────────────────────────────────────────────
// init — call once at server startup, pass Socket.io instance
// ─────────────────────────────────────────────────────────────────────────────
async function init(io) {
  // Warm up IMEI cache before subscribing
  await refreshImeiCache();
  // Refresh periodically
  setInterval(refreshImeiCache, CACHE_TTL_MS);

  const client = getClient();

  client.subscribe("scooters/+/telemetry", (err) => {
    if (err) console.error("❌ MQTT subscribe error:", err.message);
    else     console.log("✅ MQTT subscribed to scooters/+/telemetry");
  });

  client.on("message", async (topic, payload) => {
    try {
      const parts = topic.split("/");
      // Validate topic structure: scooters/{imei}/telemetry
      if (parts.length !== 3 || parts[0] !== "scooters" || parts[2] !== "telemetry") {
        console.warn(`⚠️  Unexpected topic format: ${topic}`);
        return;
      }

      const imei = parts[1];

      // ── Layer 3: IMEI whitelist check ──────────────────────────────────────
      if (isCacheWarmedUp && !knownImeis.has(imei)) {
        console.warn(`🚫 Rejected message from unknown IMEI: ${imei}`);
        return; // silently drop — don't process or respond
      }

      // ── Payload validation ─────────────────────────────────────────────────
      let data;
      try {
        data = JSON.parse(payload.toString());
      } catch {
        console.warn(`⚠️  Invalid JSON payload from IMEI ${imei} — ignored`);
        return;
      }

      if (typeof data.lat !== "number" || typeof data.lng !== "number") {
        console.warn(`⚠️  Missing lat/lng in payload from IMEI ${imei} — ignored`);
        return;
      }

      await handleTelemetry(io, imei, data);
    } catch (err) {
      console.error("❌ MQTT message processing error:", err.message);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// handleTelemetry — core pipeline for every valid incoming message
// ─────────────────────────────────────────────────────────────────────────────
async function handleTelemetry(io, imei, data) {
  const { lat, lng, battery, signal, lockStatus, speed, heading, engineOn } = data;

  const scooter = await Scooter.findOne({ imei });
  if (!scooter) {
    // Edge case: cache was stale, IMEI no longer in DB
    console.warn(`⚠️  IMEI ${imei} passed cache but not found in DB — refreshing cache`);
    await refreshImeiCache();
    return;
  }

  // Snapshot previous state for transition detection
  const prev = {
    engineOn: scooter.engineOn,
    isMoving: scooter.isMoving,
    battery:  scooter.battery,
  };

  const nowMoving = (speed ?? 0) > 0;

  // Update live telemetry
  scooter.location   = { lat, lng };
  scooter.speed      = speed      ?? scooter.speed;
  scooter.heading    = heading    ?? scooter.heading;
  scooter.battery    = battery    ?? scooter.battery;
  scooter.signal     = signal     ?? scooter.signal;
  scooter.lockStatus = lockStatus ?? scooter.lockStatus;
  scooter.engineOn   = engineOn   ?? scooter.engineOn;
  scooter.isMoving   = nowMoving;
  scooter.lastSeen   = new Date();

  // Derive status
  if (!scooter.engineOn)  scooter.status = "parked";
  else if (nowMoving)     scooter.status = "moving";
  else                    scooter.status = "idle";

  await scooter.save();

  // Broadcast real-time update to frontend
  io.emit("scooter:update", {
    scooterId:  scooter._id,
    imei,
    lat,
    lng,
    speed:      scooter.speed,
    heading:    scooter.heading,
    battery:    scooter.battery,
    signal:     scooter.signal,
    engineOn:   scooter.engineOn,
    lockStatus: scooter.lockStatus,
    isMoving:   scooter.isMoving,
    status:     scooter.status,
    lastSeen:   scooter.lastSeen,
  });

  // ── Engine state change ────────────────────────────────────────────────────
  if (engineOn !== undefined && engineOn !== prev.engineOn) {
    const type    = engineOn ? "engine_on" : "engine_off";
    const message = engineOn
      ? `Engine turned ON — ${scooter.name}`
      : `Engine turned OFF — ${scooter.name}`;
    await saveAndEmitAlert(io, scooter, type, message, { location: { lat, lng } });
  }

  // ── Speed alert ────────────────────────────────────────────────────────────
  if (scooter.speedLimit > 0 && scooter.speed > scooter.speedLimit) {
    await saveAndEmitAlert(
      io, scooter, "speed_alert",
      `${scooter.name} exceeded speed limit: ${scooter.speed} km/h (limit: ${scooter.speedLimit} km/h)`,
      { speed: scooter.speed, speedLimit: scooter.speedLimit, location: { lat, lng } }
    );
  }

  // ── Low battery alert ──────────────────────────────────────────────────────
  if (
    scooter.lowBatteryThreshold > 0 &&
    scooter.battery <= scooter.lowBatteryThreshold &&
    prev.battery > scooter.lowBatteryThreshold
  ) {
    await saveAndEmitAlert(
      io, scooter, "low_battery",
      `${scooter.name} battery is low: ${scooter.battery}%`,
      { battery: scooter.battery, location: { lat, lng } }
    );
  }

  // ── Anti-theft ─────────────────────────────────────────────────────────────
  if (scooter.antitheftEnabled && !scooter.engineOn && nowMoving && !prev.isMoving) {
    scooter.antitheftTriggered = true;
    await scooter.save();

    await saveAndEmitAlert(
      io, scooter, "theft_detected",
      `⚠️ Unauthorized movement detected — ${scooter.name}`,
      { location: { lat, lng } }
    );

    sendCommand(imei, "engine_off");
    sendCommand(imei, "lock");

    await saveAndEmitAlert(
      io, scooter, "immobilized",
      `${scooter.name} automatically immobilized (anti-theft)`,
      { location: { lat, lng } }
    );
  }

  // ── Geofence check ─────────────────────────────────────────────────────────
  await processGeofences(io, scooter, { lat, lng });

  // ── Trip tracking ──────────────────────────────────────────────────────────
  await trackTrip(scooter, { lat, lng, speed: scooter.speed, heading: scooter.heading });
}

// ─────────────────────────────────────────────────────────────────────────────
// processGeofences
// ─────────────────────────────────────────────────────────────────────────────
async function processGeofences(io, scooter, location) {
  const scooterId = String(scooter._id);
  const geofences = await Geofence.find({ scooter: scooter._id, active: true });
  if (!geofences.length) return;

  if (!geofenceStateCache[scooterId]) {
    const initialInside = new Set();
    for (const gf of geofences) {
      if (isInsideGeofence(location, gf)) initialInside.add(String(gf._id));
    }
    geofenceStateCache[scooterId] = initialInside;
    return;
  }

  const prevInside = geofenceStateCache[scooterId];
  const nowInside  = new Set();

  for (const gf of geofences) {
    const gfId   = String(gf._id);
    const inside = isInsideGeofence(location, gf);
    if (inside) nowInside.add(gfId);

    const wasInside = prevInside.has(gfId);

    if (wasInside && !inside) {
      console.log(`🚨 GEOFENCE EXIT: ${scooter.imei} left "${gf.name}"`);
      await saveAndEmitAlert(
        io, scooter, "geofence_exit",
        `${scooter.name} left geofence zone "${gf.name}"`,
        { geofenceName: gf.name, location }
      );
      io.emit("geofence:exit", {
        scooterId: scooter._id, imei: scooter.imei,
        geofenceId: gf._id, geofenceName: gf.name, location, timestamp: new Date(),
      });
      if (gf.onExit === "lock_engine") {
        sendCommand(scooter.imei, "engine_off");
        sendCommand(scooter.imei, "lock");
        await saveAndEmitAlert(
          io, scooter, "immobilized",
          `${scooter.name} immobilized after leaving geofence "${gf.name}"`,
          { geofenceName: gf.name, location }
        );
      }
    }

    if (!wasInside && inside) {
      console.log(`✅ GEOFENCE ENTER: ${scooter.imei} entered "${gf.name}"`);
      await saveAndEmitAlert(
        io, scooter, "geofence_enter",
        `${scooter.name} entered geofence zone "${gf.name}"`,
        { geofenceName: gf.name, location }
      );
      io.emit("geofence:enter", {
        scooterId: scooter._id, imei: scooter.imei,
        geofenceId: gf._id, geofenceName: gf.name, location, timestamp: new Date(),
      });
    }
  }

  geofenceStateCache[scooterId] = nowInside;
}

// ─────────────────────────────────────────────────────────────────────────────
// trackTrip
// ─────────────────────────────────────────────────────────────────────────────
async function trackTrip(scooter, point) {
  const { lat, lng, speed, heading } = point;

  if (scooter.engineOn) {
    let trip = await Trip.findOne({ scooter: scooter._id, status: "active" });
    if (!trip) {
      trip = await Trip.create({
        scooter: scooter._id, owner: scooter.owner,
        startTime: new Date(), startLocation: { lat, lng },
        route: [], status: "active",
      });
      console.log(`🛣️  Trip started: ${scooter.imei}`);
    }

    trip.route.push({ lat, lng, speed, heading, timestamp: new Date() });
    if (speed > trip.maxSpeedKmh) trip.maxSpeedKmh = speed;

    if (trip.route.length >= 2) {
      const prev = trip.route[trip.route.length - 2];
      const curr = trip.route[trip.route.length - 1];
      trip.distanceKm += getDistance(
        { latitude: prev.lat, longitude: prev.lng },
        { latitude: curr.lat, longitude: curr.lng }
      ) / 1000; // geolib returns metres, convert to km
    }

    const movingSpeeds = trip.route.map((p) => p.speed).filter((s) => s > 0);
    if (movingSpeeds.length) {
      trip.avgSpeedKmh = movingSpeeds.reduce((a, b) => a + b, 0) / movingSpeeds.length;
    }

    await trip.save();
  } else {
    const trip = await Trip.findOne({ scooter: scooter._id, status: "active" });
    if (trip) {
      trip.status      = "completed";
      trip.endTime     = new Date();
      trip.endLocation = { lat, lng };
      trip.durationMin = Math.round((trip.endTime - trip.startTime) / 60000);
      await trip.save();
      console.log(`🏁 Trip completed: ${scooter.imei} — ${trip.distanceKm.toFixed(2)} km`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveAndEmitAlert
// ─────────────────────────────────────────────────────────────────────────────
async function saveAndEmitAlert(io, scooter, type, message, meta = {}) {
  try {
    const alert = await Alert.create({ owner: scooter.owner, scooter: scooter._id, type, message, meta });
    io.emit("alert:new", {
      alertId: alert._id, scooterId: scooter._id, imei: scooter.imei,
      type, message, meta, timestamp: alert.createdAt,
    });
  } catch (err) {
    console.error("❌ Failed to save alert:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendCommand — publish a command to an IoT device
// ─────────────────────────────────────────────────────────────────────────────
function sendCommand(imei, command, extra = {}) {
  const client  = getClient();
  const topic   = `scooters/${imei}/commands`;
  const payload = JSON.stringify({ command, ...extra, timestamp: new Date() });
  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) console.error(`❌ Command "${command}" to ${imei} failed:`, err.message);
    else     console.log(`📤 Command "${command}" → ${imei}`);
  });
}

module.exports = { init, sendCommand, addImeiToCache, removeImeiFromCache };
