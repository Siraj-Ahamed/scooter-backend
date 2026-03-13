import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Eye, Zap, Lock, Unlock, Search, RefreshCw } from 'lucide-react'
import { vehicleAPI } from '../api'
import { useSocket } from '../context/SocketContext'
import { VEHICLE_TYPES, vehicleEmoji, vehicleTypeMeta } from '../utils/vehicleTypes'
import toast from 'react-hot-toast'

const STATUS_COLOR = {
  available: 'var(--green)', rented: 'var(--accent)',
  locked: 'var(--red)', offline: 'var(--text3)', maintenance: 'var(--yellow)',
}

export default function VehiclesPage() {
  const navigate = useNavigate()
  const { liveLocations, liveStatuses, isVehicleOnline } = useSocket()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showAdd, setShowAdd]   = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = () => {
    setLoading(true)
    vehicleAPI.list({ limit: 100 })
      .then(r => setVehicles(r.data.data))
      .catch(() => toast.error('Failed to load fleet'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCommand = async (id, action) => {
    try {
      await vehicleAPI.command(id, { action })
      toast.success(`Command '${action}' sent`)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Command failed')
    }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Delete this vehicle?')) return
    setDeleting(id)
    try {
      await vehicleAPI.delete(id)
      toast.success('Vehicle removed')
      setVehicles(p => p.filter(v => v._id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed')
    } finally { setDeleting(null) }
  }

  const mergedVehicles = vehicles.map(v => {
    const st = liveStatuses[v._id]
    return {
      ...v,
      isOnline:   isVehicleOnline(v._id, v.isOnline, v.status),
      status:     st?.status     !== undefined ? st.status     : v.status,
      isEngineOn: st?.isEngineOn !== undefined ? st.isEngineOn : v.isEngineOn,
    }
  })

  const typeCounts = mergedVehicles.reduce((acc, v) => {
    acc[v.vehicleType] = (acc[v.vehicleType] || 0) + 1
    return acc
  }, {})

  const filtered = mergedVehicles.filter(v => {
    const matchType = typeFilter === 'all' || v.vehicleType === typeFilter
    const q = search.toLowerCase()
    const matchSearch = !q ||
      v.name.toLowerCase().includes(q) ||
      v.deviceId.toLowerCase().includes(q) ||
      (v.plateNumber || '').toLowerCase().includes(q) ||
      (v.vehicleType || '').toLowerCase().includes(q)
    return matchType && matchSearch
  })

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="page-title">Fleet Management</div>
            <div className="page-sub">
              {mergedVehicles.length} vehicles &middot; {mergedVehicles.filter(v => v.isOnline && v.status !== 'offline').length} online
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={13} /> Add Vehicle</button>
          </div>
        </div>

        {/* Vehicle-type filter pills */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${typeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTypeFilter('all')}>
            All ({mergedVehicles.length})
          </button>
          {VEHICLE_TYPES.filter(t => typeCounts[t.value]).map(t => (
            <button
              key={t.value}
              className={`btn btn-sm ${typeFilter === t.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTypeFilter(t.value)}>
              {t.emoji} {t.label} ({typeCounts[t.value]})
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', marginTop: 12, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input className="input" placeholder="Search by name, ID, plate, type…"
            style={{ paddingLeft: 32 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {filtered.map(v => (
              <VehicleCard
                key={v._id}
                vehicle={v}
                live={liveLocations[v._id]}
                onView={() => navigate(`/vehicles/${v._id}`)}
                onCommand={(action) => handleCommand(v._id, action)}
                onDelete={(e) => handleDelete(e, v._id)}
                deleting={deleting === v._id}
              />
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
                {search || typeFilter !== 'all' ? 'No vehicles match your search' : 'No vehicles registered yet'}
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddVehicleModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />}
    </>
  )
}

function VehicleCard({ vehicle: v, live, onView, onCommand, onDelete, deleting }) {
  const battery  = live?.battery ?? v.lastTelemetry?.battery ?? 0
  const speed    = live?.speed   ?? v.lastTelemetry?.speed   ?? 0
  const batColor = battery > 50 ? 'var(--green)' : battery > 20 ? 'var(--yellow)' : 'var(--red)'
  const statusColor = STATUS_COLOR[v.status] || 'var(--text3)'
  const isActuallyOnline = v.isOnline === true && v.status !== 'offline'
  const meta = vehicleTypeMeta(v.vehicleType)

  return (
    <div
      className="card"
      style={{ cursor: 'pointer', borderColor: isActuallyOnline ? 'var(--border2)' : 'var(--border)' }}
      onClick={onView}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, flexShrink: 0, borderRadius: 10,
            background: `${meta.color}18`, border: `1px solid ${meta.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>
            {meta.emoji}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.deviceId}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span className={`badge badge-${v.status}`}>{v.status}</span>
          <span style={{ fontSize: 9, color: meta.color, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{meta.label}</span>
        </div>
      </div>

      {/* Telemetry tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <TelTile label="Battery" value={`${battery}%`}              color={batColor} />
        <TelTile label="Speed"   value={`${speed} km/h`}            color="var(--text2)" />
        <TelTile label="Engine"  value={v.isEngineOn ? 'ON' : 'OFF'} color={v.isEngineOn ? 'var(--green)' : 'var(--text3)'} />
      </div>

      {/* Battery bar */}
      <div className="battery-bar" style={{ marginBottom: 14 }}>
        <div className="battery-fill" style={{ width: `${battery}%`, background: batColor }} />
      </div>

      {/* Meta row */}
      {(v.plateNumber || v.model) && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
          {v.plateNumber && <span style={{ marginRight: 10 }}>🔖 {v.plateNumber}</span>}
          {v.model       && <span>📦 {v.model}</span>}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, paddingTop: 12, borderTop: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={onView}>
          <Eye size={12} /> Details
        </button>
        <button className="btn-icon" title="Lock engine"   onClick={e => { e.stopPropagation(); onCommand('lock_engine')   }}><Lock   size={13} /></button>
        <button className="btn-icon" title="Unlock engine" onClick={e => { e.stopPropagation(); onCommand('unlock_engine') }}><Unlock size={13} /></button>
        <button className="btn-icon" title="Honk"          onClick={e => { e.stopPropagation(); onCommand('honk')          }}><Zap    size={13} /></button>
        <button className="btn-icon" title="Delete"
          style={{ color: 'var(--red)', borderColor: 'rgba(255,61,90,0.3)' }}
          onClick={onDelete} disabled={deleting}>
          {deleting ? <div className="spinner" style={{ width: 13, height: 13 }} /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  )
}

function TelTile({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '6px 8px', overflow: 'hidden' }}>
      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

function AddVehicleModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', deviceId: '', vehicleType: 'scooter', plateNumber: '', model: '', color: '', year: '' })
  const [loading, setLoading] = useState(false)
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await vehicleAPI.create({ ...form, year: form.year ? parseInt(form.year) : undefined })
      toast.success('Vehicle registered!')
      onAdded()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to register vehicle')
    } finally { setLoading(false) }
  }

  const selectedMeta = vehicleTypeMeta(form.vehicleType)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Register New Vehicle</div>

        {/* Vehicle type selector */}
        <div className="form-group">
          <label className="input-label">Vehicle Type *</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {VEHICLE_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm(p => ({ ...p, vehicleType: t.value }))}
                style={{
                  padding: '8px 4px',
                  borderRadius: 8,
                  border: `1px solid ${form.vehicleType === t.value ? t.color : 'var(--border)'}`,
                  background: form.vehicleType === t.value ? `${t.color}18` : 'var(--surface2)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 20 }}>{t.emoji}</span>
                <span style={{ fontSize: 9, color: form.vehicleType === t.value ? t.color : 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Vehicle Name *</label>
              <input className="input" placeholder={`e.g. ${selectedMeta.emoji} Blue ${selectedMeta.label}`} value={form.name} onChange={set('name')} required />
            </div>
            <div className="form-group">
              <label className="input-label">Device ID (IMEI) *</label>
              <input className="input" placeholder="e.g. IMEI-001-ABC" value={form.deviceId} onChange={set('deviceId')} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Plate Number</label>
              <input className="input" placeholder="WP ABC-1234" value={form.plateNumber} onChange={set('plateNumber')} />
            </div>
            <div className="form-group">
              <label className="input-label">Model</label>
              <input className="input" placeholder="e.g. Toyota HiAce" value={form.model} onChange={set('model')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Color</label>
              <input className="input" placeholder="White" value={form.color} onChange={set('color')} />
            </div>
            <div className="form-group">
              <label className="input-label">Year</label>
              <input className="input" type="number" placeholder="2023" value={form.year} onChange={set('year')} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <div className="spinner" /> : `Register ${selectedMeta.emoji} ${selectedMeta.label}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
