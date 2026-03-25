# Deploy Fleet Backend on Koyeb (No Card)

This backend is a Node/Express app that requires MongoDB, Redis, and MQTT.
Koyeb can build it directly from this Git repo using the Node.js buildpack.

## 1) Create managed services (free tiers)

1. MongoDB Atlas: create a free M0 cluster and a database user.
2. Upstash Redis: create a free Redis database.
3. EMQX: use your current public broker setup or create an EMQX Cloud serverless deployment.

Collect the connection info for each service.

## 2) Deploy on Koyeb

1. Push this repo to GitHub.
2. In Koyeb, click **Create App** and choose **GitHub** as the source.
3. Select this repository and set **Root directory** to `fleet-backend`.
4. Service type: **Web Service**.
5. Build command: leave default (Koyeb will run `npm install`).
6. Run command: `npm start` (Koyeb runs the `start` script by default).

## 3) Set environment variables on Koyeb

Required:
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

Redis:
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

MQTT (EMQX):
- `MQTT_BROKER_URL`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_CLIENT_ID`

Optional:
- `NODE_ENV` (set to `production`)
- `JWT_EXPIRE`
- `JWT_REFRESH_EXPIRE`
- `MQTT_TOPIC_TELEMETRY`
- `MQTT_TOPIC_STATUS`
- `ALLOWED_ORIGINS`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

If you are using the public EMQX broker (for example `mqtt://broker.emqx.io:1883`),
you can leave `MQTT_USERNAME` and `MQTT_PASSWORD` empty.

## 4) Verify

Open the Koyeb logs and confirm the server is listening on the assigned port.
If CORS is enabled, make sure `ALLOWED_ORIGINS` includes your frontend URL.

