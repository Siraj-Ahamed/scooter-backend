const mqtt = require("mqtt");

let client = null;

const connect = () => {
  client = mqtt.connect(process.env.MQTT_BROKER_URL || "mqtt://localhost:1883", {
    clientId:        `scooter-server-${Math.random().toString(16).slice(2, 8)}`,
    clean:           true,
    reconnectPeriod: 5000,
    connectTimeout:  10000,
    // ── Broker Authentication (Layer 1) ──────────────────────────────────────
    // Credentials registered in C:\Program Files\mosquitto\passwd.txt
    username: process.env.MQTT_SERVER_USERNAME,
    password: process.env.MQTT_SERVER_PASSWORD,
  });

  client.on("connect", () => {
    console.log("✅ MQTT broker connected (authenticated as scooter-server)");
  });

  client.on("error", (err) => {
    // Common errors:
    //   "Connection refused: Bad username or password" → check passwd.txt
    //   "Connection refused: Not authorized"           → check acl.txt
    console.error("❌ MQTT error:", err.message);
  });

  client.on("offline", () => {
    console.warn("⚠️  MQTT offline — will reconnect automatically...");
  });

  client.on("reconnect", () => {
    console.log("🔄 MQTT reconnecting...");
  });

  return client;
};

const getClient = () => {
  if (!client) throw new Error("MQTT client not initialised. Call connect() first.");
  return client;
};

module.exports = { connect, getClient };
