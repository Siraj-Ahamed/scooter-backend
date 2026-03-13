import { useEffect, useState } from 'react'
import { alertAPI } from '../api'
import { useSocket } from '../context/SocketContext'
import { Trash2, CheckCheck, RefreshCw, Bell } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

const SEVERITY_CONFIG = {
  critical: { color: 'var(--red)',    bg: 'rgba(255,61,90,0.08)',  border: 'rgba(255,61,90,0.2)',  icon: '🚨' },
  warning:  { color: 'var(--yellow)', bg: 'rgba(255,215,0,0.06)',  border: 'rgba(255,215,0,0.2)',  icon: '⚠️' },
  info:     { color: 'var(--accent)', bg: 'rgba(0,229,255,0.05)',  border: 'rgba(0,229,255,0.15)', icon: 'ℹ️' },
}

const TYPE_LABELS = {
  geofence_exit:   'Geofence Exit',
  geofence_enter:  'Geofence Enter',
  engine_locked:   'Engine Locked',
  low_battery:     'Low Battery',
  offline:         'Device Offline',
  sos:             'SOS Alert',
  speeding:        'Speeding',
}

export default function AlertsPage() {
  const { setUnreadCount }          = useSocket()
  const [alerts, setAlerts]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('all') // all | unread | critical | warning | info
  const [deleting, setDeleting]     = useState(null)

  const load = () => {
    setLoading(true)
    const params = {}
    if (filter === 'unread')   params.unreadOnly = true
    if (['critical','warning','info'].includes(filter)) params.severity = filter
    alertAPI.list(params)
      .then(r => {
        setAlerts(r.data.data)
        // Update unread count from meta
        if (r.data.meta?.unreadCount !== undefined) setUnreadCount(r.data.meta.unreadCount)
      })
      .catch(() => toast.error('Failed to load alerts'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  const markRead = async (id) => {
    try {
      await alertAPI.readOne(id)
      setAlerts(p => p.map(a => a._id === id ? { ...a, isRead: true } : a))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch { toast.error('Failed') }
  }

  const markAllRead = async () => {
    try {
      await alertAPI.readAll()
      setAlerts(p => p.map(a => ({ ...a, isRead: true })))
      setUnreadCount(0)
      toast.success('All marked as read')
    } catch { toast.error('Failed') }
  }

  const deleteAlert = async (id) => {
    setDeleting(id)
    try {
      await alertAPI.delete(id)
      setAlerts(p => p.filter(a => a._id !== id))
      toast.success('Alert deleted')
    } catch { toast.error('Failed') }
    finally { setDeleting(null) }
  }

  const unreadCount = alerts.filter(a => !a.isRead).length

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Alerts</div>
            <div className="page-sub">{unreadCount} unread · {alerts.length} shown</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
            {unreadCount > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={markAllRead}><CheckCheck size={13} /> Mark all read</button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {['all', 'unread', 'critical', 'warning', 'info'].map(f => (
            <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f}</button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        ) : alerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
            <Bell size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
            <div>No alerts found</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map(a => {
              const cfg = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.info
              return (
                <div key={a._id} style={{
                  background: a.isRead ? 'var(--surface)' : cfg.bg,
                  border: `1px solid ${a.isRead ? 'var(--border)' : cfg.border}`,
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  opacity: a.isRead ? 0.7 : 1, transition: 'all 0.2s',
                }}>
                  {/* Icon */}
                  <div style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{cfg.icon}</div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: a.isRead ? 'var(--text2)' : 'var(--text)', fontSize: 14 }}>{a.title}</span>
                      <span style={{ fontSize: 10, color: cfg.color, fontFamily: 'var(--mono)', background: `${cfg.color}18`, padding: '1px 6px', borderRadius: 10, textTransform: 'uppercase' }}>
                        {TYPE_LABELS[a.type] || a.type}
                      </span>
                      {!a.isRead && <div className="dot dot-red" />}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>{a.message}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text3)' }}>
                      {a.scooter && <span>🛵 {a.scooter.name}</span>}
                      <span>🕐 {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {!a.isRead && (
                      <button className="btn-icon" title="Mark as read" onClick={() => markRead(a._id)}>
                        <CheckCheck size={13} />
                      </button>
                    )}
                    <button className="btn-icon" title="Delete" style={{ color: 'var(--red)', borderColor: 'rgba(255,61,90,0.3)' }}
                      onClick={() => deleteAlert(a._id)} disabled={deleting === a._id}>
                      {deleting === a._id ? <div className="spinner" style={{ width: 13, height: 13 }} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
