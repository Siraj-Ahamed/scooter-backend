import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { vehicleAPI } from '../api'
import { useSocket } from '../context/SocketContext'
import { useTheme } from '../context/ThemeContext'
import { TILE_DARK, TILE_LIGHT } from '../utils/mapTiles'
import { useNavigate } from 'react-router-dom'
import { vehicleTypeMeta } from '../utils/vehicleTypes'

const makeIcon = (color, isOnline, emoji = '\u{1F697}') => L.divIcon({
  className: '',
  html: `<div style=\"width:32px;height:32px;border-radius:50%;background:${color}22;border:2px solid ${color};display:flex;align-items:center;justify-content:center;box-shadow:0 0 ${isOnline ? `12px ${color}` : '0'};font-size:16px;\">${emoji}</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
})

const STATUS_COLOR = { available: '#00ff88', rented: '#00e5ff', locked: '#ff3d5a', offline: '#4a5568', maintenance: '#ffd700' }

function FlyTo({ coords, trigger, disabled }) {
  const map = useMap()
  useEffect(() => {
    if (coords && trigger && !disabled) map.flyTo(coords, 15, { animate: true, duration: 1 })
  }, [coords, trigger, disabled, map])
  return null
}

function FitBounds({ bounds, selected, disabled }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds || selected || disabled) return
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [bounds, selected, disabled, map])
  return null
}

function InteractionWatcher({ onInteract, onMapClick }) {
  useMapEvents({
    dragstart: () => onInteract(),
    zoomstart: () => onInteract(),
    click: () => onMapClick(),
  })
  return null
}

export default function MapPage() {
  const { liveLocations, liveStatuses, isVehicleOnline, watchScooter } = useSocket()
  const { isDark } = useTheme()
  const [vehicles, setVehicles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userInteracted, setUserInteracted] = useState(false)
  const [selectionTick, setSelectionTick] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    vehicleAPI.list({ limit: 100 }).then(r => {
      setVehicles(r.data.data)
      r.data.data.forEach(v => watchScooter(v._id))
    }).finally(() => setLoading(false))
  }, [])

  const enriched = vehicles.map(v => {
    const live = liveLocations[v._id]
    const st = liveStatuses[v._id] || {}
    const merged = {
      ...v,
      isOnline:   isVehicleOnline(v._id, v.isOnline, v.status),
      status:     st.status     !== undefined ? st.status     : v.status,
      isEngineOn: st.isEngineOn !== undefined ? st.isEngineOn : v.isEngineOn,
    }
    const coords = live
      ? [live.lat, live.lng]
      : merged.location?.coordinates?.[0] ? [merged.location.coordinates[1], merged.location.coordinates[0]] : null
    return { ...merged, live, coords }
  })

  const selected = enriched.find(v => v._id === selectedId) || null
  const coordsList = enriched.map(v => v.coords).filter(c => Array.isArray(c) && c.length === 2)
  const defaultCenter = coordsList[0] || [6.9271, 79.8612]
  const flyTarget = selected?.coords || null

  const bounds = coordsList.length
    ? [
        [Math.min(...coordsList.map(c => c[0])), Math.min(...coordsList.map(c => c[1]))],
        [Math.max(...coordsList.map(c => c[0])), Math.max(...coordsList.map(c => c[1]))],
      ]
    : null

  const statusLegendBg = isDark ? 'rgba(17,19,24,0.95)' : 'rgba(255,255,255,0.94)'
  const handleSelect = (id) => {
    setSelectedId(prev => {
      const next = prev === id ? null : id
      if (next !== prev) {
        setUserInteracted(false)
        setSelectionTick(t => t + 1)
      }
      return next
    })
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div className="map-sidebar" style={{ width: 260, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Map</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{enriched.filter(v => v.coords).length} vehicles tracked</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {enriched.map(v => {
            const meta = vehicleTypeMeta(v.vehicleType)
            return (
              <div key={v._id}
                onClick={() => handleSelect(v._id)}
                style={{
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                  background: selectedId === v._id ? 'rgba(0,229,255,0.1)' : 'transparent',
                  border: selectedId === v._id ? '1px solid rgba(0,229,255,0.2)' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <span className={`badge badge-${v.status}`} style={{ fontSize: 9, padding: '1px 5px' }}>{v.status}</span>
                      {v.live && <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{v.live.battery}% 🔋</span>}
                    </div>
                  </div>
                  <div className={`dot ${v.isOnline && v.status !== 'offline' ? 'dot-green' : 'dot-gray'}`} />
                </div>
              </div>
            )
          })}
          {loading && <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer
          center={defaultCenter}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          bounds={bounds || undefined}
          boundsOptions={{ padding: [40, 40] }}
        >
          <TileLayer key={isDark ? 'dark' : 'light'} url={isDark ? TILE_DARK : TILE_LIGHT} attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
          {flyTarget && <FlyTo coords={flyTarget} trigger={selectionTick} disabled={userInteracted} />}
          {bounds && <FitBounds bounds={bounds} selected={selected} disabled={userInteracted} />}
          <InteractionWatcher onInteract={() => setUserInteracted(true)} onMapClick={() => setSelectedId(null)} />

          {enriched.map(v => {
            if (!v.coords) return null
            const color = STATUS_COLOR[v.status] || '#4a5568'
            const meta  = vehicleTypeMeta(v.vehicleType)
            const live  = v.live

            return (
              <Marker key={v._id} position={v.coords} icon={makeIcon(color, v.isOnline && v.status !== 'offline', meta.emoji)}>
                <Popup>
                  <div style={{ minWidth: 190 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>{v.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{meta.label}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <InfoRow icon="🔋" label="Battery" value={`${live?.battery ?? v.lastTelemetry?.battery ?? 0}%`} />
                      <InfoRow icon="⚡" label="Speed"   value={`${live?.speed ?? v.lastTelemetry?.speed ?? 0} km/h`} />
                      <InfoRow icon="📡" label="Signal"  value={formatSignal(live?.signal)} />
                      <InfoRow icon="🔑" label="Engine"  value={v.isEngineOn ? 'On' : 'Off'} />
                    </div>
                    <button
                      style={{ marginTop: 10, width: '100%', padding: '6px 0', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      onClick={() => navigate(`/vehicles/${v._id}`)}>
                      View Details →
                    </button>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {enriched.map(v => {
            if (!v.geofence?.isEnabled || !v.geofence?.polygon?.coordinates?.[0]) return null
            const ring = v.geofence.polygon.coordinates[0].map(([lng, lat]) => [lat, lng])
            return <Polygon key={`${v._id}-gf`} positions={ring} pathOptions={{ color: '#00e5ff', fillColor: '#00e5ff', fillOpacity: 0.05, weight: 1.5, dashArray: '6 4' }} />
          })}
          {enriched.map(v => {
            if (!v.geofence?.isEnabled || !v.geofence?.polygon?.coordinates?.length) return null
            return v.geofence.polygon.coordinates.slice(1).map((ring, idx) => (
              <Polygon key={`${v._id}-ex-${idx}`} positions={ring.map(([lng, lat]) => [lat, lng])}
                pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.12, weight: 2, dashArray: '4 3' }} />
            ))
          })}
        </MapContainer>

        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 1000, background: statusLegendBg, border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', backdropFilter: 'blur(8px)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Status</div>
          {Object.entries(STATUS_COLOR).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: v }} />
              <span style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'capitalize' }}>{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 11 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</div>
      </div>
    </div>
  )
}

function formatSignal(signal) {
  if (!signal || (signal.rssi === null && signal.ber === null) || (signal.rssi === undefined && signal.ber === undefined)) return '—'
  const rssi = Number.isFinite(signal.rssi) ? signal.rssi : null
  const ber  = Number.isFinite(signal.ber) ? signal.ber : null

  if (rssi === null) return '—'

  let level = 'Weak'
  let bars = '●○○○'
  if (rssi >= -70) { level = 'Strong'; bars = '●●●●' }
  else if (rssi >= -85) { level = 'Good'; bars = '●●●○' }
  else if (rssi >= -100) { level = 'Fair'; bars = '●●○○' }

  if (ber !== null && ber >= 5) {
    level = 'Poor'
    bars = '▂'
  }

  return `${level} ${bars}`
}
