import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet'
import L from 'leaflet'
import { Plus, RefreshCw, Navigation } from 'lucide-react'
import { tripAPI, vehicleAPI } from '../api'
import { useSocket } from '../context/SocketContext'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import TripPlaybackModal from '../components/TripPlaybackModal'

export default function TripsPage() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState([])
  const [active, setActive] = useState([])
  const [loading, setLoading] = useState(true)
  const [showStart, setShowStart] = useState(false)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = () => {
    setLoading(true)
    Promise.all([
      tripAPI.list({ limit: 50, ...(filter !== 'all' && { status: filter }) }),
      tripAPI.active(),
    ]).then(([t, a]) => {
      setTrips(t.data.data)
      setActive(a.data.data)
    }).catch(() => toast.error('Failed to load trips'))
    .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  const endTrip = async (id) => {
    if (!window.confirm('End this trip?')) return
    try {
      await tripAPI.end(id)
      toast.success('Trip ended')
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  const viewRoute = async (trip) => {
    try {
      const { data } = await tripAPI.get(trip._id)
      setSelected(data.data)
    } catch {
      toast.error('Failed to load route')
    }
  }

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Trips</div>
            <div className="page-sub">{active.length} active - {trips.length} shown</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowStart(true)}><Plus size={13} /> Start Trip</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {['all', 'active', 'completed'].map(f => (
            <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f}</button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {active.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Active Trips
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {active.map(t => (
                <div key={t._id} style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t.vehicle?.name || t.scooter?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>Rider: {t.rider?.name} - {t.rider?.phone}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      Started {formatDistanceToNow(new Date(t.startedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="pulse">
                    <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--mono)', background: 'rgba(0,255,136,0.1)', padding: '3px 8px', borderRadius: 10 }}>LIVE</span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => endTrip(t._id)}>End Trip</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Scooter</th><th>Rider</th><th>Status</th><th>Started</th><th>Duration</th><th>Distance</th><th></th></tr>
                </thead>
                <tbody>
                  {trips.map(t => (
                    <tr key={t._id}>
                      <td>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>{t.vehicle?.name || t.scooter?.name || '-'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{t.vehicle?.deviceId || t.scooter?.deviceId}</div>
                      </td>
                      <td>
                        <div style={{ color: 'var(--text)' }}>{t.rider?.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.rider?.phone}</div>
                      </td>
                      <td><span className={`badge ${t.status === 'active' ? 'badge-rented' : t.status === 'completed' ? 'badge-available' : 'badge-offline'}`}>{t.status}</span></td>
                      <td style={{ fontSize: 12 }}>{new Date(t.startedAt).toLocaleString()}</td>
                      <td><span className="mono" style={{ fontSize: 11 }}>{t.durationMinutes ? `${t.durationMinutes} min` : '-'}</span></td>
                      <td><span className="mono" style={{ fontSize: 11 }}>{t.distanceKm ? `${t.distanceKm} km` : '-'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-icon" title="View route" onClick={() => viewRoute(t)}><Navigation size={12} /></button>
                          {t.status === 'active' && <button className="btn btn-danger btn-sm" onClick={() => endTrip(t._id)}>End</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {trips.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No trips found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showStart && <StartTripModal onClose={() => setShowStart(false)} onStarted={() => { setShowStart(false); load() }} />}
      {selected && <TripPlaybackModal trip={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function StartTripModal({ onClose, onStarted }) {
  const { liveStatuses } = useSocket()
  const [scooters, setScooters] = useState([])
  const [form, setForm] = useState({ scooterId: '', riderName: '', riderPhone: '' })
  const [loading, setLoading] = useState(false)
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    vehicleAPI.list({ limit: 100 }).then(r => setScooters(r.data.data))
  }, [])

  const availableScooters = scooters
    .map(s => {
      const st = liveStatuses[s._id]
      if (!st) return s
      return { ...s, status: st.status ?? s.status, isOnline: st.isOnline ?? s.isOnline }
    })
    .filter(s => s.status === 'available' && s.isOnline)

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await tripAPI.start(form)
      toast.success('Trip started')
      onStarted()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start trip')
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Start New Trip</div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="input-label">Vehicle</label>
            <select className="input" value={form.scooterId} onChange={set('scooterId')} required>
              <option value="">Select a vehicle...</option>
              {availableScooters.map(s => <option key={s._id} value={s._id}>{s.name} ({s.deviceId})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">Rider Name</label>
            <input className="input" placeholder="Full name" value={form.riderName} onChange={set('riderName')} required />
          </div>
          <div className="form-group">
            <label className="input-label">Rider Phone</label>
            <input className="input" placeholder="+94 77 000 0000" value={form.riderPhone} onChange={set('riderPhone')} required />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <div className="spinner" /> : 'Start Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RouteModal({ trip, onClose }) {
  const { isDark } = useTheme()
  const safePoint = (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
  const routePoints = (trip.route || [])
    .map(p => p?.coordinates ? [p.coordinates[1], p.coordinates[0]] : null)
    .filter(safePoint)
  const start = trip.startLocation?.coordinates
    ? [trip.startLocation.coordinates[1], trip.startLocation.coordinates[0]]
    : null
  const end = trip.endLocation?.coordinates
    ? [trip.endLocation.coordinates[1], trip.endLocation.coordinates[0]]
    : null
  const safeStart = safePoint(start) ? start : null
  const safeEnd = safePoint(end) ? end : null
  const center = safeStart || routePoints[0] || [6.9271, 79.8612]
  const [playing, setPlaying] = useState(false)
  const [index, setIndex] = useState(0)
  const [speedMs, setSpeedMs] = useState(500)
  const [loop, setLoop] = useState(false)
  const tileUrl = isDark ? TILE_DARK : TILE_LIGHT

  const markerIcon = (label) => L.divIcon({
    className: '',
    html: `<div style="font-size:20px;line-height:1;">${label}</div>`,
    iconSize: [24, 24], iconAnchor: [12, 12],
  })
  const meta = vehicleTypeMeta(trip?.scooter?.vehicleType)
  const vehicleEmoji = meta?.emoji || '\u{1F6F5}'

  useEffect(() => {
    setPlaying(false)
    setIndex(0)
  }, [trip?._id])

  useEffect(() => {
    if (!playing || routePoints.length === 0) return
    const id = setInterval(() => {
      setIndex((i) => {
        const next = i + 1
        if (next >= routePoints.length) {
          if (loop) return 0
          setPlaying(false)
          return i
        }
        return next
      })
    }, speedMs)
    return () => clearInterval(id)
  }, [playing, speedMs, loop, routePoints.length])

  const currentPoint = routePoints.length > 0
    ? routePoints[Math.min(index, routePoints.length - 1)]
    : safeStart

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>
            Trip Route - {trip.scooter?.name}
          </div>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Duration', value: trip.durationMinutes ? `${trip.durationMinutes} min` : '-' },
            { label: 'Distance', value: trip.distanceKm ? `${trip.distanceKm} km` : '-' },
            { label: 'Points', value: routePoints.length },
            { label: 'Status', value: trip.status },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text)', marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="range"
            min={0}
            max={Math.max(routePoints.length - 1, 0)}
            value={Math.min(index, Math.max(routePoints.length - 1, 0))}
            onChange={(e) => setIndex(Number(e.target.value))}
            style={{ width: '100%' }}
            disabled={routePoints.length === 0}
          />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
            {routePoints.length === 0 ? '0/0' : `${index + 1}/${routePoints.length}`}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPlaying(p => !p)} disabled={routePoints.length === 0}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setIndex(0)} disabled={routePoints.length === 0}>Reset</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Speed</div>
          <select className="input" style={{ width: 120 }} value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))}>
            <option value={1000}>1x</option>
            <option value={500}>2x</option>
            <option value={250}>4x</option>
            <option value={125}>8x</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop
          </label>
        </div>

        <MapContainer center={center} zoom={14} style={{ height: 360, borderRadius: 10, overflow: 'hidden' }}>
          <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} />
          {routePoints.length >= 2 && (
            <Polyline positions={routePoints} pathOptions={{ color: '#00e5ff', weight: 3, opacity: 0.8 }} />
          )}
          {safeStart && <Marker position={safeStart} icon={markerIcon('\u{1F7E2}')}><Popup>Start</Popup></Marker>}
          {safeEnd && <Marker position={safeEnd} icon={markerIcon('\u{1F534}')}><Popup>End</Popup></Marker>}
          {currentPoint && <Marker position={currentPoint} icon={markerIcon(vehicleEmoji)}><Popup>Playback</Popup></Marker>}
        </MapContainer>

        {routePoints.length === 0 && (
          <div style={{ marginTop: 12, color: 'var(--text3)', fontSize: 12, textAlign: 'center' }}>No route data available for this trip</div>
        )}
      </div>
    </div>
  )
}

