import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Plus, Trash2, Edit2, MapPin, Save, X, RefreshCw, Layers, Users } from 'lucide-react'
import { zoneAPI, vehicleAPI } from '../api'
import { vehicleTypeMeta } from '../utils/vehicleTypes'
import { useTheme } from '../context/ThemeContext'
import { TILE_DARK, TILE_LIGHT } from '../utils/mapTiles'
import toast from 'react-hot-toast'

// ── Map click handler ─────────────────────────────────────────────────────────
function DrawHandler({ active, onPoint }) {
  useMapEvents({ click(e) { if (active) onPoint([e.latlng.lat, e.latlng.lng]) } })
  return null
}

// ── Dot marker for drawn points ───────────────────────────────────────────────
const dotIcon = (color = '#ff6b35') => L.divIcon({
  className: '',
  html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [10, 10], iconAnchor: [5, 5],
})

const ZONE_COLORS = ['#00e5ff','#00ff88','#ff6b35','#ffd700','#a78bfa','#f472b6','#34d399','#fb923c']

const getAssignedZoneIds = (vehicle) => {
  const ids = Array.isArray(vehicle.assignedZones)
    ? vehicle.assignedZones.map((z) => (z?._id || z).toString())
    : [];
  if (!ids.length && vehicle.assignedZone) ids.push((vehicle.assignedZone._id || vehicle.assignedZone).toString());
  return ids;
};

export default function ZonesPage() {
  const { isDark } = useTheme()
  const [zones, setZones]         = useState([])
  const [vehicles, setVehicles]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState(null)   // zone being viewed/edited
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [zr, vr] = await Promise.all([zoneAPI.list(), vehicleAPI.list({ limit: 100 })])
      setZones(zr.data.data)
      setVehicles(vr.data.data)
    } catch { toast.error('Failed to load zones') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const tileUrl = isDark ? TILE_DARK : TILE_LIGHT

  const handleDelete = async (zone) => {
    if (!window.confirm(`Delete zone "${zone.name}"? It will be removed from all assigned vehicles.`)) return
    try {
      await zoneAPI.delete(zone._id)
      toast.success('Zone deleted')
      setSelected(null)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed') }
  }

  const handleAssign = async (zoneId, vehicleId, assign) => {
    try {
      await zoneAPI.assign(zoneId, { vehicleId, assign })
      toast.success(assign ? 'Zone assigned' : 'Zone removed')
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Predefined Zones</div>
            <div className="page-sub">{zones.length} zones defined — assign to any vehicle</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}><Plus size={13} /> New Zone</button>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap: 16 }}>
        {/* ── Zone list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
          ) : zones.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <Layers size={32} style={{ color: 'var(--text3)', marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>No zones yet</div>
              <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>Create your first predefined zone to assign to vehicles</div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 16, justifyContent: 'center' }} onClick={() => setShowCreate(true)}><Plus size={13} /> New Zone</button>
            </div>
          ) : (
            zones.map(z => (
              <ZoneCard
                key={z._id}
                zone={z}
                isSelected={selected?._id === z._id}
                onClick={() => setSelected(s => s?._id === z._id ? null : z)}
                onDelete={() => handleDelete(z)}
              />
            ))
          )}
        </div>

        {/* ── Zone detail panel ── */}
        {selected && (
          <ZoneDetailPanel
            zone={selected}
            vehicles={vehicles}
            onAssign={handleAssign}
            onClose={() => setSelected(null)}
            onUpdated={() => { load(); setSelected(null) }}
            onDelete={() => handleDelete(selected)}
            tileUrl={tileUrl}
            isDark={isDark}
          />
        )}
      </div>

      {showCreate && (
        <ZoneEditorModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
          tileUrl={tileUrl}
          isDark={isDark}
        />
      )}
    </>
  )
}

// ── Zone card ─────────────────────────────────────────────────────────────────
function ZoneCard({ zone, isSelected, onClick, onDelete }) {
  const ringCount = zone.polygon?.coordinates?.length || 0
  const exclusionCount = ringCount > 1 ? ringCount - 1 : 0
  return (
    <div className="card" style={{ cursor: 'pointer', borderColor: isSelected ? zone.color || 'var(--accent)' : 'var(--border)', background: isSelected ? `${zone.color}08` : undefined, transition: 'all 0.15s' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* colour swatch */}
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${zone.color || '#00e5ff'}22`, border: `2px solid ${zone.color || '#00e5ff'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MapPin size={15} color={zone.color || '#00e5ff'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.name}</div>
          {zone.description && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.description}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 10, color: zone.color || 'var(--accent)', fontFamily: 'var(--mono)', background: `${zone.color || '#00e5ff'}15`, borderRadius: 4, padding: '1px 6px' }}>
              {exclusionCount} exclusion{exclusionCount !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', background: 'var(--surface2)', borderRadius: 4, padding: '1px 6px' }}>
              <Users size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />{zone.assignedCount || 0} vehicle{zone.assignedCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <button className="btn-icon" title="Delete zone" style={{ color: 'var(--red)', borderColor: 'rgba(255,61,90,0.3)', flexShrink: 0 }}
          onClick={e => { e.stopPropagation(); onDelete() }}><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

// ── Zone detail side panel ─────────────────────────────────────────────────────
function ZoneDetailPanel({ zone, vehicles, onAssign, onClose, onUpdated, onDelete, tileUrl, isDark }) {
  const [editing, setEditing]   = useState(false)
  const outerRing = zone.polygon?.coordinates?.[0] || []
  const holes     = zone.polygon?.coordinates?.slice(1) || []
  const center    = outerRing.length
    ? [
        outerRing.reduce((s, p) => s + p[1], 0) / outerRing.length,
        outerRing.reduce((s, p) => s + p[0], 0) / outerRing.length,
      ]
    : [6.9271, 79.8612]

  const assignedVehicleIds = new Set(
    vehicles.filter((v) => getAssignedZoneIds(v).includes(zone._id)).map((v) => v._id)
  )

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: zone.color || '#00e5ff', flexShrink: 0 }} />
        <div style={{ flex: 1, fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{zone.name}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Edit2 size={12} /> Edit</button>
        <button className="btn-icon" onClick={onClose}><X size={13} /></button>
      </div>

      {/* Map preview */}
      <div style={{ height: 260, position: 'relative' }}>
        <MapContainer center={center} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
          <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} />
          {outerRing.length >= 3 && (
            <Polygon positions={outerRing.map(([lng, lat]) => [lat, lng])}
              pathOptions={{ color: zone.color || '#00e5ff', fillColor: zone.color || '#00e5ff', fillOpacity: 0.1, weight: 2, dashArray: '6 4' }} />
          )}
          {holes.map((hole, i) => (
            <Polygon key={i} positions={hole.map(([lng, lat]) => [lat, lng])}
              pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.15, weight: 2, dashArray: '4 3' }} />
          ))}
        </MapContainer>
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 999, background: 'rgba(10,12,16,0.85)', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          {outerRing.length} pts · {holes.length} exclusion{holes.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Vehicle assignment */}
      <div style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Assign to vehicles
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vehicles.map(v => {
            const isAssigned = assignedVehicleIds.has(v._id)
            const meta = vehicleTypeMeta(v.vehicleType)
            return (
              <div key={v._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: isAssigned ? `${zone.color || '#00e5ff'}10` : 'var(--surface2)', border: `1px solid ${isAssigned ? zone.color || '#00e5ff' : 'var(--border)'}`, transition: 'all 0.15s' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{v.plateNumber || v.deviceId}</div>
                </div>
                <button
                  className={`btn btn-sm ${isAssigned ? 'btn-danger' : 'btn-primary'}`}
                  style={{ flexShrink: 0, justifyContent: 'center', minWidth: 72 }}
                  onClick={() => onAssign(zone._id, v._id, !isAssigned)}>
                  {isAssigned ? 'Remove' : 'Assign'}
                </button>
              </div>
            )
          })}
          {vehicles.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: 20 }}>No vehicles registered</div>}
        </div>
      </div>

      {editing && (
        <ZoneEditorModal zone={zone} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdated() }} tileUrl={tileUrl} isDark={isDark} />
      )}
    </div>
  )
}

// ── Zone editor modal (create + edit) ─────────────────────────────────────────
function ZoneEditorModal({ zone, onClose, onSaved, tileUrl, isDark }) {
  const isEdit = !!zone
  const [name, setName]               = useState(zone?.name || '')
  const [description, setDescription] = useState(zone?.description || '')
  const [color, setColor]             = useState(zone?.color || '#00e5ff')
  const [drawMode, setDrawMode]       = useState('outer')      // 'outer' | 'exclusion' | null
  const [outerPoints, setOuterPoints] = useState(
    zone?.polygon?.coordinates?.[0]?.map(([lng, lat]) => [lat, lng]) || []
  )
  const [exclusions, setExclusions]   = useState(
    zone?.polygon?.coordinates?.slice(1).map(r => r.map(([lng, lat]) => [lat, lng])) || []
  )
  const [pendingExclusion, setPendingExclusion] = useState([])
  const [saving, setSaving]           = useState(false)

  const handlePoint = (pt) => {
    if (drawMode === 'outer')      setOuterPoints(p => [...p, pt])
    else if (drawMode === 'exclusion') setPendingExclusion(p => [...p, pt])
  }

  const finishExclusion = () => {
    if (pendingExclusion.length < 3) { toast.error('Draw at least 3 points for an exclusion zone'); return }
    setExclusions(p => [...p, pendingExclusion])
    setPendingExclusion([])
    setDrawMode(null)
  }

  const toRing = pts => { const r = pts.map(([la, ln]) => [ln, la]); if (r.length) r.push(r[0]); return r }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Zone name is required'); return }
    if (outerPoints.length < 3) { toast.error('Draw at least 3 points for the main zone boundary'); return }
    setSaving(true)
    try {
      const outerRing     = toRing(outerPoints)
      const exclusionRings = exclusions.map(toRing).filter(r => r.length >= 4)
      const payload = {
        name: name.trim(),
        description: description.trim(),
        color,
        polygon: { type: 'Polygon', coordinates: [outerRing, ...exclusionRings] },
        ringMeta: [
          { name: 'Main Zone', color, type: 'outer' },
          ...exclusionRings.map((_, i) => ({ name: `Exclusion ${i + 1}`, color: '#ff3d5a', type: 'exclusion' })),
        ],
      }
      if (isEdit) {
        await zoneAPI.update(zone._id, payload)
        toast.success('Zone updated')
      } else {
        await zoneAPI.create(payload)
        toast.success('Zone created')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const defaultCenter = outerPoints.length
    ? [outerPoints.reduce((s, p) => s + p[0], 0) / outerPoints.length, outerPoints.reduce((s, p) => s + p[1], 0) / outerPoints.length]
    : [6.9271, 79.8612]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>{isEdit ? 'Edit Zone' : 'Create New Zone'}</div>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, flex: 1, overflow: 'hidden' }}>
          {/* Left controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Zone Name *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Colombo CBD" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Description</label>
              <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes…" />
            </div>

            {/* Color picker */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Zone Color</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ZONE_COLORS.map(c => (
                  <div key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: `2px solid ${color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', boxShadow: color === c ? `0 0 0 2px ${c}` : 'none', transition: 'all 0.15s' }} />
                ))}
              </div>
            </div>

            {/* Draw controls */}
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Drawing Tools</div>

              {/* Outer zone */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>Main boundary</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>{outerPoints.length} point{outerPoints.length !== 1 ? 's' : ''} {outerPoints.length >= 3 ? '✓' : ''}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {drawMode !== 'outer' ? (
                    <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDrawMode('outer')}>
                      <MapPin size={11} /> {outerPoints.length > 0 ? 'Continue' : 'Start Drawing'}
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDrawMode(null)}>
                      <X size={11} /> Stop Drawing
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setOuterPoints(p => p.slice(0, -1))} disabled={!outerPoints.length}>Undo</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setOuterPoints([])} disabled={!outerPoints.length}>Clear</button>
                </div>
              </div>

              {/* Exclusion zones */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>Exclusion zones</div>
                {exclusions.map((ex, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                    <span>⛔ Exclusion {i + 1} ({ex.length} pts)</span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setExclusions(p => p.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
                {drawMode === 'exclusion' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{pendingExclusion.length} pts drawn {pendingExclusion.length >= 3 ? '✓' : '(need 3+)'}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={finishExclusion} disabled={pendingExclusion.length < 3}><Save size={11} /> Finish</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPendingExclusion(p => p.slice(0, -1))} disabled={!pendingExclusion.length}>Undo</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setDrawMode(null); setPendingExclusion([]) }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => { setDrawMode('exclusion'); setPendingExclusion([]) }}>
                    <Plus size={11} /> Add Exclusion Zone
                  </button>
                )}
              </div>
            </div>

            {drawMode && (
              <div style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                {drawMode === 'outer' ? '✏️ Click map to add boundary points' : '⛔ Click map to add exclusion points'}
              </div>
            )}

            <div className="modal-footer" style={{ padding: 0, marginTop: 'auto' }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <div className="spinner" /> : <><Save size={13} /> {isEdit ? 'Save Changes' : 'Create Zone'}</>}
              </button>
            </div>
          </div>

          {/* Map */}
          <div style={{ borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
            {drawMode && (
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 999, background: drawMode === 'outer' ? 'rgba(0,229,255,0.15)' : 'rgba(255,61,90,0.15)', border: `1px solid ${drawMode === 'outer' ? 'var(--accent)' : 'var(--red)'}`, borderRadius: 20, padding: '4px 14px', fontSize: 10, color: drawMode === 'outer' ? 'var(--accent)' : 'var(--red)', fontFamily: 'var(--mono)', pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {drawMode === 'outer' ? 'Boundary Drawing' : 'Exclusion Drawing'}
              </div>
            )}
            <MapContainer center={defaultCenter} zoom={13} style={{ width: '100%', height: '100%', minHeight: 460 }}>
              <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} />
              <DrawHandler active={!!drawMode} onPoint={handlePoint} />

              {/* Main boundary */}
              {outerPoints.length >= 3 && (
                <Polygon positions={outerPoints}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.1, weight: 2, dashArray: '6 3' }} />
              )}
              {outerPoints.filter(p => isFinite(p[0]) && isFinite(p[1])).map((pt, i) => (
                <Marker key={`o${i}`} position={pt} icon={dotIcon(color)} />
              ))}

              {/* Existing exclusions */}
              {exclusions.map((ex, i) => (
                <Polygon key={`ex${i}`} positions={ex}
                  pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.15, weight: 2, dashArray: '4 3' }} />
              ))}

              {/* Pending exclusion */}
              {pendingExclusion.length >= 3 && (
                <Polygon positions={pendingExclusion}
                  pathOptions={{ color: '#ff3d5a', fillColor: '#ff3d5a', fillOpacity: 0.12, weight: 2, dashArray: '4 3' }} />
              )}
              {pendingExclusion.filter(p => isFinite(p[0]) && isFinite(p[1])).map((pt, i) => (
                <Marker key={`pe${i}`} position={pt} icon={dotIcon('#ff3d5a')} />
              ))}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

