import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(form.email, form.password)
      // navigate AFTER login resolves — user is now set in context
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(0,229,255,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(255,107,53,0.04) 0%, transparent 60%)',
    }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
            🚛 FleetOps
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Fleet Control Centre
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 32,
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text2)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Sign In
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="input-label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label className="input-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={loading}
              style={{ justifyContent: 'center', height: 42, marginTop: 8, fontSize: 14 }}
            >
              {loading
                ? <div className="spinner" />
                : 'Sign In →'
              }
            </button>
          </form>

          <div style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: '1px solid var(--border)',
            fontSize: 13,
            color: 'var(--text2)',
          }}>
            Need an admin account?{' '}
            <Link to="/signup" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
