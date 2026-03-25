const fs = require('fs')
const http = require('http')
const path = require('path')

const FRONTEND_ENV_PATH = path.join(__dirname, '..', '..', 'fleet-frontend', '.env')
const NGROK_API_URL = 'http://127.0.0.1:4040/api/tunnels'

function fetchNgrokTunnels() {
  return new Promise((resolve, reject) => {
    http.get(NGROK_API_URL, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`ngrok API returned ${res.statusCode}`))
        }
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(err)
        }
      })
    }).on('error', reject)
  })
}

function pickHttpsTunnel(tunnels) {
  if (!Array.isArray(tunnels)) return null
  return tunnels.find(t => t?.public_url?.startsWith('https://')) || null
}

function upsertEnvLine(lines, key, value) {
  const prefix = `${key}=`
  const idx = lines.findIndex(l => l.startsWith(prefix))
  const line = `${key}=${value}`
  if (idx === -1) return [...lines, line]
  const next = [...lines]
  next[idx] = line
  return next
}

async function main() {
  const { tunnels } = await fetchNgrokTunnels()
  const httpsTunnel = pickHttpsTunnel(tunnels)
  if (!httpsTunnel) {
    throw new Error('No https tunnel found. Is ngrok running?')
  }

  const publicUrl = httpsTunnel.public_url.replace(/\/$/, '')
  const apiUrl = `${publicUrl}/api/v1`

  let lines = []
  if (fs.existsSync(FRONTEND_ENV_PATH)) {
    const raw = fs.readFileSync(FRONTEND_ENV_PATH, 'utf8')
    lines = raw.split(/\r?\n/).filter(l => l.length > 0)
  }

  lines = upsertEnvLine(lines, 'VITE_API_BASE_URL', apiUrl)
  lines = upsertEnvLine(lines, 'VITE_SOCKET_URL', publicUrl)

  fs.writeFileSync(FRONTEND_ENV_PATH, `${lines.join('\n')}\n`, 'utf8')
  console.log(`Updated ${FRONTEND_ENV_PATH}`)
  console.log(`VITE_API_BASE_URL=${apiUrl}`)
  console.log(`VITE_SOCKET_URL=${publicUrl}`)
}

main().catch(err => {
  console.error(`Failed to update frontend env: ${err.message}`)
  process.exit(1)
})
