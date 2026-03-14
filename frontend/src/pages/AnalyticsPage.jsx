import { useEffect, useState, useRef, useCallback } from 'react'
import { RefreshCw, TrendingUp, Truck, Navigation, Bell, Clock, BarChart2, Users } from 'lucide-react'
import { analyticsAPI } from '../api'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

// ─── colour palette ──────────────────────────────────────────────────────────
const ALERT_COLORS = {
  geofence_exit:   '#ff6b35',
  geofence_enter:  '#00e5ff',
  low_battery:     '#ffd700',
  offline:         '#6b7280',
  speeding:        '#ff3d5a',
  sos:             '#ff3d5a',
  engine_locked:   '#a78bfa',
}
const STATUS_COLORS = {
  available:   '#00ff88',
  rented:      '#00e5ff',
  locked:      '#ff3d5a',
  offline:     '#4a5568',
  maintenance: '#ffd700',
}
const RANGE_OPTIONS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]
const ACC = 'var(--accent)'

// ─── tiny helpers ────────────────────────────────────────────────────────────
const fmt = n => n == null ? '—' : Number(n).toLocaleString()
const fmtKm = n => n == null ? '—' : `${Number(n).toFixed(1)} km`
const fmtMin = m => {
  if (!m) return '—'
  const h = Math.floor(m / 60), min = m % 60
  return h ? `${h}h ${min}m` : `${min}m`
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─── section header ──────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
      {children}
    </div>
  )
}

// ─── SVG line chart — trips over time ────────────────────────────────────────
function LineChart({ data, color = '#00e5ff' }) {
  const W = 800, H = 180, PAD = { t: 16, r: 16, b: 32, l: 44 }
  if (!data?.length) return <EmptyChart h={H} />

  const counts = data.map(d => d.count)
  const maxV   = Math.max(...counts, 1)
  const minV   = 0
  const iW     = W - PAD.l - PAD.r
  const iH     = H - PAD.t - PAD.b

  const xOf = i => PAD.l + (i / (data.length - 1 || 1)) * iW
  const yOf = v => PAD.t + iH - ((v - minV) / (maxV - minV)) * iH

  const pts = data.map((d, i) => [xOf(i), yOf(d.count)])

  // smooth bezier path
  const pathD = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`
    const prev = pts[i - 1]
    const cx   = (prev[0] + p[0]) / 2
    return `${acc} C${cx},${prev[1]} ${cx},${p[1]} ${p[0]},${p[1]}`
  }, '')

  const fillD = `${pathD} L${pts[pts.length-1][0]},${PAD.t+iH} L${pts[0][0]},${PAD.t+iH} Z`

  // x-axis labels — show every Nth
  const step = Math.ceil(data.length / 8)
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1)
    .map((d, _, arr) => {
      const i = data.indexOf(d)
      const parts = d.date.split('-')
      return { x: xOf(i), label: `${parts[1]}/${parts[2]}` }
    })

  // y-axis gridlines
  const ticks = [0, Math.round(maxV / 2), maxV]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id="lg-line" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* grid */}
      {ticks.map(v => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--border)" strokeWidth="1" />
          <text x={PAD.l - 6} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="var(--text3)" fontFamily="monospace">{v}</text>
        </g>
      ))}
      {/* fill */}
      <path d={fillD} fill="url(#lg-line)" />
      {/* line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {/* x labels */}
      {xLabels.map(({ x, label }) => (
        <text key={label} x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--text3)" fontFamily="monospace">{label}</text>
      ))}
      {/* dots on data points */}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill={color} opacity="0.7" />
      ))}
    </svg>
  )
}

// ─── SVG bar chart — distance per vehicle ────────────────────────────────────
function BarChart({ data, color = '#00e5ff' }) {
  const W = 800, H = 220, PAD = { t: 16, r: 16, b: 48, l: 100 }
  if (!data?.length) return <EmptyChart h={H} />

  const maxV   = Math.max(...data.map(d => d.totalKm), 1)
  const iW     = W - PAD.l - PAD.r
  const iH     = H - PAD.t - PAD.b
  const barH   = Math.max(6, Math.floor(iH / data.length) - 4)
  const gap    = (iH - barH * data.length) / Math.max(data.length - 1, 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const x = PAD.l + f * iW
        return (
          <g key={f}>
            <line x1={x} x2={x} y1={PAD.t} y2={PAD.t + iH} stroke="var(--border)" strokeWidth="1" />
            <text x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--text3)" fontFamily="monospace">
              {+(maxV * f).toFixed(1)}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const y   = PAD.t + i * (barH + gap)
        const w   = (d.totalKm / maxV) * iW
        const vt  = d.vehicleType || 'scooter'
        const barColor = color
        return (
          <g key={d.vehicleId || i}>
            {/* label */}
            <text x={PAD.l - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="10" fill="var(--text2)"
              style={{ fontFamily: 'var(--mono)' }}>
              {(d.name || 'Vehicle').slice(0, 12)}
            </text>
            {/* bar bg */}
            <rect x={PAD.l} y={y} width={iW} height={barH} rx="3" fill="var(--surface2)" />
            {/* bar fill */}
            <rect x={PAD.l} y={y} width={Math.max(w, 2)} height={barH} rx="3" fill={barColor} opacity="0.85" />
            {/* value label */}
            {w > 30 && (
              <text x={PAD.l + w - 5} y={y + barH / 2 + 4} textAnchor="end" fontSize="9" fill="#000" fontFamily="monospace" fontWeight="700">
                {d.totalKm}km
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── SVG donut chart — alerts by type ────────────────────────────────────────
function DonutChart({ data }) {
  const SIZE = 180, CX = 90, CY = 90, R = 68, INNER = 42
  if (!data?.length) return <EmptyChart h={SIZE} />

  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return <EmptyChart h={SIZE} />

  let angle = -Math.PI / 2
  const slices = data.map(d => {
    const sweep = (d.count / total) * 2 * Math.PI
    const start = angle
    angle += sweep
    return { ...d, start, sweep, end: angle }
  })

  const arc = (cx, cy, r, startA, endA) => {
    const x1 = cx + r * Math.cos(startA), y1 = cy + r * Math.sin(startA)
    const x2 = cx + r * Math.cos(endA),   y2 = cy + r * Math.sin(endA)
    const large = endA - startA > Math.PI ? 1 : 0
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: SIZE, height: SIZE, flexShrink: 0 }}>
        {slices.map((s, i) => {
          const col = ALERT_COLORS[s.type] || '#6b7280'
          return (
            <path key={i}
              d={arc(CX, CY, R, s.start, s.end) + ` L${CX + INNER * Math.cos(s.end)},${CY + INNER * Math.sin(s.end)} A${INNER},${INNER} 0 ${s.sweep > Math.PI ? 1 : 0} 0 ${CX + INNER * Math.cos(s.start)},${CY + INNER * Math.sin(s.start)} Z`}
              fill={col} stroke="var(--surface)" strokeWidth="2"
            />
          )
        })}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text)" fontFamily="monospace">{total}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9" fill="var(--text3)">alerts</text>
      </svg>
      {/* legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 140 }}>
        {data.map((d, i) => {
          const col = ALERT_COLORS[d.type] || '#6b7280'
          const pct = Math.round((d.count / total) * 100)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: col, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 11, color: 'var(--text2)' }}>
                {d.type.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 600 }}>{d.count}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', minWidth: 32, textAlign: 'right' }}>{pct}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SVG heatmap — peak hours ────────────────────────────────────────────────
function HeatmapChart({ matrix, days, hours }) {
  if (!matrix?.length) return <EmptyChart h={160} />

  const CELL = 22, GAP = 2
  const LEFT = 36, TOP = 20
  const W    = LEFT + hours.length * (CELL + GAP)
  const H    = TOP  + days.length  * (CELL + GAP) + 20

  const maxV = Math.max(...matrix.flat(), 1)

  const cellColor = (v) => {
    if (v === 0) return 'var(--surface2)'
    const t = v / maxV
    // cyan gradient: low → dim, high → bright accent
    const a = 0.12 + t * 0.88
    return `rgba(0,229,255,${a.toFixed(2)})`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* hour labels */}
      {hours.filter(h => h % 3 === 0).map(h => (
        <text key={h}
          x={LEFT + h * (CELL + GAP) + CELL / 2}
          y={TOP - 4}
          textAnchor="middle" fontSize="8" fill="var(--text3)" fontFamily="monospace">
          {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`}
        </text>
      ))}
      {/* day labels + cells */}
      {days.map((day, di) => (
        <g key={day}>
          <text x={LEFT - 4} y={TOP + di * (CELL + GAP) + CELL / 2 + 4}
            textAnchor="end" fontSize="9" fill="var(--text3)" fontFamily="monospace">{day}</text>
          {hours.map(h => {
            const v = matrix[di][h] || 0
            return (
              <rect key={h}
                x={LEFT + h * (CELL + GAP)}
                y={TOP  + di * (CELL + GAP)}
                width={CELL} height={CELL} rx="3"
                fill={cellColor(v)}
              >
                <title>{`${day} ${h}:00 — ${v} trip${v !== 1 ? 's' : ''}`}</title>
              </rect>
            )
          })}
        </g>
      ))}
      {/* colour scale legend */}
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const x = LEFT + i * 48
        const v = Math.round(f * maxV)
        return (
          <g key={f}>
            <rect x={x} y={H - 16} width={40} height={10} rx="2"
              fill={f === 0 ? 'var(--surface2)' : `rgba(0,229,255,${(0.12 + f * 0.88).toFixed(2)})`} />
            <text x={x + 20} y={H - 1} textAnchor="middle" fontSize="8" fill="var(--text3)" fontFamily="monospace">{v}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── fleet status panel ──────────────────────────────────────────────────────
const STATUS_META = {
  available:   { color: '#00ff88', label: 'Available',   icon: '✅' },
  rented:      { color: '#00e5ff', label: 'In Use',       icon: '🔵' },
  locked:      { color: '#ff3d5a', label: 'Locked',       icon: '🔒' },
  offline:     { color: '#4a5568', label: 'Offline',      icon: '⚫' },
  maintenance: { color: '#ffd700', label: 'Maintenance',  icon: '🔧' },
}

function FleetStatusPanel({ byStatus }) {
  if (!byStatus?.length) return <EmptyChart h={120} />
  const total = byStatus.reduce((s, d) => s + d.count, 0)
  if (!total) return <EmptyChart h={120} />

  // sort by a logical order
  const order = ['available', 'rented', 'locked', 'maintenance', 'offline']
  const sorted = [...byStatus].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* stacked bar */}
      <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 16, gap: 2 }}>
        {sorted.map(d => {
          const pct = (d.count / total) * 100
          const col = STATUS_META[d.status]?.color || '#6b7280'
          return (
            <div key={d.status} title={`${STATUS_META[d.status]?.label || d.status}: ${d.count}`}
              style={{ width: `${pct}%`, background: col, minWidth: d.count > 0 ? 4 : 0, transition: 'width 0.4s' }} />
          )
        })}
      </div>

      {/* rows */}
      {sorted.map(d => {
        const meta = STATUS_META[d.status] || { color: '#6b7280', label: d.status, icon: '●' }
        const pct  = Math.round((d.count / total) * 100)
        const barW = `${pct}%`
        return (
          <div key={d.status} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            {/* colour dot */}
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: meta.color, flexShrink: 0, boxShadow: `0 0 5px ${meta.color}88` }} />
            {/* label */}
            <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{meta.label}</span>
            {/* mini bar */}
            <div style={{ width: 64, height: 4, borderRadius: 2, background: 'var(--surface2)', flexShrink: 0 }}>
              <div style={{ width: barW, height: '100%', borderRadius: 2, background: meta.color, transition: 'width 0.4s' }} />
            </div>
            {/* count + pct */}
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)', minWidth: 20, textAlign: 'right' }}>{d.count}</span>
            <span style={{ fontSize: 10, color: 'var(--text3)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
          </div>
        )
      })}

      {/* total footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Total vehicles</span>
        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{total}</span>
      </div>
    </div>
  )
}

// ─── empty state ─────────────────────────────────────────────────────────────
function EmptyChart({ h = 160 }) {
  return (
    <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12, flexDirection: 'column', gap: 8 }}>
      <BarChart2 size={24} opacity={0.3} />
      No data for this period
    </div>
  )
}

// ─── chart card wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, style }) {
  return (
    <div className="card" style={{ padding: '18px 20px', ...style }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

// ─── top riders table ─────────────────────────────────────────────────────────
function TopRidersTable({ data }) {
  if (!data?.length) return <div style={{ color: 'var(--text3)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>No rider data</div>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Rider</th>
            <th>Trips</th>
            <th>Distance</th>
            <th>Total time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={r.phone}>
              <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </td>
              <td>
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.phone}</div>
              </td>
              <td><span className="mono" style={{ fontSize: 12 }}>{r.tripCount}</span></td>
              <td><span className="mono" style={{ fontSize: 11 }}>{fmtKm(r.totalKm)}</span></td>
              <td><span className="mono" style={{ fontSize: 11 }}>{fmtMin(r.totalMins)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { isDark } = useTheme()
  const [range, setRange]       = useState(30)
  const [loading, setLoading]   = useState(true)
  const [data, setData]         = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const since = new Date(Date.now() - range * 86400000).toISOString()
      const [summary, tot, dpv, abt, ph, fs, tr] = await Promise.all([
        analyticsAPI.summary(),
        analyticsAPI.tripsOverTime({ days: range }),
        analyticsAPI.distancePerVehicle({ since }),
        analyticsAPI.alertsByType({ since }),
        analyticsAPI.peakHours({ since }),
        analyticsAPI.fleetStatus(),
        analyticsAPI.topRiders({ since }),
      ])
      setData({
        summary:   summary.data.data,
        tot:       tot.data.data,
        dpv:       dpv.data.data,
        abt:       abt.data.data,
        ph:        ph.data.data,
        fs:        fs.data.data,
        tr:        tr.data.data,
      })
    } catch (e) {
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  const s = data.summary || {}

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Analytics</div>
            <div className="page-sub">Fleet performance & operational insights</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* range selector */}
            <div style={{ display: 'flex', gap: 3 }}>
              {RANGE_OPTIONS.map(o => (
                <button key={o.days}
                  className={`btn btn-sm ${range === o.days ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setRange(o.days)}>
                  {o.label}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {loading && !data.summary ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <div className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : (
          <>
            {/* ── KPI row ─────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <KpiCard icon={<Navigation size={18} />} label="Total Trips"     value={fmt(s.totalTrips)}            sub={`${fmt(s.activeTrips)} active now`}          color="#00e5ff" />
              <KpiCard icon={<Truck size={18} />}      label="Fleet Size"      value={fmt(s.totalVehicles)}          sub={`${fmt(s.onlineVehicles)} online`}            color="#00ff88" />
              <KpiCard icon={<TrendingUp size={18} />} label="Total Distance"  value={fmtKm(s.totalDistanceKm)}     sub={fmtMin(s.totalDurationMinutes) + ' total time'} color="#a78bfa" />
              <KpiCard icon={<Bell size={18} />}       label="Unread Alerts"   value={fmt(s.unreadAlerts)}           sub={`${fmt(s.completedTrips)} completed trips`}  color="#ff6b35" />
            </div>

            {/* ── Trips over time ──────────────────────────────────────── */}
            <ChartCard
              title="Trip Volume Over Time"
              subtitle={`Daily trip count — last ${range} days`}
              style={{ marginBottom: 16 }}>
              <SectionTitle><TrendingUp size={12} /> Trips / day</SectionTitle>
              <LineChart data={data.tot} color="#00e5ff" />
            </ChartCard>

            {/* ── Distance per vehicle + Fleet status ─────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
              <ChartCard title="Distance per Vehicle" subtitle="Top 20 vehicles by km covered">
                <BarChart data={data.dpv} color="#a78bfa" />
              </ChartCard>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <ChartCard title="Fleet Status" subtitle="Vehicle availability breakdown">
                  <FleetStatusPanel byStatus={data.fs?.byStatus} />
                </ChartCard>
                <ChartCard title="Vehicle Types" subtitle="Fleet composition">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(data.fs?.byType || []).map(d => (
                      <div key={d.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>
                          {{ scooter:'🛵', motorcycle:'🏍', car:'🚗', van:'🚐', truck:'🚛', bicycle:'🚲', bus:'🚌', other:'🚗' }[d.type] || '🚗'}
                        </span>
                        <span style={{ flex: 1, fontSize: 11, color: 'var(--text2)', textTransform: 'capitalize' }}>{d.type}</span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{d.count}</span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--surface2)' }}>
                          <div style={{ width: `${((d.count / (s.totalVehicles || 1)) * 100).toFixed(0)}%`, height: '100%', borderRadius: 2, background: '#00e5ff' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              </div>
            </div>

            {/* ── Alerts donut + Top riders ────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, marginBottom: 16 }}>
              <ChartCard title="Alerts by Type" subtitle={`Last ${range} days`}>
                <DonutChart data={data.abt?.byType} />
              </ChartCard>

              <ChartCard title="Top Riders" subtitle={`Most active riders — last ${range} days`}>
                <TopRidersTable data={data.tr} />
              </ChartCard>
            </div>

            {/* ── Peak hours heatmap ───────────────────────────────────── */}
            <ChartCard title="Peak Usage Hours" subtitle="Trip starts by hour of day × day of week">
              <HeatmapChart
                matrix={data.ph?.matrix}
                days={data.ph?.days || []}
                hours={data.ph?.hours || []}
              />
            </ChartCard>
          </>
        )}
      </div>
    </>
  )
}
