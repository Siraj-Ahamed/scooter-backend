# Deploy Fleet Backend on Render (Free)

This backend is a Node/Express app that requires MongoDB, Redis, and MQTT.
The repo includes a `render.yaml` at the root for Render Blueprint deploys.

## 1) Create managed services (free tiers)

1. MongoDB Atlas: create a free M0 cluster and a database user.
2. Upstash Redis: create a free Redis database.
3. EMQX: use your current public broker setup or create an EMQX Cloud serverless deployment.

Collect the connection info for each service.

## 2) Deploy on Render

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and connect the repo.
3. Render will detect `render.yaml` and create a `fleet-backend` web service.

## 3) Set environment variables on Render

Set these in the Render dashboard for the `fleet-backend` service:

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
- `JWT_EXPIRE`
- `JWT_REFRESH_EXPIRE`
- `MQTT_TOPIC_TELEMETRY`
- `MQTT_TOPIC_STATUS`
- `ALLOWED_ORIGINS`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

## 4) Verify

After deploy, open the Render logs and confirm the server is listening on the Render port.
If CORS is enabled, make sure `ALLOWED_ORIGINS` includes your frontend URL.
If you are using the public EMQX broker (for example `mqtt://broker.emqx.io:1883`),
you can leave `MQTT_USERNAME` and `MQTT_PASSWORD` empty.
