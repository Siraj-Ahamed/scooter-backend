import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'

const SocketContext = createContext(null)

// How long without a telemetry ping before we consider a device offline (ms)
// Should match or be slightly longer than the backend's offlineTimeoutMs (120000)
const LIVE_TIMEOUT_MS = 60_000 // 1 minute

export function SocketProvider({ children }) {
  const { user } = useAuth()
  const socketRef = useRef(null)
  const [connected, setConnected]         = useState(false)
  const [liveLocations, setLiveLocations] = useState({}) // vehicleId → {lat,lng,speed,battery,...}
  const [liveStatuses,  setLiveStatuses]  = useState({}) // vehicleId → {isOnline, status, isEngineOn}
  const [lastSeen,      setLastSeen]      = useState({}) // vehicleId → Date.now() of last telemetry
  const [unreadCount,   setUnreadCount]   = useState(0)

  // Re-evaluate lastSeen-based online state every 15 seconds so stale devices
  // flip to offline in the UI without needing a page refresh
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  // Mark devices offline when no telemetry arrives within timeout window
  useEffect(() => {
    const now = Date.now()
    setLiveStatuses(prev => {
      let changed = false
      const next = { ...prev }
      Object.entries(lastSeen).forEach(([vehicleId, seenAt]) => {
        if (!seenAt) return
        if (now - seenAt >= LIVE_TIMEOUT_MS) {
          const prev_s = next[vehicleId] || {}
          if (prev_s.isOnline !== false || prev_s.status !== 'offline') {
            next[vehicleId] = { ...prev_s, isOnline: false, status: 'offline' }
            changed = true
          }
        }
      })
      return changed ? next : prev
    })
  }, [tick, lastSeen])

  // Given a vehicle's DB record, return whether it is currently online.
  // Priority: explicit disconnected status event > lastSeen recency > DB value
  const isVehicleOnline = useCallback((vehicleId, dbIsOnline, dbStatus) => {
    const st = liveStatuses[vehicleId]

    // Explicit socket status event is highest priority
    if (st?.isOnline === false) return false
    if (st?.isOnline === true)  return true

    // If we've received a recent telemetry ping, it's online
    const seen = lastSeen[vehicleId]
    if (seen) return (Date.now() - seen) < LIVE_TIMEOUT_MS

    // Fall back to DB value, but never show online if status is 'offline'
    return dbIsOnline === true && dbStatus !== 'offline'
  }, [liveStatuses, lastSeen, tick]) // tick forces re-evaluation every 15s

  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('accessToken')
    const socket = io('/', {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })
    socketRef.current = socket

    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    // Location events — update telemetry AND record last-seen time
    socket.on('scooter:location', d => {
      setLiveLocations(prev => ({ ...prev, [d.scooterId]: d }))
      setLastSeen(prev => ({ ...prev, [d.scooterId]: Date.now() }))
      setLiveStatuses(prev => {
        const prev_s = prev[d.scooterId] || {}
        const nextStatus = prev_s.status === undefined || prev_s.status === 'offline'
          ? 'available'
          : prev_s.status
        return {
          ...prev,
          [d.scooterId]: {
            ...prev_s,
            isOnline: true,
            status: nextStatus,
          },
        }
      })
    })

    // Explicit status events (connected / disconnected / engine_on / engine_off)
    socket.on('scooter:status', d => {
      setLiveStatuses(prev => {
        const prev_s = prev[d.scooterId] || {}
        const next = { ...prev_s, ...d }

        if (d.event === 'connected')         next.isOnline = true
        else if (d.event === 'disconnected') next.isOnline = false
        else if (d.event === 'timeout_offline') next.isOnline = false
        else next.isOnline = prev_s.isOnline // preserve; don't override with undefined

        return { ...prev, [d.scooterId]: next }
      })
    })

    socket.on('alert:new', d => {
      setUnreadCount(c => c + 1)
      const icon = d.severity === 'critical' ? '🚨' : d.severity === 'warning' ? '⚠️' : 'ℹ️'
      toast(`${icon} ${d.title}`, {
        style: {
          background: 'var(--surface2)',
          color: 'var(--text)',
          border: '1px solid var(--border2)',
          fontFamily: 'var(--sans)',
          fontSize: '13px',
        },
        duration: 5000,
      })
    })

    return () => socket.disconnect()
  }, [user])

  const watchScooter   = id => socketRef.current?.emit('watch:scooter', id)
  const unwatchScooter = id => socketRef.current?.emit('unwatch:scooter', id)

  return (
    <SocketContext.Provider value={{
      connected,
      liveLocations,
      liveStatuses,
      lastSeen,
      isVehicleOnline,
      unreadCount,
      setUnreadCount,
      watchScooter,
      unwatchScooter,
    }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
