import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMapEvents, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { ArrowLeft, Lock, Unlock, Zap, MapPin, Navigation, Shield, Edit2, Trash2, Save, X } from 'lucide-react'
import { scooterAPI, tripAPI, alertAPI } from '../api'
import { useSocket } from '../context/SocketContext'
import toast from 'react-hot-toast'

const scooterIcon = L.divIcon({
  className: '',
  html: `<div style="width:36px;height:36px;border-radius:50%;background:#00e5ff;border:2px solid #00ff88;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 12px #00e5ff80;">&#128757;</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18],
})

function ZoneDrawer({ drawing, onPoint }) {
  useMapEvents({ click(e) { if (drawing) onPoint([e.latlng.lat, e.latlng.lng]) } })
  return null
}

export default function ScooterDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { liveLocations, liveStatuses, watchScooter } = useSocket()

  const [scooter, setScooter] = useState(null)
  const [trips, setTrips] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [selectedTrip, setSelectedTrip] = useState(null)

  const [zoneEnabled, setZoneEnabled] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const [drawMode, setDrawMode] = useState(false)
  const [drawnPoints, setDrawnPoints] = useState([])
  const [savingZone, setSavingZone] = useState(false)
  const [exclusionMode, setExclusionMode] = useState(false)
  const [exclusionPoints, setExclusionPoints] = useState([])
  const [exclusions, setExclusions] = useState([])

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  const load = () => {
    setLoading(true)
    Promise.all([
      scooterAPI.get(id),
      tripAPI.list({ scooterId: id, limit: 10 }),
      alertAPI.list({ limit: 10 }),
    ]).then(([s, t, a]) => {
      const sc = s.data.data
      setScooter(sc)
      setEditForm({ name: sc.name, model: sc.model, plateNumber: sc.plateNumber, color: sc.color })
      setZoneEnabled(sc.geofence?.isEnabled || false)
      setZoneName(sc.geofence?.name || '')
      if (sc.geofence?.polygon?.coordinates?.[0]) {
        setDrawnPoints(sc.geofence.polygon.coordinates[0].map(([lng, lat]) => [lat, lng]))
      }
      if (sc.geofence?.polygon?.coordinates?.length > 1) {
        const holes = sc.geofence.polygon.coordinates.slice(1)
        setExclusions(holes.map((ring) => ring.map(([lng, lat]) => [lat, lng])))
      } else {
        setExclusions([])
      }
      setTrips(t.data.data)
      setAlerts(a.data.data)
    }).catch(() => toast.error('Failed to load scooter'))
    .finally(() => setLoading(false))
  }

  useEffect(() => { load(); watchScooter(id) }, [id])

  const live = liveLocations[id]
  const liveStatus = liveStatuses[id] || {}
  const currentScooter = scooter ? {
    ...scooter,
    isOnline: liveStatus.isOnline ?? scooter.isOnline,
    status: liveStatus.status ?? scooter.status,
    isEngineOn: liveStatus.isEngineOn ?? scooter.isEngineOn,
  } : null
  const battery = live?.battery ?? scooter?.lastTelemetry?.battery ?? 0
  const speed = live?.speed ?? scooter?.lastTelemetry?.speed ?? 0
  const lat = live?.lat ?? (scooter?.location?.coordinates?.[1] || 6.9271)
  const lng = live?.lng ?? (scooter?.location?.coordinates?.[0] || 79.8612)
  const batColor = battery > 50 ? 'var(--green)' : battery > 20 ? 'var(--yellow)' : 'var(--red)'

  const sendCommand = async (action) => {
    try {
      await scooterAPI.command(id, { action })
      toast.success(`${action} sent`)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  const saveEdit = async () => {
    try {
      await scooterAPI.update(id, editForm)
      toast.success('Scooter updated')
      setEditing(false)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed') }
  }

  const saveZone = async () => {
    if (zoneEnabled && drawnPoints.length < 3) {
      toast.error('Draw at least 3 points to create a zone')
      return
    }
    setSavingZone(true)
    try {
      const toRing = (pts) => {
        const ring = pts.map(([lat, lng]) => [lng, lat])
        if (ring.length > 0) ring.push(ring[0])
        return ring
      }
      const ring = toRing(drawnPoints)
      const exclusionRings = exclusions.map(toRing).filter(r => r.length >= 4)

      await scooterAPI.setGeofence(id, {
        isEnabled: zoneEnabled,
        name: zoneName || 'Zone 1',
        polygon: zoneEnabled && ring.length >= 4
          ? { type: 'Polygon', coordinates: [ring, ...exclusionRings] }
          : undefined,
      })
      toast.success(`Zone ${zoneEnabled ? 'activated' : 'deactivated'}`)
      setDrawMode(false)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Zone save failed') }
    finally { setSavingZone(false) }
  }

  const clearZone = async () => {
    setDrawnPoints([])
    setZoneEnabled(false)
    setExclusions([])
    setExclusionPoints([])
    setExclusionMode(false)
    try {
      await scooterAPI.setGeofence(id, { isEnabled: false, name: '' })
      toast.success('Zone cleared')
      load()
    } catch {}
  }

  const viewRoute = async (trip) => {
    try {
      const { data } = await tripAPI.get(trip._id)
      setSelectedTrip(data.data)
    } catch { toast.error('Failed to load route') }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )
  if (!currentScooter) return <div style={{ padding: 40, color: 'var(--text3)' }}>Scooter not found.</div>

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <button className="btn-icon" onClick={() => navigate('/scooters')}><ArrowLeft size={15} /></button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="page-title">{currentScooter.name}</div>
              <span className={`badge badge-${currentScooter.status}`}>{currentScooter.status}</span>
              <div className={`dot ${currentScooter.isOnline ? 'dot-green' : 'dot-gray'}`} />
            </div>
            <div className="page-sub" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
              {currentScooter.deviceId} {currentScooter.plateNumber && `· ${currentScooter.plateNumber}`}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>
            <Edit2 size={12} /> Edit
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {['overview', 'zone', 'trips', 'alerts'].map(t => (
            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
              {t === 'zone'
                ? `${'\u{1F4CD}'} Zone`
                : t === 'trips'
                  ? `${'\u{1F6E3}\u{FE0F}'} Trips`
                  : t === 'alerts'
                    ? `${'\u{1F514}'} Alerts`
                    : `${'\u{1F4CA}'} Overview`}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {tab === 'overview' && <OverviewTab scooter={currentScooter} live={live} lat={lat} lng={lng} battery={battery} speed={speed} batColor={batColor} onCommand={sendCommand} />}
        {tab === 'zone' && (
          <ZoneTab
            scooter={scooter}
            lat={lat}
            lng={lng}
            zoneEnabled={zoneEnabled}
            setZoneEnabled={setZoneEnabled}
            zoneName={zoneName}
            setZoneName={setZoneName}
            drawMode={drawMode}
            setDrawMode={setDrawMode}
            drawnPoints={drawnPoints}
            setDrawnPoints={setDrawnPoints}
            exclusionMode={exclusionMode}
            setExclusionMode={setExclusionMode}
            exclusionPoints={exclusionPoints}
            setExclusionPoints={setExclusionPoints}
            exclusions={exclusions}
            setExclusions={setExclusions}
            onSave={saveZone}
            onClear={clearZone}
            saving={savingZone}
          />
        )}
        {tab === 'trips' && <TripsTab trips={trips} onViewRoute={viewRoute} />}
        {tab === 'alerts' && <AlertsTab alerts={alerts} />}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit Vehicle</div>
            {['name', 'model', 'plateNumber', 'color'].map(k => (
              <div className="form-group" key={k}>
                <label className="input-label">{k.replace(/([A-Z])/g, ' $1')}</label>
                <input className="input" value={editForm[k] || ''} onChange={e => setEditForm(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
      {selectedTrip && <RoutePlaybackModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />}
    </>
  )
}

function OverviewTab({ scooter, live, lat, lng, battery, speed, batColor, onCommand }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Live Telemetry</span>
            {live && <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--mono)' }}>LIVE</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MetricBox label="Battery" value={`${battery}%`} color={batColor} icon={'\u{1F50B}'} />
            <MetricBox label="Speed" value={`${speed} km/h`} color="var(--accent)" icon={'\u{26A1}'} />
            <MetricBox label="Engine" value={scooter.isEngineOn ? 'ON' : 'OFF'} color={scooter.isEngineOn ? 'var(--green)' : 'var(--text3)'} icon={'\u{1F512}'} />
            <MetricBox label="Status" value={scooter.status} color="var(--text2)" icon={'\u{1F4E1}'} />
            <MetricBox label="Latitude" value={lat.toFixed(5)} color="var(--text2)" icon={'\u{1F4CD}'} />
            <MetricBox label="Longitude" value={lng.toFixed(5)} color="var(--text2)" icon={'\u{1F4CD}'} />
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Remote Control</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <CmdButton icon={<Lock size={13} />} label="Lock Engine" onClick={() => onCommand('lock_engine')} color="var(--red)" />
            <CmdButton icon={<Unlock size={13} />} label="Unlock Engine" onClick={() => onCommand('unlock_engine')} color="var(--green)" />
            <CmdButton icon={<Navigation size={13} />} label="Get Location" onClick={() => onCommand('get_location')} color="var(--accent)" />
            <CmdButton icon={<Zap size={13} />} label="Honk" onClick={() => onCommand('honk')} color="var(--yellow)" />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapContainer center={[lat, lng]} zoom={15} style={{ height: 420, width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <Marker position={[lat, lng]} icon={scooterIcon}>
            <Popup><div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{scooter.name}<br />{lat.toFixed(5)}, {lng.toFixed(5)}</div></Popup>
          </Marker>
          {scooter.geofence?.isEnabled && scooter.geofence?.polygon?.coordinates?.[0] && (
            <Polygon positions={scooter.geofence.polygon.coordinates[0].map(([ln, la]) => [la, ln])}
              pathOptions={{ color: '#00e5ff', fillColor: '#00e5ff', fillOpacity: 0.07, weight: 1.5, dashArray: '6 4' }} />
          )}
          {scooter.geofence?.isEnabled && scooter.geofence?.polygon?.coordinates?.length > 1 && (
            scooter.geofence.polygon.coordinates.slice(1).map((ring, idx) => (
              <Polygon key={`ex-${idx}`} positions={ring.map(([ln, la]) => [la, ln])}
                pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.15, weight: 2, dashArray: '4 3' }} />
            ))
          )}
        </MapContainer>
      </div>
    </div>
  )
}

function ZoneTab({
  scooter,
  lat,
  lng,
  zoneEnabled,
  setZoneEnabled,
  zoneName,
  setZoneName,
  drawMode,
  setDrawMode,
  drawnPoints,
  setDrawnPoints,
  exclusionMode,
  setExclusionMode,
  exclusionPoints,
  setExclusionPoints,
  exclusions,
  setExclusions,
  onSave,
  onClear,
  saving,
}) {
  const addPoint = pt => setDrawnPoints(p => [...p, pt])
  const removeLastPoint = () => setDrawnPoints(p => p.slice(0, -1))
  const addExclusionPoint = pt => setExclusionPoints(p => [...p, pt])
  const finishExclusion = () => {
    if (exclusionPoints.length < 3) return
    setExclusions(prev => [...prev, exclusionPoints])
    setExclusionPoints([])
    setExclusionMode(false)
  }
  const removeExclusion = (idx) => {
    setExclusions(prev => prev.filter((_, i) => i !== idx))
  }

  const existingRing = scooter.geofence?.polygon?.coordinates?.[0]
    ? scooter.geofence.polygon.coordinates[0].map(([ln, la]) => [la, ln])
    : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Geofence Zone</span></div>

          <div className="form-group">
            <label className="input-label">Zone Name</label>
            <input className="input" value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="e.g. Colombo CBD" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Enable Zone</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Lock engine when scooter exits</div>
            </div>
            <ToggleSwitch value={zoneEnabled} onChange={setZoneEnabled} />
          </div>

          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--accent)' }}>How to draw a zone:</strong><br />
              1. Click <strong>Start Drawing</strong><br />
              2. Click on the map to place points<br />
              3. Place at least 3 points<br />
              4. Click <strong>Finish</strong> then <strong>Save Zone</strong>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
            {drawnPoints.length} point{drawnPoints.length !== 1 ? 's' : ''} placed
            {drawnPoints.length >= 3 && <span style={{ color: 'var(--green)' }}> Ready</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!drawMode ? (
              <button className="btn btn-primary" onClick={() => { setDrawMode(true); setExclusionMode(false); }} style={{ justifyContent: 'center' }}>
                <MapPin size={13} /> {drawnPoints.length > 0 ? 'Continue Drawing' : 'Start Drawing'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDrawMode(false)}>
                  <X size={13} /> Finish
                </button>
                <button className="btn btn-ghost btn-sm" onClick={removeLastPoint} disabled={drawnPoints.length === 0}>Undo</button>
              </div>
            )}
            {!exclusionMode ? (
              <button className="btn btn-ghost" onClick={() => { setExclusionMode(true); setDrawMode(false); }} style={{ justifyContent: 'center' }}>
                <MapPin size={13} /> Add Exclusion Zone
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={finishExclusion} disabled={exclusionPoints.length < 3}>
                  <Save size={13} /> Save Exclusion
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setExclusionMode(false); setExclusionPoints([]) }}>
                  Cancel
                </button>
              </div>
            )}
            {exclusions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {exclusions.map((_, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text2)' }}>
                    <span>Exclusion {idx + 1}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeExclusion(idx)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-primary" onClick={onSave} disabled={saving} style={{ justifyContent: 'center' }}>
              {saving ? <div className="spinner" /> : <><Save size={13} /> Save Zone</>}
            </button>
            {(drawnPoints.length > 0 || scooter.geofence?.isEnabled) && (
              <button className="btn btn-danger" onClick={onClear} style={{ justifyContent: 'center' }}>
                <Trash2 size={13} /> Clear Zone
              </button>
            )}
          </div>
        </div>

        {scooter.geofence?.isEnabled && (
          <div className="card" style={{ borderColor: 'rgba(0,229,255,0.3)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Shield size={16} color="var(--accent)" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Zone Active</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{scooter.geofence.name || 'Unnamed zone'}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {drawMode && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(0,229,255,0.15)', border: '1px solid var(--accent)', borderRadius: 20, padding: '5px 14px', fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', pointerEvents: 'none' }}>
            DRAWING MODE - Click map to add points
          </div>
        )}
        <MapContainer center={[lat, lng]} zoom={14} style={{ height: 500, width: '100%', cursor: (drawMode || exclusionMode) ? 'crosshair' : 'grab' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <ZoneDrawer drawing={drawMode} onPoint={addPoint} />
          <ZoneDrawer drawing={exclusionMode} onPoint={addExclusionPoint} />

          <Marker position={[lat, lng]} icon={L.divIcon({
            className: '',
            html: `<div style="width:32px;height:32px;border-radius:50%;background:#00e5ff;border:2px solid #00ff88;display:flex;align-items:center;justify-content:center;font-size:14px;">&#128757;</div>`,
            iconSize: [32, 32], iconAnchor: [16, 16],
          })} />

          {drawnPoints.length >= 3 && (
            <Polygon positions={drawnPoints}
              pathOptions={{ color: '#ff6b35', fillColor: '#ff6b35', fillOpacity: 0.1, weight: 2, dashArray: '6 3' }} />
          )}

          {exclusions.map((ex, idx) => (
            <Polygon key={`ex-${idx}`} positions={ex}
              pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.15, weight: 2, dashArray: '4 3' }} />
          ))}

          {exclusionPoints.length >= 3 && (
            <Polygon positions={exclusionPoints}
              pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.15, weight: 2, dashArray: '4 3' }} />
          )}

          {exclusionPoints.filter(pt => Array.isArray(pt) && pt.length === 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])).map((pt, i) => (
            <Marker key={`ex-pt-${i}`} position={pt} icon={L.divIcon({
              className: '',
              html: `<div style="width:8px;height:8px;border-radius:50%;background:#ff3d5a;border:2px solid #fff;"></div>`,
              iconSize: [8, 8], iconAnchor: [4, 4],
            })} />
          ))}

          {drawnPoints.filter(pt => Array.isArray(pt) && pt.length === 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])).map((pt, i) => (
            <Marker key={i} position={pt} icon={L.divIcon({
              className: '',
              html: `<div style="width:10px;height:10px;border-radius:50%;background:#ff6b35;border:2px solid #fff;"></div>`,
              iconSize: [10, 10], iconAnchor: [5, 5],
            })} />
          ))}

          {existingRing && drawnPoints.length === 0 && (
            <Polygon positions={existingRing}
              pathOptions={{ color: '#00e5ff', fillColor: '#00e5ff', fillOpacity: 0.07, weight: 1.5, dashArray: '6 4' }} />
          )}
        </MapContainer>
      </div>
    </div>
  )
}

function TripsTab({ trips, onViewRoute }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Trip History</span></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Status</th><th>Rider</th><th>Started</th><th>Duration</th><th>Distance</th><th></th></tr>
          </thead>
          <tbody>
            {trips.map(t => (
              <tr key={t._id}>
                <td><span className={`badge ${t.status === 'active' ? 'badge-rented' : t.status === 'completed' ? 'badge-available' : 'badge-offline'}`}>{t.status}</span></td>
                <td><div style={{ color: 'var(--text)', fontWeight: 500 }}>{t.rider?.name}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.rider?.phone}</div></td>
                <td style={{ fontSize: 11 }}>{new Date(t.startedAt).toLocaleString()}</td>
                <td><span className="mono" style={{ fontSize: 11 }}>{t.durationMinutes ? `${t.durationMinutes} min` : '-'}</span></td>
                <td><span className="mono" style={{ fontSize: 11 }}>{t.distanceKm ? `${t.distanceKm} km` : '-'}</span></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => onViewRoute(t)}>Playback</button></td>
              </tr>
            ))}
            {trips.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 30 }}>No trips recorded</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RoutePlaybackModal({ trip, onClose }) {
  const routePoints = (trip.route || []).map(p => [p.coordinates[1], p.coordinates[0]])
  const start = trip.startLocation?.coordinates ? [trip.startLocation.coordinates[1], trip.startLocation.coordinates[0]] : null
  const end = trip.endLocation?.coordinates ? [trip.endLocation.coordinates[1], trip.endLocation.coordinates[0]] : null
  const center = start || [6.9271, 79.8612]
  const [playing, setPlaying] = useState(false)
  const [index, setIndex] = useState(0)
  const [speedMs, setSpeedMs] = useState(500)
  const [loop, setLoop] = useState(false)

  const markerIcon = (label, size = 20) => L.divIcon({
    className: '',
    html: `<div style="font-size:${size}px;line-height:1;">${label}</div>`,
    iconSize: [size + 4, size + 4],
    iconAnchor: [(size + 4) / 2, (size + 4) / 2],
  })

  const vehicleIcon = L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:rgba(0,229,255,0.15);border:1px solid rgba(0,229,255,0.5);display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(0,229,255,0.35);font-size:16px;">&#128757;</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

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
    : start

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>Trip Playback - {trip.scooter?.name}</div>
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

        <MapContainer center={center} zoom={14} style={{ height: 380, borderRadius: 10, overflow: 'hidden' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          {routePoints.length >= 2 && (
            <Polyline positions={routePoints} pathOptions={{ color: '#00e5ff', weight: 3, opacity: 0.85 }} />
          )}
          {start && <Marker position={start} icon={markerIcon('\u{1F7E2}', 16)}><Popup>Start</Popup></Marker>}
          {end && <Marker position={end} icon={markerIcon('\u{1F534}', 16)}><Popup>End</Popup></Marker>}
          {currentPoint && <Marker position={currentPoint} icon={vehicleIcon}><Popup>Playback</Popup></Marker>}
        </MapContainer>

        {routePoints.length === 0 && (
          <div style={{ marginTop: 12, color: 'var(--text3)', fontSize: 12, textAlign: 'center' }}>No route data available for this trip</div>
        )}
      </div>
    </div>
  )
}

function AlertsTab({ alerts }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Alerts</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map(a => (
          <div key={a._id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>
              {a.severity === 'critical' ? '\u{1F6A8}' : a.severity === 'warning' ? '\u{26A0}\u{FE0F}' : '\u{2139}\u{FE0F}'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13 }}>{a.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{a.message}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{new Date(a.createdAt).toLocaleString()}</div>
            </div>
            {!a.isRead && <div className="dot dot-red" style={{ marginTop: 5, flexShrink: 0 }} />}
          </div>
        ))}
        {alerts.length === 0 && <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 30 }}>No alerts</div>}
      </div>
    </div>
  )
}

function MetricBox({ label, value, color, icon }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{icon} {label}</div>
      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function CmdButton({ icon, label, onClick, color }) {
  return (
    <button className="btn btn-ghost" onClick={onClick} style={{ justifyContent: 'center', borderColor: `${color}30`, color }}>
      {icon} {label}
    </button>
  )
}

function ToggleSwitch({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, background: value ? 'var(--accent)' : 'var(--border2)',
      position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.2s',
      }} />
    </div>
  )
}
