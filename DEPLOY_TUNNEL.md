# Tunnel Setup (No Hosting Account)

This option exposes your local backend to the internet without a hosting provider.
Keep your machine running while you need the API online.

## Option A: Cloudflare Quick Tunnel (no account)

1. Download and install `cloudflared` from Cloudflare.
2. Start the backend:

   ```bash
   cd fleet-backend
   npm start
   ```

3. In a second terminal, run:

   ```bash
   cloudflared tunnel --url http://localhost:5000
   ```

Cloudflare will print a public `https://*.trycloudflare.com` URL.
Use that as your backend base URL (for example in the frontend).

Notes:
- Quick tunnels are for testing only and have a 200 concurrent request limit.
- Quick tunnels do not support Server-Sent Events (SSE).

## Option B: ngrok (recommended)

1. Install ngrok.
2. Authenticate:

   ```bash
   ngrok config add-authtoken <YOUR_TOKEN>
   ```

3. Start the backend:

   ```bash
   cd fleet-backend
   npm start
   ```

4. In a second terminal:

   ```bash
   ngrok http 5000
   ```

   Or use the script:

   ```bash
   npm run tunnel:ngrok
   ```

ngrok will print a public `https://*.ngrok.app` URL.

Notes:
- Free plan limits include 1 GB outbound, 20k requests/month, and 1 active endpoint.
- Free plan adds a browser warning page for HTML traffic (API calls are not affected).

## Frontend: point to ngrok URL

In `fleet-frontend`, create a `.env` file with:

```bash
VITE_API_BASE_URL=https://your-ngrok-subdomain.ngrok-free.dev/api/v1
VITE_SOCKET_URL=https://your-ngrok-subdomain.ngrok-free.dev
```

Then restart the frontend dev server.

## Auto-update frontend .env from ngrok

Once ngrok is running, from `fleet-backend` you can run:

```bash
npm run tunnel:sync
```

This reads the ngrok local API (`http://127.0.0.1:4040`) and updates
`fleet-frontend/.env` with the current public URL.
