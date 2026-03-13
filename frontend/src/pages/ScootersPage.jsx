import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Eye, Zap, Lock, Unlock, Search, RefreshCw } from 'lucide-react'
import { scooterAPI } from '../api'
import { useSocket } from '../context/SocketContext'
import toast from 'react-hot-toast'

const STATUS_COLOR = {
  available: 'var(--green)', rented: 'var(--accent)',
  locked: 'var(--red)', offline: 'var(--text3)', maintenance: 'var(--yellow)'
}

export default function ScootersPage() {
  const navigate = useNavigate()
  const { liveLocations, liveStatuses } = useSocket()
  const [scooters, setScooters] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = () => {
    setLoading(true)
    scooterAPI.list({ limit: 100 })
      .then(r => setScooters(r.data.data))
      .catch(() => toast.error('Failed to load fleet'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCommand = async (id, action) => {
    try {
      await scooterAPI.command(id, { action })
      toast.success(`Command '${action}' sent`)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Command failed')
    }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Delete this scooter?')) return
    setDeleting(id)
    try {
      await scooterAPI.delete(id)
      toast.success('Scooter removed')
      setScooters(p => p.filter(s => s._id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed')
    } finally { setDeleting(null) }
  }

  // Merge live socket status events on top of the DB snapshot.
  // Only override a field when the socket has an EXPLICIT value (not undefined).
  // This means offline devices loaded from DB stay offline until a 'connected'
  // event actually arrives — we never flip isOnline just from a location ping.
  const mergedScooters = scooters.map(s => {
    const st = liveStatuses[s._id]
    if (!st) return s
    return {
      ...s,
      // undefined means no status event received yet → keep DB value
      isOnline:   st.isOnline   !== undefined ? st.isOnline   : s.isOnline,
      status:     st.status     !== undefined ? st.status     : s.status,
      isEngineOn: st.isEngineOn !== undefined ? st.isEngineOn : s.isEngineOn,
    }
  })

  const filtered = mergedScooters.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.deviceId.toLowerCase().includes(search.toLowerCase()) ||
    (s.plateNumber || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="page-title">Fleet Management</div>
            <div className="page-sub">
              {mergedScooters.length} vehicles registered &middot; {mergedScooters.filter(s => s.isOnline).length} online
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={13} /> Add Vehicle</button>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: 16, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input className="input" placeholder="Search by name, device ID, plate..."
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
            {filtered.map(s => (
              <ScooterCard
                key={s._id}
                scooter={s}
                live={liveLocations[s._id]}
                onView={() => navigate(`/scooters/${s._id}`)}
                onCommand={(action) => handleCommand(s._id, action)}
                onDelete={(e) => handleDelete(e, s._id)}
                deleting={deleting === s._id}
              />
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
                {search ? 'No vehicles match your search' : 'No vehicles registered yet'}
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddScooterModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />}
    </>
  )
}

function ScooterCard({ scooter: s, live, onView, onCommand, onDelete, deleting }) {
  // s already has live status pre-merged from parent (liveStatuses)
  const battery  = live?.battery ?? s.lastTelemetry?.battery ?? 0
  const speed    = live?.speed   ?? s.lastTelemetry?.speed   ?? 0
  const batColor = battery > 50 ? 'var(--green)' : battery > 20 ? 'var(--yellow)' : 'var(--red)'
  const color    = STATUS_COLOR[s.status] || 'var(--text3)'

  // A scooter is truly online only if BOTH isOnline===true AND status!=='offline'
  // This handles the case where the backend never received a disconnect event
  // and isOnline is stale-true in the DB while status correctly shows 'offline'
  const isActuallyOnline = s.isOnline === true && s.status !== 'offline'

  return (
    <div
      className="card"
      style={{ cursor: 'pointer', borderColor: isActuallyOnline ? 'var(--border2)' : 'var(--border)' }}
      onClick={onView}
    >
      {/* ── Header ── badge uses flexShrink:0 so long device IDs never push it out */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
        {/* Icon + name block — takes remaining space, truncates if needed */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, flexShrink: 0, borderRadius: 10,
            background: `${color}18`, border: `1px solid ${color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
          }}>
            🛵
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.deviceId}
            </div>
          </div>
        </div>

        {/* Badge — never shrinks, always visible */}
        <span className={`badge badge-${s.status}`} style={{ flexShrink: 0, marginTop: 2 }}>
          {s.status}
        </span>
      </div>

      {/* ── Telemetry tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <TelTile label="Battery" value={`${battery}%`}      color={batColor} />
        <TelTile label="Speed"   value={`${speed} km/h`}    color="var(--text2)" />
        <TelTile label="Engine"  value={s.isEngineOn ? 'ON' : 'OFF'} color={s.isEngineOn ? 'var(--green)' : 'var(--text3)'} />
      </div>

      {/* ── Battery bar ── */}
      <div className="battery-bar" style={{ marginBottom: 14 }}>
        <div className="battery-fill" style={{ width: `${battery}%`, background: batColor }} />
      </div>

      {/* ── Plate / model ── */}
      {(s.plateNumber || s.model) && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
          {s.plateNumber && <span style={{ marginRight: 10 }}>🔖 {s.plateNumber}</span>}
          {s.model       && <span>📦 {s.model}</span>}
        </div>
      )}

      {/* ── Actions ── */}
      <div
        style={{ display: 'flex', gap: 6, paddingTop: 12, borderTop: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={onView}>
          <Eye size={12} /> Details
        </button>
        <button className="btn-icon" title="Lock engine"   onClick={e => { e.stopPropagation(); onCommand('lock_engine')   }}><Lock   size={13} /></button>
        <button className="btn-icon" title="Unlock engine" onClick={e => { e.stopPropagation(); onCommand('unlock_engine') }}><Unlock size={13} /></button>
        <button className="btn-icon" title="Honk"          onClick={e => { e.stopPropagation(); onCommand('honk')          }}><Zap    size={13} /></button>
        <button
          className="btn-icon"
          title="Delete"
          style={{ color: 'var(--red)', borderColor: 'rgba(255,61,90,0.3)' }}
          onClick={onDelete}
          disabled={deleting}
        >
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

function AddScooterModal({ onClose, onAdded }) {
  const [form, setForm]       = useState({ name: '', deviceId: '', plateNumber: '', model: '', color: '', year: '' })
  const [loading, setLoading] = useState(false)
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await scooterAPI.create({ ...form, year: form.year ? parseInt(form.year) : undefined })
      toast.success('Vehicle registered!')
      onAdded()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to register vehicle')
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Register New Vehicle</div>
        <form onSubmit={submit}>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Vehicle Name *</label>
              <input className="input" placeholder="e.g. Blue Flash" value={form.name} onChange={set('name')} required />
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
              <input className="input" placeholder="Xiaomi Pro 2" value={form.model} onChange={set('model')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Color</label>
              <input className="input" placeholder="Blue" value={form.color} onChange={set('color')} />
            </div>
            <div className="form-group">
              <label className="input-label">Year</label>
              <input className="input" type="number" placeholder="2023" value={form.year} onChange={set('year')} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <div className="spinner" /> : 'Register Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
