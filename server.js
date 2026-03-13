require("dotenv").config();

const http       = require("http");
const express    = require("express");
const cors       = require("cors");
const { Server } = require("socket.io");

const connectDB    = require("./src/config/db");
const mqttConfig   = require("./src/config/mqtt");
const mqttService  = require("./src/services/mqttService");

const authRoutes     = require("./src/routes/auth");
const scooterRoutes  = require("./src/routes/scooters");
const geofenceRoutes = require("./src/routes/geofences");
const tripRoutes     = require("./src/routes/trips");
const alertRoutes    = require("./src/routes/alerts");

// ─── Express + HTTP server ─────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ─── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log(`🔌 Client connected    [${socket.id}]`);

  // Frontend can subscribe to a specific scooter room for targeted updates
  socket.on("subscribe:scooter", (scooterId) => {
    socket.join(`scooter:${scooterId}`);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected [${socket.id}]`);
  });
});

// ─── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── REST Routes ────────────────────────────────────────────────────────────────
app.get("/",              (_req, res) => res.send("🛴 Scooter Rental API"));
app.use("/api/auth",      authRoutes);
app.use("/api/scooters",  scooterRoutes);
app.use("/api/geofences", geofenceRoutes);
app.use("/api/trips",     tripRoutes);
app.use("/api/alerts",    alertRoutes);

// ─── Boot ───────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();          // 1. MongoDB
  mqttConfig.connect();       // 2. MQTT broker connection
  mqttService.init(io);       // 3. Subscribe to telemetry + start processing
  server.listen(PORT, () => {
    console.log(`🚀 Server running → http://localhost:${PORT}`);
  });
}

start();
