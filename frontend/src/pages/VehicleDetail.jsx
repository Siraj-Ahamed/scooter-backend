import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMapEvents, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { ArrowLeft, Lock, Unlock, Zap, MapPin, Navigation, Shield, Edit2, Trash2, Save, X, ChevronDown } from 'lucide-react'
import TripPlaybackModal from '../components/TripPlaybackModal'
import { vehicleAPI, tripAPI, alertAPI, zoneAPI } from '../api'
import { useSocket } from '../context/SocketContext'
import { useTheme } from '../context/ThemeContext'
import { vehicleTypeMeta, VEHICLE_TYPES } from '../utils/vehicleTypes'
import { TILE_DARK, TILE_LIGHT } from '../utils/mapTiles'
import toast from 'react-hot-toast'

function ZoneDrawer({ drawing, onPoint }) {
  useMapEvents({ click(e) { if (drawing) onPoint([e.latlng.lat, e.latlng.lng]) } })
  return null
}

const STATUS_COLOR = { available: '#00ff88', rented: '#00e5ff', locked: '#ff3d5a', offline: '#4a5568', maintenance: '#ffd700' }

function makeVehicleIcon(emoji, statusColor = '#00e5ff', isOnline = true) {
  return L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;border-radius:50%;background:${statusColor}22;border:2px solid ${statusColor};display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 ${isOnline ? `12px ${statusColor}` : '0'};">${emoji}</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18],
  })
}

const dotIcon = (color = '#ff6b35') => L.divIcon({
  className: '',
  html: `<div style="width:9px;height:9px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.4)"></div>`,
  iconSize: [9, 9], iconAnchor: [4, 4],
})

const getAssignedZoneIds = (vehicle) => {
  const ids = Array.isArray(vehicle?.assignedZones)
    ? vehicle.assignedZones.map((z) => (z?._id || z).toString())
    : [];
  if (!ids.length && vehicle?.assignedZone) ids.push((vehicle.assignedZone._id || vehicle.assignedZone).toString());
  return ids;
}

export default function VehicleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { liveLocations, liveStatuses, isVehicleOnline, watchScooter } = useSocket()
  const { isDark } = useTheme()

  const [vehicle, setVehicle] = useState(null)
  const [trips, setTrips]     = useState([])
  const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('overview')
  const [selectedTrip, setSelectedTrip] = useState(null)

  // ── Zone state ───────────────────────────────────────────────────────────────
  const [zones, setZones]                   = useState([])
  const [zoneEnabled, setZoneEnabled]       = useState(false)
  const [zoneName, setZoneName]             = useState('')
  const [assignedZoneIds, setAssignedZoneIds] = useState([])

  // Custom main zone
  const [useCustomZone, setUseCustomZone]   = useState(false)
  const [drawMode, setDrawMode]             = useState(false)
  const [drawnPoints, setDrawnPoints]       = useState([])

  // Custom exclusion zones
  const [useCustomExclusion, setUseCustomExclusion]       = useState(false)
  const [exclusionDrawMode, setExclusionDrawMode]         = useState(false)
  const [pendingExclusionPts, setPendingExclusionPts]     = useState([])
  const [customExclusions, setCustomExclusions]           = useState([])  // [ [[lat,lng],...], ... ]

  const [savingZone, setSavingZone]         = useState(false)

  // ── Edit state ───────────────────────────────────────────────────────────────
  const [editing, setEditing]   = useState(false)
  const [editForm, setEditForm] = useState({})

  const load = () => {
    setLoading(true)
    Promise.all([
      vehicleAPI.get(id),
      tripAPI.list({ scooterId: id, limit: 10 }),
      alertAPI.list({ limit: 10 }),
      zoneAPI.list(),
    ]).then(([v, t, a, z]) => {
      const vc = v.data.data
      setVehicle(vc)
      setEditForm({ name: vc.name, vehicleType: vc.vehicleType, model: vc.model, plateNumber: vc.plateNumber, color: vc.color })

      const gf = vc.geofence || {}
      setZoneEnabled(gf.isEnabled || false)
      setZoneName(gf.name || '')
      setUseCustomZone(gf.useCustomZone || false)
      setAssignedZoneIds(getAssignedZoneIds(vc))

      // Load saved custom main boundary
      if (gf.useCustomZone && gf.polygon?.coordinates?.[0]) {
        setDrawnPoints(gf.polygon.coordinates[0].map(([lng, lat]) => [lat, lng]))
      } else {
        setDrawnPoints([])
      }

      // Load saved custom exclusions (extra rings in polygon)
      if (gf.useCustomExclusion && gf.polygon?.coordinates?.length > 1) {
        setCustomExclusions(
          gf.polygon.coordinates.slice(1).map(ring => ring.map(([lng, lat]) => [lat, lng]))
        )
        setUseCustomExclusion(true)
      } else {
        setCustomExclusions([])
        setUseCustomExclusion(gf.useCustomExclusion || false)
      }

      setTrips(t.data.data)
      setAlerts(a.data.data)
      setZones(z.data.data)
    }).catch(() => toast.error('Failed to load vehicle'))
    .finally(() => setLoading(false))
  }

  useEffect(() => { load(); watchScooter(id) }, [id])

  const live        = liveLocations[id]
  const liveStatus  = liveStatuses[id] || {}
  const current     = vehicle ? {
    ...vehicle,
    isOnline:   isVehicleOnline(id, vehicle.isOnline, vehicle.status),
    status:     liveStatus.status     !== undefined ? liveStatus.status     : vehicle.status,
    isEngineOn: liveStatus.isEngineOn !== undefined ? liveStatus.isEngineOn : vehicle.isEngineOn,
  } : null

  const battery  = live?.battery ?? vehicle?.lastTelemetry?.battery ?? 0
  const speed    = live?.speed   ?? vehicle?.lastTelemetry?.speed   ?? 0
  const lat      = live?.lat ?? (vehicle?.location?.coordinates?.[1] || 6.9271)
  const lng      = live?.lng ?? (vehicle?.location?.coordinates?.[0] || 79.8612)
  const batColor = battery > 50 ? 'var(--green)' : battery > 20 ? 'var(--yellow)' : 'var(--red)'
  const statusColor = STATUS_COLOR[current?.status] || '#4a5568'
  const tileUrl = isDark ? TILE_DARK : TILE_LIGHT

  const sendCommand = async (action) => {
    try {
      await vehicleAPI.command(id, { action })
      toast.success(`${action} sent`)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  const saveEdit = async () => {
    try {
      await vehicleAPI.update(id, editForm)
      toast.success('Vehicle updated')
      setEditing(false)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed') }
  }

  // ── Save zone settings ───────────────────────────────────────────────────────
  const saveZone = async () => {
    if (zoneEnabled && useCustomZone && drawnPoints.length < 3) {
      toast.error('Draw at least 3 points for your custom zone'); return
    }
    if (zoneEnabled && !useCustomZone && (!assignedZoneIds || assignedZoneIds.length === 0)) {
      toast.error('Assign a predefined zone or enable custom zone'); return
    }
    setSavingZone(true)
    try {
      const toRing = (pts) => {
        if (!pts.length) return []
        const r = pts.map(([la, ln]) => [ln, la])
        r.push(r[0])
        return r
      }

      const outerRing = useCustomZone ? toRing(drawnPoints) : []
      const exclusionRings = useCustomExclusion
        ? customExclusions.map(toRing).filter(r => r.length >= 4)
        : []

      // Build polygon: outer + exclusion rings
      let polygon
      if (useCustomZone && outerRing.length >= 4) {
        polygon = { type: 'Polygon', coordinates: [outerRing, ...exclusionRings] }
      } else if (!useCustomZone && useCustomExclusion && exclusionRings.length > 0) {
        // No custom outer but has custom exclusions — store as just exclusion rings
        polygon = { type: 'Polygon', coordinates: [[], ...exclusionRings] }
      }

      const nextAssigned = Array.from(new Set(assignedZoneIds || []))
      const currentAssigned = getAssignedZoneIds(vehicle || {})
      const toAdd = nextAssigned.filter((z) => !currentAssigned.includes(z))
      const toRemove = currentAssigned.filter((z) => !nextAssigned.includes(z))
      if (toAdd.length || toRemove.length) {
        await Promise.all([
          ...toAdd.map((z) => zoneAPI.assign(z, { vehicleId: id, assign: true })),
          ...toRemove.map((z) => zoneAPI.assign(z, { vehicleId: id, assign: false })),
        ])
      }

      await vehicleAPI.setGeofence(id, {
        isEnabled: zoneEnabled,
        name: zoneName || 'Zone',
        useCustomZone,
        useCustomExclusion,
        polygon,
      })
      toast.success(`Zone ${zoneEnabled ? 'activated' : 'saved'}`)
      setDrawMode(false)
      setExclusionDrawMode(false)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Zone save failed') }
    finally { setSavingZone(false) }
  }

  const clearZone = async () => {
    setDrawnPoints([])
    setZoneEnabled(false)
    setCustomExclusions([])
    setPendingExclusionPts([])
    setDrawMode(false)
    setExclusionDrawMode(false)
    try {
      await vehicleAPI.setGeofence(id, { isEnabled: false, name: '', useCustomZone: false, useCustomExclusion: false })
      toast.success('Zone cleared')
      load()
    } catch {}
  }

  const viewRoute = async (trip) => {
    try { const { data } = await tripAPI.get(trip._id); setSelectedTrip(data.data) }
    catch { toast.error('Failed to load route') }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )
  if (!current) return <div style={{ padding: 40, color: 'var(--text3)' }}>Vehicle not found.</div>

  const meta = vehicleTypeMeta(current.vehicleType)

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <button className="btn-icon" onClick={() => navigate('/vehicles')}><ArrowLeft size={15} /></button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{meta.emoji}</span>
              <div className="page-title">{current.name}</div>
              <span className={`badge badge-${current.status}`}>{current.status}</span>
              <div className={`dot ${current.isOnline && current.status !== 'offline' ? 'dot-green' : 'dot-gray'}`} />
            </div>
            <div className="page-sub" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
              {meta.label} &middot; {current.deviceId} {current.plateNumber && `· ${current.plateNumber}`}
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
              {t === 'zone' ? '📍 Zone' : t === 'trips' ? '🛣️ Trips' : t === 'alerts' ? '🔔 Alerts' : '📊 Overview'}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {tab === 'overview' && (
          <OverviewTab vehicle={current} live={live} lat={lat} lng={lng} battery={battery} speed={speed} batColor={batColor} onCommand={sendCommand} meta={meta} tileUrl={tileUrl} isDark={isDark} statusColor={statusColor} />
        )}
        {tab === 'zone' && (
          <ZoneTab
            vehicleId={id}
            vehicle={vehicle}
            lat={lat} lng={lng}
            zones={zones}
            assignedZoneIds={assignedZoneIds}         setAssignedZoneIds={setAssignedZoneIds}
            zoneEnabled={zoneEnabled}                 setZoneEnabled={setZoneEnabled}
            zoneName={zoneName}                       setZoneName={setZoneName}
            useCustomZone={useCustomZone}             setUseCustomZone={v => { setUseCustomZone(v); if (!v) { setDrawMode(false); setDrawnPoints([]) } }}
            drawMode={drawMode}                       setDrawMode={setDrawMode}
            drawnPoints={drawnPoints}                 setDrawnPoints={setDrawnPoints}
            useCustomExclusion={useCustomExclusion}   setUseCustomExclusion={v => { setUseCustomExclusion(v); if (!v) { setExclusionDrawMode(false); setPendingExclusionPts([]); setCustomExclusions([]) } }}
            exclusionDrawMode={exclusionDrawMode}     setExclusionDrawMode={setExclusionDrawMode}
            pendingExclusionPts={pendingExclusionPts} setPendingExclusionPts={setPendingExclusionPts}
            customExclusions={customExclusions}       setCustomExclusions={setCustomExclusions}
            onSave={saveZone}
            onClear={clearZone}
            saving={savingZone}
            meta={meta}
            tileUrl={tileUrl}
            isDark={isDark}
            statusColor={statusColor}
            isOnline={current?.isOnline}
          />
        )}
        {tab === 'trips'  && <TripsTab trips={trips} onViewRoute={viewRoute} />}
        {tab === 'alerts' && <AlertsTab alerts={alerts} />}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit Vehicle</div>
            <div className="form-group">
              <label className="input-label">Vehicle Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {VEHICLE_TYPES.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => setEditForm(p => ({ ...p, vehicleType: t.value }))}
                    style={{ padding: '8px 4px', borderRadius: 8, border: `1px solid ${editForm.vehicleType === t.value ? t.color : 'var(--border)'}`, background: editForm.vehicleType === t.value ? `${t.color}18` : 'var(--surface2)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 18 }}>{t.emoji}</span>
                    <span style={{ fontSize: 9, color: editForm.vehicleType === t.value ? t.color : 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {[['name','Name'],['model','Model'],['plateNumber','Plate Number'],['color','Color']].map(([k, label]) => (
              <div className="form-group" key={k}>
                <label className="input-label">{label}</label>
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

      {selectedTrip && <TripPlaybackModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// ZONE TAB
// ────────────────────────────────────────────────────────────────────────────────
function ZoneTab({
  vehicleId, vehicle, lat, lng,
  zones,
  assignedZoneIds, setAssignedZoneIds,
  zoneEnabled, setZoneEnabled,
  zoneName, setZoneName,
  useCustomZone, setUseCustomZone,
  drawMode, setDrawMode,
  drawnPoints, setDrawnPoints,
  useCustomExclusion, setUseCustomExclusion,
  exclusionDrawMode, setExclusionDrawMode,
  pendingExclusionPts, setPendingExclusionPts,
  customExclusions, setCustomExclusions,
  onSave, onClear, saving, meta, tileUrl, isDark, statusColor, isOnline,
}) {
  const assignedZones = zones.filter((z) => assignedZoneIds.includes(z._id))
  const assignedRings = assignedZones.map((z) => ({
    id: z._id,
    name: z.name,
    color: z.color || '#00e5ff',
    outer: z.polygon?.coordinates?.[0]?.map(([ln, la]) => [la, ln]) || null,
    exclusions: z.polygon?.coordinates?.slice(1)?.map((r) => r.map(([ln, la]) => [la, ln])) || [],
  }))
  const assignedNames = assignedZones.map((z) => z.name).filter(Boolean)

  const customOuterRing = useCustomZone
    ? (drawnPoints.length >= 3 ? drawnPoints : vehicle.geofence?.polygon?.coordinates?.[0]?.map(([ln, la]) => [la, ln]) || null)
    : null

  const customExclusionRings = useCustomExclusion ? customExclusions : []
  const assignedExclusionCount = assignedRings.reduce((sum, r) => sum + (r.exclusions?.length || 0), 0)

  const anyDrawActive = drawMode || exclusionDrawMode

  const addMainPoint       = pt => setDrawnPoints(p => [...p, pt])
  const addExclusionPoint  = pt => setPendingExclusionPts(p => [...p, pt])
  const finishExclusion    = () => {
    if (pendingExclusionPts.length < 3) { toast.error('Draw at least 3 points'); return }
    setCustomExclusions(p => [...p, pendingExclusionPts])
    setPendingExclusionPts([])
    setExclusionDrawMode(false)
  }

  const vehicleIcon = makeVehicleIcon(meta.emoji, statusColor, isOnline)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

      {/* ── Left panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── Master enable ── */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Shield size={15} color={zoneEnabled ? 'var(--accent)' : 'var(--text3)'} />
                Geofence
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Enforce boundary for this vehicle</div>
            </div>
            <ToggleSwitch value={zoneEnabled} onChange={setZoneEnabled} />
          </div>
          {zoneEnabled && (
            <div className="form-group" style={{ marginBottom: 0, marginTop: 12 }}>
              <label className="input-label">Zone Label</label>
              <input className="input" value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="e.g. Colombo CBD" />
            </div>
          )}
        </div>

        {/* ── Predefined zone picker ── */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15 }}>📋</span> Predefined Zone
          </div>
          {zones.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', padding: '6px 0' }}>
              No predefined zones — create one in the <strong>Zones</strong> page.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ZonePill label="Clear all" sub="No predefined zones" color="var(--border2)" selected={assignedZoneIds.length === 0} onClick={() => setAssignedZoneIds([])} />
              {zones.map(z => {
                const isSelected = assignedZoneIds.includes(z._id)
                return (
                  <ZonePill key={z._id} label={z.name}
                    sub={z.description || `${(z.polygon?.coordinates?.length || 1) - 1} exclusion zone${(z.polygon?.coordinates?.length || 1) - 1 !== 1 ? 's' : ''}`}
                    color={z.color || '#00e5ff'}
                    selected={isSelected}
                    onClick={() => setAssignedZoneIds(p => isSelected ? p.filter(id => id !== z._id) : [...p, z._id])} />
                )
              })}
            </div>
          )}
        </div>

        {/* ── Custom Zone toggle panel ── */}
        <SlidePanel
          open={useCustomZone}
          onToggle={() => setUseCustomZone(!useCustomZone)}
          icon="✏️"
          label="Custom Zone"
          labelColor={useCustomZone ? '#ff6b35' : undefined}
          sub={useCustomZone ? 'Drawing custom boundary' : 'Draw a zone specific to this vehicle'}
        >
          {/* Status bar */}
          <StatusBar active={drawMode} activeText="✏️ Click map to add boundary points"
            idleText={`📍 ${drawnPoints.length} point${drawnPoints.length !== 1 ? 's' : ''} ${drawnPoints.length >= 3 ? '✓ ready' : '(min 3 required)'}`} />

          <SectionLabel>Main Boundary</SectionLabel>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className={`btn btn-sm ${drawMode ? 'btn-ghost' : 'btn-primary'}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => { setDrawMode(!drawMode); setExclusionDrawMode(false) }}>
              <MapPin size={11} />
              {drawMode ? 'Stop Drawing' : drawnPoints.length > 0 ? 'Continue' : 'Start Drawing'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDrawnPoints(p => p.slice(0,-1))} disabled={!drawnPoints.length}>Undo</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDrawnPoints([])} disabled={!drawnPoints.length}>Clear</button>
          </div>
        </SlidePanel>

        {/* ── Custom Exclusion Zone toggle panel ── */}
        <SlidePanel
          open={useCustomExclusion}
          onToggle={() => setUseCustomExclusion(!useCustomExclusion)}
          icon="⛔"
          label="Custom Exclusion Zones"
          labelColor={useCustomExclusion ? 'var(--red)' : undefined}
          sub={useCustomExclusion ? 'Drawing custom exclusion areas' : 'Add no-go areas on top of any zone'}
        >
          {/* Status bar */}
          <StatusBar active={exclusionDrawMode}
            activeText={`⛔ Click map to add points (${pendingExclusionPts.length} drawn)`}
            idleText={`${customExclusions.length} exclusion zone${customExclusions.length !== 1 ? 's' : ''} defined`}
            color="var(--red)" />

          {/* Saved exclusion zones list */}
          {customExclusions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {customExclusions.map((ex, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 6, background: 'rgba(255,61,90,0.08)', border: '1px solid rgba(255,61,90,0.2)', fontSize: 11, color: 'var(--text2)' }}>
                  <span>⛔ Exclusion {idx + 1} <span style={{ color: 'var(--text3)' }}>({ex.length} pts)</span></span>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setCustomExclusions(p => p.filter((_,i) => i !== idx))}>Remove</button>
                </div>
              ))}
            </div>
          )}

          {/* Draw controls */}
          {exclusionDrawMode ? (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={finishExclusion} disabled={pendingExclusionPts.length < 3}>
                  <Save size={11} /> Finish ({pendingExclusionPts.length} pts)
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPendingExclusionPts(p => p.slice(0,-1))} disabled={!pendingExclusionPts.length}>Undo</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setExclusionDrawMode(false); setPendingExclusionPts([]) }}>Cancel</button>
              </div>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(255,61,90,0.3)' }}
              onClick={() => { setExclusionDrawMode(true); setDrawMode(false) }}>
              <span style={{ fontSize: 13 }}>⛔</span> Add Exclusion Zone
            </button>
          )}
        </SlidePanel>

        {/* ── Active zone status badge ── */}
        {vehicle.geofence?.isEnabled && (
          <div className="card" style={{ borderColor: 'rgba(0,229,255,0.3)', padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Shield size={15} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Zone Active</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {(() => {
                    const parts = []
                    if (vehicle.geofence?.useCustomZone) parts.push('✏️ Custom zone')
                    if (assignedNames.length) parts.push(`📋 ${assignedNames.join(', ')}`)
                    if (!parts.length) parts.push('—')
                    return parts.join(' · ')
                  })()}
                  {vehicle.geofence?.useCustomExclusion && ' · ⛔ custom exclusions'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Save / Clear ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-primary" onClick={onSave} disabled={saving} style={{ justifyContent: 'center' }}>
            {saving ? <div className="spinner" /> : <><Save size={13} /> Save Zone Settings</>}
          </button>
          {(drawnPoints.length > 0 || vehicle.geofence?.isEnabled) && (
            <button className="btn btn-danger" onClick={onClear} style={{ justifyContent: 'center' }}>
              <Trash2 size={13} /> Clear All Zones
            </button>
          )}
        </div>
      </div>

      {/* ── Map ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {anyDrawActive && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: drawMode ? 'rgba(255,107,53,0.15)' : 'rgba(255,61,90,0.15)', border: `1px solid ${drawMode ? '#ff6b35' : 'var(--red)'}`, borderRadius: 20, padding: '5px 16px', fontSize: 11, color: drawMode ? '#ff6b35' : 'var(--red)', fontFamily: 'var(--mono)', pointerEvents: 'none', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {drawMode ? 'Custom Boundary — Click map' : 'Exclusion Zone — Click map'}
          </div>
        )}

        <MapContainer center={[lat, lng]} zoom={14} style={{ height: 580, width: '100%' }}>
          <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} />
          <ZoneDrawer drawing={drawMode}          onPoint={addMainPoint} />
          <ZoneDrawer drawing={exclusionDrawMode} onPoint={addExclusionPoint} />
          <Marker position={[lat, lng]} icon={vehicleIcon} />

          {/* Assigned zones */}
          {assignedRings.filter(r => r.outer?.length >= 3).map(r => (
            <Polygon key={`az-${r.id}`} positions={r.outer}
              pathOptions={{ color: r.color, fillColor: r.color, fillOpacity: 0.08, weight: 2, dashArray: '6 3' }} />
          ))}

          {/* Custom zone */}
          {useCustomZone && customOuterRing?.length >= 3 && (
            <Polygon positions={customOuterRing}
              pathOptions={{ color: '#ff6b35', fillColor: '#ff6b35', fillOpacity: 0.1, weight: 2, dashArray: '6 3' }} />
          )}

          {/* Drawn boundary dots */}
          {useCustomZone && drawnPoints.filter(p => isFinite(p[0]) && isFinite(p[1])).map((pt, i) => (
            <Marker key={`dp${i}`} position={pt} icon={dotIcon('#ff6b35')} />
          ))}

          {/* Assigned zone exclusions */}
          {assignedRings.flatMap(r => r.exclusions || []).map((hole, i) => (
            <Polygon key={`exc-a-${i}`} positions={hole}
              pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.16, weight: 2, dashArray: '4 3' }} />
          ))}

          {/* Custom exclusion rings */}
          {customExclusionRings.map((hole, i) => (
            <Polygon key={`exc-c-${i}`} positions={hole}
              pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.16, weight: 2, dashArray: '4 3' }} />
          ))}

          {/* Pending exclusion being drawn */}
          {pendingExclusionPts.length >= 3 && (
            <Polygon positions={pendingExclusionPts}
              pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.12, weight: 2, dashArray: '4 3', opacity: 0.7 }} />
          )}
          {pendingExclusionPts.filter(p => isFinite(p[0]) && isFinite(p[1])).map((pt, i) => (
            <Marker key={`ep${i}`} position={pt} icon={dotIcon('#ff3d5a')} />
          ))}
        </MapContainer>

        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {assignedRings.filter(r => r.outer?.length >= 3).map(r => (
            <LegendPill key={`lg-az-${r.id}`} color={r.color} label={r.name || 'Assigned zone'} />
          ))}
          {useCustomZone && customOuterRing?.length >= 3 && (
            <LegendPill color="#ff6b35" label="Custom boundary" />
          )}
          {assignedExclusionCount > 0 && (
            <LegendPill color="#ff3d5a" label={`${assignedExclusionCount} exclusion zone${assignedExclusionCount !== 1 ? 's' : ''}`} />
          )}
          {customExclusionRings.length > 0 && (
            <LegendPill color="#ff3d5a" label={`${customExclusionRings.length} custom exclusion${customExclusionRings.length !== 1 ? 's' : ''}`} />
          )}
          {pendingExclusionPts.length > 0 && (
            <LegendPill color="#ff3d5a" label={`Drawing: ${pendingExclusionPts.length} pts`} dashed />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Slide panel component ─────────────────────────────────────────────────────
function SlidePanel({ open, onToggle, icon, label, labelColor, sub, children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Toggle header */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', cursor: 'pointer', userSelect: 'none' }}
        onClick={onToggle}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: open ? (labelColor || 'var(--accent)') : 'var(--text)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16 }}>{icon}</span> {label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ToggleSwitch value={open} onChange={onToggle} stopPropagation={false} />
        </div>
      </div>

      {/* Animated slide-down body */}
      <div style={{
        maxHeight: open ? 500 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.38s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function StatusBar({ active, activeText, idleText, color }) {
  return (
    <div style={{
      background: active ? `rgba(${color ? '255,61,90' : '0,229,255'},0.07)` : 'var(--surface2)',
      border: `1px solid ${active ? (color || 'rgba(0,229,255,0.3)') : 'var(--border)'}`,
      borderRadius: 8, padding: '7px 12px', marginBottom: 12,
      fontSize: 11, color: active ? (color || 'var(--accent)') : 'var(--text3)',
      fontFamily: 'var(--mono)', transition: 'all 0.2s',
    }}>
      {active ? activeText : idleText}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
      {children}
    </div>
  )
}

function LegendPill({ color, label, dashed }) {
  return (
    <div style={{ background: 'rgba(10,12,16,0.82)', borderRadius: 6, padding: '4px 10px', fontSize: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 14, height: 2, background: dashed ? 'transparent' : color, borderRadius: 1, border: dashed ? `1px dashed ${color}` : 'none', flexShrink: 0 }} />
      {label}
    </div>
  )
}

function ZonePill({ label, sub, color, selected, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${selected ? color : 'var(--border)'}`, background: selected ? `${color}12` : 'var(--surface2)', cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: selected ? `0 0 6px ${color}` : 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: selected ? 600 : 400, color: selected ? 'var(--text)' : 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />}
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ vehicle, live, lat, lng, battery, speed, batColor, onCommand, meta, tileUrl, isDark, statusColor }) {
  const vehicleIcon = makeVehicleIcon(meta.emoji, statusColor, vehicle.isOnline && vehicle.status !== 'offline')
  const signalValue = formatSignal(live?.signal)
  const assignedZones = Array.isArray(vehicle.assignedZones) && vehicle.assignedZones.length
    ? vehicle.assignedZones
    : (vehicle.assignedZone ? [vehicle.assignedZone] : [])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Live Telemetry</span>
            {live && <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--mono)' }}>LIVE</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MetricBox label="Battery"   value={`${battery}%`}                color={batColor}          icon="🔋" />
            <MetricBox label="Speed"     value={`${speed} km/h`}              color="var(--accent)"     icon="⚡" />
            <MetricBox label="Engine"    value={vehicle.isEngineOn ? 'ON' : 'OFF'} color={vehicle.isEngineOn ? 'var(--green)' : 'var(--text3)'} icon="🔑" />
            <MetricBox label="Status"    value={vehicle.status}               color="var(--text2)"      icon="🛰️" />
            <MetricBox label="Signal"    value={signalValue}                  color="var(--text2)"      icon="📡" />
            <MetricBox label="Latitude"  value={lat.toFixed(5)}               color="var(--text2)"      icon="📍" />
            <MetricBox label="Longitude" value={lng.toFixed(5)}               color="var(--text2)"      icon="📍" />
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Remote Control</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <CmdButton icon={<Lock size={13} />}       label="Lock Engine"   onClick={() => onCommand('lock_engine')}   color="var(--red)"    />
            <CmdButton icon={<Unlock size={13} />}     label="Unlock Engine" onClick={() => onCommand('unlock_engine')} color="var(--green)"  />
            <CmdButton icon={<Navigation size={13} />} label="Get Location"  onClick={() => onCommand('get_location')}  color="var(--accent)" />
            <CmdButton icon={<Zap size={13} />}        label="Honk"          onClick={() => onCommand('honk')}          color="var(--yellow)" />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapContainer center={[lat, lng]} zoom={15} style={{ height: 420, width: '100%' }} zoomControl={false}>
          <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} />
          <Marker position={[lat, lng]} icon={vehicleIcon}>
            <Popup><div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{vehicle.name}<br />{lat.toFixed(5)}, {lng.toFixed(5)}</div></Popup>
          </Marker>
          {vehicle.geofence?.isEnabled && assignedZones.map((z) => {
            const ring = z?.polygon?.coordinates?.[0]
            if (!ring || ring.length < 3) return null
            const color = z.color || '#00e5ff'
            return (
              <Polygon key={`az-${z._id}`} positions={ring.map(([ln, la]) => [la, ln])}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.07, weight: 1.5, dashArray: '6 4' }} />
            )
          })}
          {vehicle.geofence?.isEnabled && vehicle.geofence?.useCustomZone && vehicle.geofence?.polygon?.coordinates?.[0]?.length >= 3 && (
            <Polygon positions={vehicle.geofence.polygon.coordinates[0].map(([ln, la]) => [la, ln])}
              pathOptions={{ color: '#ff6b35', fillColor: '#ff6b35', fillOpacity: 0.09, weight: 1.5, dashArray: '6 4' }} />
          )}
        </MapContainer>
      </div>
    </div>
  )
}

// ── Trips tab ─────────────────────────────────────────────────────────────────
function TripsTab({ trips, onViewRoute }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Trip History</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Status</th><th>Rider</th><th>Started</th><th>Duration</th><th>Distance</th><th></th></tr></thead>
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
            {!trips.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 30 }}>No trips recorded</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Alerts tab ────────────────────────────────────────────────────────────────
function AlertsTab({ alerts }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Alerts</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map(a => (
          <div key={a._id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{a.severity === 'critical' ? '🚨' : a.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13 }}>{a.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{a.message}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{new Date(a.createdAt).toLocaleString()}</div>
            </div>
            {!a.isRead && <div className="dot dot-red" style={{ marginTop: 5 }} />}
          </div>
        ))}
        {!alerts.length && <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 30 }}>No alerts</div>}
      </div>
    </div>
  )
}

// ── Route playback modal (superseded by TripPlaybackModal) ──────────────────
function RoutePlaybackModal_UNUSED({ trip, onClose, meta, tileUrl, isDark }) {
  const routePoints = (trip.route || []).map(p => [p.coordinates[1], p.coordinates[0]])
  const start  = trip.startLocation?.coordinates ? [trip.startLocation.coordinates[1], trip.startLocation.coordinates[0]] : null
  const end    = trip.endLocation?.coordinates   ? [trip.endLocation.coordinates[1],   trip.endLocation.coordinates[0]]   : null
  const center = start || [6.9271, 79.8612]
  const [playing, setPlaying] = useState(false)
  const [index, setIndex]     = useState(0)
  const [speedMs, setSpeedMs] = useState(500)
  const [loop, setLoop]       = useState(false)

  const dotIcon2 = (color, size = 16) => L.divIcon({ className: '', html: `<div style="font-size:${size}px">${color}</div>`, iconSize: [size + 4, size + 4], iconAnchor: [(size + 4) / 2, (size + 4) / 2] })
  const vehicleIcon = makeVehicleIcon(meta.emoji)

  useEffect(() => { setPlaying(false); setIndex(0) }, [trip?._id])
  useEffect(() => {
    if (!playing || !routePoints.length) return
    const id = setInterval(() => {
      setIndex(i => { const n = i + 1; if (n >= routePoints.length) { if (loop) return 0; setPlaying(false); return i; } return n; })
    }, speedMs)
    return () => clearInterval(id)
  }, [playing, speedMs, loop, routePoints.length])

  const currentPoint = routePoints.length ? routePoints[Math.min(index, routePoints.length - 1)] : start

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>{meta.emoji} Trip Playback — {trip.scooter?.name}</div>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          {[['Duration', trip.durationMinutes ? `${trip.durationMinutes} min` : '-'], ['Distance', trip.distanceKm ? `${trip.distanceKm} km` : '-'], ['Points', routePoints.length], ['Status', trip.status]].map(([label, value]) => (
            <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text)', marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <input type="range" min={0} max={Math.max(routePoints.length - 1, 0)} value={Math.min(index, Math.max(routePoints.length - 1, 0))} onChange={e => setIndex(Number(e.target.value))} style={{ width: '100%' }} disabled={!routePoints.length} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{routePoints.length ? `${index + 1}/${routePoints.length}` : '0/0'}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPlaying(p => !p)} disabled={!routePoints.length}>{playing ? 'Pause' : 'Play'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setIndex(0)} disabled={!routePoints.length}>Reset</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Speed</div>
          <select className="input" style={{ width: 120 }} value={speedMs} onChange={e => setSpeedMs(Number(e.target.value))}>
            <option value={1000}>1x</option><option value={500}>2x</option><option value={250}>4x</option><option value={125}>8x</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
            <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> Loop
          </label>
        </div>
        <MapContainer center={center} zoom={14} style={{ height: 380, borderRadius: 10, overflow: 'hidden' }}>
          <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} />
          {routePoints.length >= 2 && <Polyline positions={routePoints} pathOptions={{ color: '#00e5ff', weight: 3, opacity: 0.85 }} />}
          {start && <Marker position={start} icon={dotIcon2('🟢', 16)}><Popup>Start</Popup></Marker>}
          {end   && <Marker position={end}   icon={dotIcon2('🔴', 16)}><Popup>End</Popup></Marker>}
          {currentPoint && <Marker position={currentPoint} icon={vehicleIcon}><Popup>Playback</Popup></Marker>}
        </MapContainer>
        {!routePoints.length && <div style={{ marginTop: 12, color: 'var(--text3)', fontSize: 12, textAlign: 'center' }}>No route data available</div>}
      </div>
    </div>
  )
}

// ── Shared small components ───────────────────────────────────────────────────
function MetricBox({ label, value, color, icon }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{icon} {label}</div>
      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color }}>{value}</div>
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

function CmdButton({ icon, label, onClick, color }) {
  return <button className="btn btn-ghost" onClick={onClick} style={{ justifyContent: 'center', borderColor: `${color}30`, color }}>{icon} {label}</button>
}

function ToggleSwitch({ value, onChange, stopPropagation = true }) {
  return (
    <div onClick={e => { if (stopPropagation) e.stopPropagation(); onChange(!value) }}
      style={{ width: 44, height: 24, borderRadius: 12, background: value ? 'var(--accent)' : 'var(--border2)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.2s' }} />
    </div>
  )
}
