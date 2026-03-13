import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, Navigation, Bell, Activity } from 'lucide-react'
import { vehicleAPI, tripAPI, alertAPI } from '../api'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const STATUS_COLOR = { available: 'var(--green)', rented: 'var(--accent)', locked: 'var(--red)', offline: 'var(--text3)', maintenance: 'var(--yellow)' }

export default function DashboardPage() {
  const { user } = useAuth()
  const { liveLocations, liveStatuses, isVehicleOnline } = useSocket()
  const navigate = useNavigate()
  const [scooters, setScooters] = useState([])
  const [trips, setTrips] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      vehicleAPI.list({ limit: 50 }),
      tripAPI.list({ limit: 10 }),
      alertAPI.list({ limit: 5 }),
    ]).then(([s, t, a]) => {
      setScooters(s.data.data)
      setTrips(t.data.data)
      setAlerts(a.data.data)
    }).finally(() => setLoading(false))
  }, [])

  const mergedScooters = scooters.map(s => {
    const st = liveStatuses[s._id]
    return {
      ...s,
      isOnline:   isVehicleOnline(s._id, s.isOnline, s.status),
      status:     st?.status     !== undefined ? st.status     : s.status,
      isEngineOn: st?.isEngineOn !== undefined ? st.isEngineOn : s.isEngineOn,
    }
  })

  const statusCounts = mergedScooters.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1
    return acc
  }, {})

  const chartData = Object.entries(statusCounts).map(([k, v]) => ({ name: k, count: v }))
  const onlineCount = mergedScooters.filter(s => s.isOnline).length
  const activeTrips = trips.filter(t => t.status === 'active').length
  const unreadAlerts = alerts.filter(a => !a.isRead).length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  return (
    <>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">Welcome back, {user?.name} - here's your fleet overview</div>
      </div>
      <div className="page-body">
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatTile icon={<Bike size={18} />} value={mergedScooters.length} label="Total Vehicles" color="var(--accent)" />
          <StatTile icon={<Activity size={18} />} value={onlineCount} label="Online Now" color="var(--green)" />
          <StatTile icon={<Navigation size={18} />} value={activeTrips} label="Active Trips" color="var(--yellow)" />
          <StatTile icon={<Bell size={18} />} value={unreadAlerts} label="Unread Alerts" color="var(--red)" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Fleet Status</span></div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barSize={32}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, fontFamily: 'var(--sans)', fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => <Cell key={i} fill={STATUS_COLOR[entry.name] || 'var(--text3)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Alerts</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/alerts')}>View all</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.slice(0, 5).map(a => (
                <div key={a._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{a.severity === 'critical' ? '\u{1F6A8}' : a.severity === 'warning' ? '\u{26A0}\u{FE0F}' : '\u{2139}\u{FE0F}'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: a.isRead ? 'var(--text2)' : 'var(--text)', fontWeight: a.isRead ? 400 : 500 }} className="truncate">{a.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.vehicle?.name || a.scooter?.name} · {new Date(a.createdAt).toLocaleTimeString()}</div>
                  </div>
                  {!a.isRead && <div className="dot dot-red" style={{ marginTop: 5 }} />}
                </div>
              ))}
              {alerts.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: 20 }}>No recent alerts</div>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Fleet Overview</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/vehicles')}>Manage fleet {'->'}</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th><th>Device ID</th><th>Status</th>
                  <th>Battery</th><th>Speed</th><th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {mergedScooters.map(s => {
                  const live = liveLocations[s._id]
                  const battery = live?.battery ?? s.lastTelemetry?.battery ?? 0
                  const speed = live?.speed ?? s.lastTelemetry?.speed ?? 0
                  const batColor = battery > 50 ? 'var(--green)' : battery > 20 ? 'var(--yellow)' : 'var(--red)'
                  return (
                    <tr key={s._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/vehicles/${s._id}`)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className={`dot ${s.isOnline ? 'dot-green' : 'dot-gray'}`} />
                          <div>
                            <div style={{ color: 'var(--text)', fontWeight: 500 }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.plateNumber || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="mono" style={{ fontSize: 11 }}>{s.deviceId}</span></td>
                      <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 50 }}>
                            <div className="battery-bar"><div className="battery-fill" style={{ width: `${battery}%`, background: batColor }} /></div>
                          </div>
                          <span style={{ fontSize: 11, color: batColor, fontFamily: 'var(--mono)' }}>{battery}%</span>
                        </div>
                      </td>
                      <td><span className="mono" style={{ fontSize: 11 }}>{speed} km/h</span></td>
                      <td style={{ fontSize: 11 }}>{s.lastTelemetry?.timestamp ? new Date(s.lastTelemetry.timestamp).toLocaleTimeString() : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function StatTile({ icon, value, label, color }) {
  return (
    <div className="stat-tile">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ color, opacity: 0.8 }}>{icon}</div>
      </div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

