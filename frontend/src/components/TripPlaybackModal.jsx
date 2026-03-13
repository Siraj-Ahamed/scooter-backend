import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { X, Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { vehicleTypeMeta } from '../utils/vehicleTypes'
import { TILE_DARK, TILE_LIGHT } from '../utils/mapTiles'

// ── Map auto-fit ──────────────────────────────────────────────────────────
function MapFitter({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    try {
      const b = L.latLngBounds(points)
      if (b.isValid()) map.fitBounds(b, { padding: [48, 48], maxZoom: 16 })
    } catch {}
  }, [])
  return null
}

// ── Bearing (degrees) — overlay display only ──────────────────────────────
function bearing(a, b) {
  if (!a || !b) return 0
  const toR = d => (d * Math.PI) / 180
  const y = Math.sin(toR(b[1] - a[1])) * Math.cos(toR(b[0]))
  const x = Math.cos(toR(a[0])) * Math.sin(toR(b[0])) -
            Math.sin(toR(a[0])) * Math.cos(toR(b[0])) * Math.cos(toR(b[1] - a[1]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// ── Haversine km ──────────────────────────────────────────────────────────
function haversineKm(a, b) {
  if (!a || !b) return 0
  const R = 6371, toR = d => (d * Math.PI) / 180
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1])
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function buildDistances(pts) {
  const d = [0]
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + haversineKm(pts[i - 1], pts[i]))
  return d
}

function buildSpeeds(pts, dists) {
  return pts.map((_, i) => {
    if (i === 0) return 0
    return Math.min((dists[i] - dists[i - 1]) * 3600, 120)
  })
}

function buildMilestones(pts, dists, intervalKm = 0.5) {
  const out = []
  let next = intervalKm
  for (let i = 1; i < pts.length; i++) {
    if (dists[i] >= next) {
      out.push({ pt: pts[i], km: +dists[i].toFixed(2) })
      next += intervalKm
    }
  }
  return out
}

// ── Catmull-Rom spline interpolation ─────────────────────────────────────
// Produces a smooth curve through all GPS points.
// t is a fractional index: integer = exact GPS point, fraction = smooth position between.
function catmullRom(pts, t) {
  if (!pts.length) return null
  const n = pts.length
  const clamped = Math.max(0, Math.min(t, n - 1))
  if (n === 1) return pts[0]

  const i1 = Math.min(Math.floor(clamped), n - 2)
  const f   = clamped - i1

  // Control points: clamp to array bounds
  const p0 = pts[Math.max(i1 - 1, 0)]
  const p1 = pts[i1]
  const p2 = pts[Math.min(i1 + 1, n - 1)]
  const p3 = pts[Math.min(i1 + 2, n - 1)]

  // Catmull-Rom formula
  const t2 = f * f, t3 = t2 * f
  const lat =
    0.5 * ((2 * p1[0]) +
    (-p0[0] + p2[0]) * f +
    (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
    (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
  const lng =
    0.5 * ((2 * p1[1]) +
    (-p0[1] + p2[1]) * f +
    (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
    (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  return [lat, lng]
}

// ── Vehicle icon — static (no ping, ping is handled by a separate overlay) ──
function makeVehicleIcon(emoji, color = '#00e5ff', size = 38) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color}22;border:2.5px solid ${color};
        display:flex;align-items:center;justify-content:center;
        font-size:${Math.round(size * 0.48)}px;
        box-shadow:0 0 14px ${color}99;
      ">${emoji}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// ── Ping icon — a pure ring, shown briefly at exact GPS coords ────────────
function makePingIcon(color = '#00e5ff', size = 54) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      border:2px solid ${color};
      animation:playback-ping 0.7s ease-out forwards;
      pointer-events:none;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const pinIcon = (color, label) => L.divIcon({
  className: '',
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
    <div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 6px ${color}88"></div>
    <div style="font-size:9px;color:${color};font-family:monospace;font-weight:700;white-space:nowrap;
      background:rgba(0,0,0,0.65);padding:1px 4px;border-radius:3px">${label}</div>
  </div>`,
  iconSize: [48, 32], iconAnchor: [7, 7],
})

const milestoneIcon = (km, color) => L.divIcon({
  className: '',
  html: `<div style="font-size:9px;color:${color};font-family:monospace;font-weight:700;
    background:rgba(0,0,0,0.7);padding:2px 5px;border-radius:4px;
    border:1px solid ${color}55;white-space:nowrap;">${km}km</div>`,
  iconSize: [40, 18], iconAnchor: [20, 9],
})

const fmtDate = d => d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// Speed = GPS points per real second
const SPEEDS = [
  { label: '0.5×', pps: 0.5 },
  { label: '1×',   pps: 1   },
  { label: '2×',   pps: 2   },
  { label: '4×',   pps: 4   },
  { label: '8×',   pps: 8   },
]

// ── Imperative vehicle mover — lives inside MapContainer, updates Leaflet directly ──
// This is the key fix: we never re-render the React <Marker> during playback.
// Instead we get a ref to the Leaflet marker and call .setLatLng() each frame.
function VehicleLayer({ routePoints, tPosRef, playingRef, follow, color, emoji, startPt, endPt,
                        onTick, pingColor }) {
  const map = useMap()
  const markerRef  = useRef(null)
  const pingRef    = useRef(null)
  const rafRef     = useRef(null)
  const lastTsRef  = useRef(null)
  const lastPingI  = useRef(-1)   // last integer index we fired a ping at
  const iconStatic = useRef(makeVehicleIcon(emoji, color))

  // Create the marker once imperatively
  useEffect(() => {
    const pos = startPt || routePoints[0] || [6.9271, 79.8612]
    const m = L.marker(pos, { icon: iconStatic.current, zIndexOffset: 1000 }).addTo(map)
    markerRef.current = m

    // Ping marker (hidden initially, positioned at 0,0)
    const p = L.marker(pos, { icon: makePingIcon(pingColor), zIndexOffset: 999, opacity: 0 }).addTo(map)
    pingRef.current = p

    return () => { m.remove(); p.remove() }
  }, []) // eslint-disable-line

  // rAF loop — runs every frame, purely imperative, zero React state updates here
  const loop = useCallback((ts) => {
    if (!playingRef.current) return

    const pts = routePoints
    const maxT = Math.max(pts.length - 1, 0)

    if (lastTsRef.current !== null) {
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.1)
      tPosRef.current = Math.min(tPosRef.current + playingRef.pps * dt, maxT)

      const pos = catmullRom(pts, tPosRef.current)
      if (pos && markerRef.current) {
        markerRef.current.setLatLng(pos)
        if (follow) map.panTo(pos, { animate: true, duration: 0.15, easeLinearity: 1 })
      }

      // Fire ping when crossing a new integer GPS index
      const currentI = Math.floor(tPosRef.current)
      if (currentI !== lastPingI.current && currentI < pts.length) {
        lastPingI.current = currentI
        const pt = pts[currentI]
        if (pingRef.current && pt) {
          pingRef.current.setLatLng(pt)
          pingRef.current.setOpacity(1)
          pingRef.current.setIcon(makePingIcon(pingColor)) // re-create to restart CSS animation
          // Hide after animation completes
          setTimeout(() => { if (pingRef.current) pingRef.current.setOpacity(0) }, 700)
        }
      }

      // Notify React for UI updates — throttled: only when integer part changes
      if (onTick) onTick(tPosRef.current)

      if (tPosRef.current >= maxT) {
        playingRef.current = false
        onTick && onTick(maxT, true) // signal done
        lastTsRef.current = null
        return
      }
    }

    lastTsRef.current = ts
    rafRef.current = requestAnimationFrame(loop)
  }, [routePoints, follow, map, onTick, pingColor]) // eslint-disable-line

  // Start / stop loop when playingRef.current changes (toggled externally)
  useEffect(() => {
    const checkAndStart = () => {
      if (playingRef.current && routePoints.length > 1) {
        lastTsRef.current = null
        lastPingI.current = Math.floor(tPosRef.current) - 1
        rafRef.current = requestAnimationFrame(loop)
      } else {
        cancelAnimationFrame(rafRef.current)
        lastTsRef.current = null
      }
    }
    checkAndStart()
    return () => cancelAnimationFrame(rafRef.current)
  }, [playingRef.current, loop, routePoints.length]) // eslint-disable-line

  // Snap marker when scrubbing (not playing)
  useEffect(() => {
    if (!playingRef.current && markerRef.current && routePoints.length) {
      const pos = catmullRom(routePoints, tPosRef.current)
      if (pos) markerRef.current.setLatLng(pos)
    }
  }) // runs every render so scrubbing stays in sync

  return null // renders nothing into React tree
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TripPlaybackModal({ trip, onClose, vehicleType }) {
  const { isDark } = useTheme()
  const tileUrl = isDark ? TILE_DARK : TILE_LIGHT
  const meta    = vehicleTypeMeta(vehicleType || trip?.vehicle?.vehicleType || trip?.scooter?.vehicleType)

  // ── Parse route ──────────────────────────────────────────────────────────
  const routePoints = (trip?.route || [])
    .map(p => {
      if (!p) return null
      const c = p.coordinates || p
      if (Array.isArray(c) && c.length === 2) return [+c[1], +c[0]]
      return null
    })
    .filter(p => p && isFinite(p[0]) && isFinite(p[1]))

  const routeTimestamps = (trip?.route || []).map(p => p?.timestamp || p?.ts || null)

  const startPt = trip?.startLocation?.coordinates
    ? [+trip.startLocation.coordinates[1], +trip.startLocation.coordinates[0]]
    : routePoints[0] || null
  const endPt = trip?.endLocation?.coordinates
    ? [+trip.endLocation.coordinates[1], +trip.endLocation.coordinates[0]]
    : routePoints[routePoints.length - 1] || null

  const center    = startPt || [6.9271, 79.8612]
  const dists     = buildDistances(routePoints)
  const speeds    = buildSpeeds(routePoints, dists)
  const totalDist = dists[dists.length - 1] || trip?.distanceKm || 0
  const milestones = buildMilestones(routePoints, dists, 0.5)
  const maxPt     = Math.max(routePoints.length - 1, 0)

  // ── Refs (drive the rAF loop, no re-renders) ─────────────────────────────
  const tPosRef    = useRef(0)
  // playingRef is an object so VehicleLayer can read .pps too
  const playingRef = useRef(false)
  const speedPpsRef = useRef(SPEEDS[1].pps)

  // ── React state (UI only, updated ~10fps via onTick) ─────────────────────
  const [tDisplay, setTDisplay]         = useState(0)
  const [playing, setPlaying]           = useState(false)
  const [speedIdx, setSpeedIdx]         = useState(1)
  const [loop, setLoop]                 = useState(false)
  const [follow, setFollow]             = useState(true)
  const [showFull, setShowFull]         = useState(true)
  const [showMilestones, setShowMilestones] = useState(true)
  const [showPanel, setShowPanel]       = useState(true)

  // Sync speed pps into playingRef.pps so VehicleLayer reads it without dep
  useEffect(() => {
    speedPpsRef.current  = SPEEDS[speedIdx].pps
    playingRef.pps       = SPEEDS[speedIdx].pps
  }, [speedIdx])

  // Throttle UI updates — only re-render when floor index changes (i.e. ~1fps at 1x)
  const lastFloorRef = useRef(-1)
  const onTick = useCallback((t, done) => {
    const floor = Math.floor(t)
    if (done) {
      setPlaying(false)
      playingRef.current = false
      setTDisplay(maxPt)
      return
    }
    if (floor !== lastFloorRef.current) {
      lastFloorRef.current = floor
      setTDisplay(t)
    }
  }, [maxPt])

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    setPlaying(p => {
      const next = !p
      playingRef.current = next
      playingRef.pps = speedPpsRef.current
      return next
    })
  }, [])

  // Scrub
  const scrubTo = useCallback((v) => {
    tPosRef.current = v
    setTDisplay(v)
    setPlaying(false)
    playingRef.current = false
  }, [])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = e => {
      if (e.target.tagName === 'INPUT') return
      if (e.code === 'Space')      { e.preventDefault(); togglePlay() }
      if (e.code === 'ArrowRight') scrubTo(Math.min(tPosRef.current + 1, maxPt))
      if (e.code === 'ArrowLeft')  scrubTo(Math.max(tPosRef.current - 1, 0))
      if (e.code === 'Home')       scrubTo(0)
      if (e.code === 'End')        scrubTo(maxPt)
      if (e.code === 'KeyF')       setFollow(f => !f)
      if (e.code === 'KeyG')       setShowFull(f => !f)
      if (e.code === 'Escape')     onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [maxPt, togglePlay, scrubTo, onClose])

  useEffect(() => {
    tPosRef.current = 0
    setTDisplay(0)
    setPlaying(false)
    playingRef.current = false
  }, [trip?._id])

  // Loop: when playback ends and loop is on, restart
  useEffect(() => {
    if (!playing && loop && tDisplay >= maxPt && maxPt > 0) {
      tPosRef.current = 0
      setTDisplay(0)
      setTimeout(() => {
        playingRef.current = true
        playingRef.pps = speedPpsRef.current
        setPlaying(true)
      }, 50)
    }
  }, [playing]) // eslint-disable-line

  // ── Derived UI values ─────────────────────────────────────────────────────
  const clampedT   = Math.max(0, Math.min(tDisplay, maxPt))
  const floorIdx   = Math.min(Math.floor(clampedT), routePoints.length - 1)
  const currentPos = catmullRom(routePoints, clampedT) || startPt

  const fracInSeg  = clampedT - floorIdx
  const segDist    = floorIdx < dists.length - 1 ? (dists[floorIdx + 1] - dists[floorIdx]) * fracInSeg : 0
  const coveredKm  = +((dists[floorIdx] || 0) + segDist).toFixed(2)
  const progressPc = maxPt > 0 ? Math.round((clampedT / maxPt) * 100) : 0
  const currentSpeed = +(speeds[floorIdx] || 0).toFixed(1)
  const currentTs  = routeTimestamps[floorIdx]
  const prevPos    = routePoints[Math.max(floorIdx - 1, 0)]
  const head       = bearing(prevPos, currentPos)

  // Covered polyline — up to current smooth position
  const coveredPath = [
    ...routePoints.slice(0, floorIdx + 1),
    ...(currentPos && floorIdx < routePoints.length - 1 ? [currentPos] : []),
  ]
  const remainPath = currentPos
    ? [currentPos, ...routePoints.slice(floorIdx + 1)]
    : routePoints.slice(floorIdx)

  const hasRoute    = routePoints.length >= 2
  const vehicleName = trip?.vehicle?.name || trip?.scooter?.name || 'Vehicle'
  const maxSpeed    = speeds.length ? Math.max(...speeds) : 1

  return (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: 'stretch', padding: 0 }}>
      <style>{`
        @keyframes playback-ping {
          0%   { transform: scale(0.8); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0;   }
        }
      `}</style>

      <div
        className="playback-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1080, margin: 'auto',
          borderRadius: 18, overflow: 'hidden',
          background: 'var(--surface)', border: '1px solid var(--border)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '96vh',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 22 }}>{meta.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Trip Playback — {vehicleName}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
              {fmtDate(trip?.startedAt)}{trip?.rider?.name ? ` · ${trip.rider.name}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {[
              { icon: '⏱', label: trip?.durationMinutes ? `${trip.durationMinutes} min` : '—' },
              { icon: '📏', label: `${(+totalDist.toFixed(2))} km` },
              { icon: '📍', label: `${routePoints.length} pts` },
              { icon: '⚡', label: `${maxSpeed > 0 ? maxSpeed.toFixed(0) : '—'} km/h max` },
              { icon: '🎯', label: `${progressPc}%` },
            ].map(({ icon, label }) => (
              <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '5px 10px', textAlign: 'center', minWidth: 56 }}>
                <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{icon}</div>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 600, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPanel(p => !p)} style={{ fontSize: 11 }}>
            {showPanel ? '◀ Hide' : '▶ Info'}
          </button>
          <button className="btn-icon" onClick={onClose} title="Close (Esc)"><X size={15} /></button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* Map */}
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <MapContainer center={center} zoom={14} style={{ height: '100%', minHeight: 360, width: '100%' }} zoomControl={false}>
              <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} />
              <MapFitter points={routePoints} />

              {/* Ghost full route */}
              {hasRoute && showFull && (
                <Polyline positions={routePoints}
                  pathOptions={{ color: isDark ? '#fff' : '#888', weight: 2, opacity: 0.13, dashArray: '4 5' }} />
              )}

              {/* Remaining path */}
              {hasRoute && remainPath.length >= 2 && (
                <Polyline positions={remainPath}
                  pathOptions={{ color: meta.color, weight: 2.5, opacity: 0.25 }} />
              )}

              {/* Covered path */}
              {hasRoute && coveredPath.length >= 2 && (
                <Polyline positions={coveredPath}
                  pathOptions={{ color: meta.color, weight: 4.5, opacity: 0.92 }} />
              )}

              {/* Milestone markers */}
              {showMilestones && milestones.map((m, i) => (
                <Marker key={`ms-${i}`} position={m.pt} icon={milestoneIcon(m.km, meta.color)} />
              ))}

              {/* Start / End pins */}
              {startPt && (
                <Marker position={startPt} icon={pinIcon('#00ff88', 'START')}>
                  <Popup><span style={{ fontFamily: 'monospace', fontSize: 11 }}>Trip Start<br />{fmtDate(trip?.startedAt)}</span></Popup>
                </Marker>
              )}
              {endPt && clampedT >= maxPt && (
                <Marker position={endPt} icon={pinIcon('#ff3d5a', 'END')}>
                  <Popup><span style={{ fontFamily: 'monospace', fontSize: 11 }}>Trip End<br />{fmtDate(trip?.endedAt)}</span></Popup>
                </Marker>
              )}

              {/* Imperative vehicle + ping layer — no re-renders during playback */}
              {hasRoute && (
                <VehicleLayer
                  key={trip?._id}
                  routePoints={routePoints}
                  tPosRef={tPosRef}
                  playingRef={playingRef}
                  follow={follow}
                  color={meta.color}
                  emoji={meta.emoji}
                  startPt={startPt}
                  endPt={endPt}
                  onTick={onTick}
                  pingColor={meta.color}
                />
              )}
            </MapContainer>

            {/* Map overlay buttons */}
            <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <MapOverlayBtn active={follow}         onClick={() => setFollow(f => !f)}         title="Follow vehicle (F)" label="🎯" />
              <MapOverlayBtn active={showFull}       onClick={() => setShowFull(f => !f)}       title="Ghost route (G)"    label="👁" />
              <MapOverlayBtn active={showMilestones} onClick={() => setShowMilestones(f => !f)} title="Distance markers"   label="📏" />
            </div>

            {/* Live stat overlay */}
            <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <LiveBadge icon="📏" value={`${coveredKm} / ${(+totalDist.toFixed(2))} km`} />
              <LiveBadge icon="⚡" value={`${currentSpeed} km/h`} />
              <LiveBadge icon="🧭" value={`${Math.round(head)}°`} />
              {currentTs && <LiveBadge icon="🕐" value={new Date(currentTs).toLocaleTimeString()} />}
              <LiveBadge icon="📍" value={currentPos ? `${currentPos[0].toFixed(4)}, ${currentPos[1].toFixed(4)}` : '—'} />
            </div>

            {!hasRoute && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}>
                <div style={{ textAlign: 'center', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 34, marginBottom: 10 }}>🗺️</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>No route data available</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>GPS points were not recorded for this trip</div>
                </div>
              </div>
            )}
          </div>

          {/* Side info panel */}
          {showPanel && (
            <div style={{ width: 230, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <PanelSection title="👤 Rider">
                <InfoRow label="Name"  value={trip?.rider?.name  || '—'} />
                <InfoRow label="Phone" value={trip?.rider?.phone || '—'} mono />
              </PanelSection>
              <PanelSection title={`${meta.emoji} Vehicle`}>
                <InfoRow label="Name"   value={vehicleName} />
                <InfoRow label="Type"   value={meta.label} />
                <InfoRow label="Device" value={trip?.vehicle?.deviceId || trip?.scooter?.deviceId || '—'} mono />
              </PanelSection>
              <PanelSection title="🛣️ Trip">
                <InfoRow label="Status"    value={trip?.status || '—'} />
                <InfoRow label="Started"   value={trip?.startedAt ? new Date(trip.startedAt).toLocaleTimeString() : '—'} mono />
                <InfoRow label="Ended"     value={trip?.endedAt  ? new Date(trip.endedAt).toLocaleTimeString()   : '—'} mono />
                <InfoRow label="Duration"  value={trip?.durationMinutes ? `${trip.durationMinutes} min` : '—'} mono />
                <InfoRow label="Distance"  value={`${(+totalDist.toFixed(2))} km`} mono />
                <InfoRow label="Points"    value={routePoints.length} mono />
                <InfoRow label="Max speed" value={maxSpeed > 0 ? `${maxSpeed.toFixed(0)} km/h` : '—'} mono />
              </PanelSection>
              <PanelSection title="▶ Playback">
                <InfoRow label="Progress" value={`${progressPc}%`} mono />
                <InfoRow label="Point"    value={`${floorIdx + 1} / ${routePoints.length}`} mono />
                <InfoRow label="Covered"  value={`${coveredKm} km`} mono />
                <InfoRow label="Speed"    value={`${currentSpeed} km/h`} mono />
                <InfoRow label="Heading"  value={`${Math.round(head)}°`} mono />
                {currentTs && <InfoRow label="Timestamp" value={new Date(currentTs).toLocaleTimeString()} mono />}
              </PanelSection>
              {speeds.length > 2 && (
                <PanelSection title="⚡ Speed profile">
                  <SpeedSparkline speeds={speeds} currentT={clampedT} color={meta.color} />
                </PanelSection>
              )}
              {milestones.length > 0 && (
                <PanelSection title="📏 Milestones">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {milestones.map((m, i) => {
                      const passed = coveredKm >= m.km
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: passed ? 1 : 0.35, transition: 'opacity 0.2s' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: passed ? meta.color : 'var(--border2)', flexShrink: 0 }} />
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: passed ? 'var(--text)' : 'var(--text3)' }}>{m.km} km</span>
                          {passed && <span style={{ fontSize: 9, color: meta.color }}>✓</span>}
                        </div>
                      )
                    })}
                  </div>
                </PanelSection>
              )}
            </div>
          )}
        </div>

        {/* ── Controls bar ────────────────────────────────────────────── */}
        <div style={{ padding: '11px 20px 15px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
          {hasRoute && (
            <SegmentHeatbar dists={dists} totalDist={totalDist} currentKm={coveredKm} color={meta.color} />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="range" min={0} max={maxPt} step={0.01}
                value={clampedT}
                onChange={e => scrubTo(Number(e.target.value))}
                disabled={!hasRoute}
                style={{ width: '100%', accentColor: meta.color }}
              />
              <div style={{
                position: 'absolute', top: '50%', left: 0, transform: 'translateY(-50%)',
                height: 3, borderRadius: 2, pointerEvents: 'none',
                width: `${progressPc}%`,
                background: `linear-gradient(90deg, ${meta.color}66, ${meta.color})`,
              }} />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', minWidth: 64, textAlign: 'right' }}>
              {floorIdx + 1} / {routePoints.length}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CtrlBtn onClick={() => scrubTo(Math.max(tPosRef.current - 1, 0))}
              disabled={!hasRoute || clampedT <= 0} title="Step back (←)"><ChevronLeft size={14} /></CtrlBtn>

            <CtrlBtn onClick={() => scrubTo(0)} disabled={!hasRoute} title="Reset (Home)"><SkipBack size={14} /></CtrlBtn>

            <button
              onClick={togglePlay} disabled={!hasRoute} title="Play / Pause (Space)"
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: playing ? meta.color : `${meta.color}22`,
                border: `2px solid ${meta.color}`,
                color: playing ? '#000' : meta.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: hasRoute ? 'pointer' : 'not-allowed',
                opacity: hasRoute ? 1 : 0.4,
                transition: 'all 0.2s',
                boxShadow: playing ? `0 0 18px ${meta.color}66` : 'none',
                flexShrink: 0,
              }}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>

            <CtrlBtn onClick={() => scrubTo(maxPt)} disabled={!hasRoute} title="Skip to end (End)"><SkipForward size={14} /></CtrlBtn>

            <CtrlBtn onClick={() => scrubTo(Math.min(tPosRef.current + 1, maxPt))}
              disabled={!hasRoute || clampedT >= maxPt} title="Step forward (→)"><ChevronRight size={14} /></CtrlBtn>

            <div style={{ width: 1, height: 26, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

            <div style={{ display: 'flex', gap: 3 }}>
              {SPEEDS.map((s, i) => (
                <button key={s.label} onClick={() => setSpeedIdx(i)}
                  style={{
                    padding: '3px 7px', borderRadius: 6, fontSize: 10, fontFamily: 'var(--mono)',
                    border: `1px solid ${i === speedIdx ? meta.color : 'var(--border)'}`,
                    background: i === speedIdx ? `${meta.color}18` : 'var(--surface2)',
                    color: i === speedIdx ? meta.color : 'var(--text3)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>{s.label}</button>
              ))}
            </div>

            <div style={{ width: 1, height: 26, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: loop ? meta.color : 'var(--text3)', userSelect: 'none' }}>
              <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} style={{ accentColor: meta.color }} />
              Loop
            </label>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {[['Space','play/pause'],['← →','step'],['F','follow'],['G','ghost'],['Esc','close']].map(([key, hint]) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <KbdHint>{key}</KbdHint>
                  <span style={{ fontSize: 9, color: 'var(--text3)' }}>{hint}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Speed sparkline ───────────────────────────────────────────────────────
function SpeedSparkline({ speeds, currentT, color }) {
  const W = 198, H = 48
  const max = Math.max(...speeds, 1)
  const step = W / Math.max(speeds.length - 1, 1)
  const pts = speeds.map((s, i) => [i * step, H - (s / max) * (H - 4)])
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const fill = path + ` L${pts[pts.length - 1][0]},${H} L0,${H} Z`
  const cx = (currentT / Math.max(speeds.length - 1, 1)) * W
  const fi = Math.min(Math.floor(currentT), speeds.length - 1)
  const cy = H - ((speeds[fi] || 0) / max) * (H - 4)
  return (
    <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="spk-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spk-fill)" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
      <circle cx={cx} cy={cy} r={6} fill={color} opacity={0.2} />
    </svg>
  )
}

function SegmentHeatbar({ dists, totalDist, currentKm, color }) {
  if (!dists.length || totalDist === 0) return null
  const BINS = 80
  const bins = new Array(BINS).fill(0)
  dists.forEach(d => { bins[Math.min(Math.floor((d / totalDist) * BINS), BINS - 1)]++ })
  const maxBin   = Math.max(...bins, 1)
  const playedPc = currentKm / totalDist
  return (
    <div style={{ display: 'flex', gap: 1, height: 5, marginBottom: 6, borderRadius: 3, overflow: 'hidden' }}>
      {bins.map((count, i) => {
        const intensity = count / maxBin
        const passed = (i / BINS) <= playedPc
        return (
          <div key={i} style={{
            flex: 1, height: '100%',
            background: passed
              ? `rgba(${hexToRgb(color)},${0.35 + intensity * 0.65})`
              : `rgba(${hexToRgb(color)},${0.08 + intensity * 0.15})`,
          }} />
        )
      })}
    </div>
  )
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r)) return '0,229,255'
  return `${r},${g},${b}`
}

function PanelSection({ title, children }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: mono ? 'var(--mono)' : undefined, textAlign: 'right', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

function CtrlBtn({ children, onClick, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
        background: 'var(--surface2)', color: 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.32 : 1,
        transition: 'all 0.15s', flexShrink: 0,
      }}>{children}</button>
  )
}

function MapOverlayBtn({ active, onClick, title, label }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: active ? 'rgba(0,229,255,0.2)' : 'rgba(0,0,0,0.55)',
        border: `1px solid ${active ? 'rgba(0,229,255,0.6)' : 'rgba(255,255,255,0.15)'}`,
        color: active ? '#00e5ff' : 'rgba(255,255,255,0.7)',
        fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)', transition: 'all 0.15s',
      }}>{label}</button>
  )
}

function LiveBadge({ icon, value }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
      padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,0.8)',
      fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <span>{icon}</span><span>{value}</span>
    </div>
  )
}

function KbdHint({ children }) {
  return (
    <kbd style={{
      padding: '2px 5px', borderRadius: 4, fontSize: 9,
      border: '1px solid var(--border2)', background: 'var(--surface2)',
      color: 'var(--text3)', fontFamily: 'monospace', boxShadow: '0 1px 0 var(--border2)',
    }}>{children}</kbd>
  )
}
