import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('accessToken')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('refreshToken')
        const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken: refresh })
        localStorage.setItem('accessToken', data.data.accessToken)
        localStorage.setItem('refreshToken', data.data.refreshToken)
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return api(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:    d => api.post('/auth/login', d),
  register: d => api.post('/auth/register', d),
  logout:   d => api.post('/auth/logout', d),
  me:       ()  => api.get('/auth/me'),
  updateMe: d => api.patch('/auth/me', d),
}

// ── Vehicles ──────────────────────────────────────────────────────────────────
export const vehicleAPI = {
  list:        p  => api.get('/vehicles', { params: p }),
  get:         id => api.get(`/vehicles/${id}`),
  create:      d  => api.post('/vehicles', d),
  update:      (id, d) => api.patch(`/vehicles/${id}`, d),
  delete:      id => api.delete(`/vehicles/${id}`),
  location:    id => api.get(`/vehicles/${id}/location`),
  command:     (id, d) => api.post(`/vehicles/${id}/command`, d),
  setGeofence: (id, d) => api.patch(`/vehicles/${id}/geofence`, d),
}

// Keep legacy alias so any old imports still work during transition
export const scooterAPI = vehicleAPI

// ── Zones (predefined) ───────────────────────────────────────────────────────
export const zoneAPI = {
  list:   p       => api.get('/zones', { params: p }),
  get:    id      => api.get(`/zones/${id}`),
  create: d       => api.post('/zones', d),
  update: (id, d) => api.patch(`/zones/${id}`, d),
  delete: id      => api.delete(`/zones/${id}`),
  assign: (id, d) => api.patch(`/zones/${id}/assign`, d),
}

// ── Trips ─────────────────────────────────────────────────────────────────────
export const tripAPI = {
  list:   p  => api.get('/trips', { params: p }),
  active: () => api.get('/trips/active'),
  get:    id => api.get(`/trips/${id}`),
  start:  d  => api.post('/trips/start', d),
  end:    id => api.post(`/trips/${id}/end`),
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsAPI = {
  summary:            p => api.get('/analytics/summary', { params: p }),
  tripsOverTime:      p => api.get('/analytics/trips-over-time', { params: p }),
  distancePerVehicle: p => api.get('/analytics/distance-per-vehicle', { params: p }),
  alertsByType:       p => api.get('/analytics/alerts-by-type', { params: p }),
  peakHours:          p => api.get('/analytics/peak-hours', { params: p }),
  fleetStatus:        () => api.get('/analytics/fleet-status'),
  topRiders:          p => api.get('/analytics/top-riders', { params: p }),
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export const alertAPI = {
  list:    p  => api.get('/alerts', { params: p }),
  readOne: id => api.patch(`/alerts/${id}/read`),
  readAll: () => api.patch('/alerts/read-all'),
  delete:  id => api.delete(`/alerts/${id}`),
}
