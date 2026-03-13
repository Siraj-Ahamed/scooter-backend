import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import toast from 'react-hot-toast'

export default function SignupPage() {
  const { signupAdmin } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })

  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await signupAdmin({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      })
      toast.success('Admin account created. You can sign in now.')
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Signup failed')
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
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
            🚛 FleetOps
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Admin Registration
          </div>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 32,
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text2)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Create Admin Account
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="input-label">Name</label>
              <input
                className="input"
                type="text"
                placeholder="Admin Name"
                value={form.name}
                onChange={set('name')}
                autoComplete="name"
                required
              />
            </div>

            <div className="form-group">
              <label className="input-label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="admin@example.com"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label className="input-label">Phone (optional)</label>
              <input
                className="input"
                type="tel"
                placeholder="+94770000000"
                value={form.phone}
                onChange={set('phone')}
                autoComplete="tel"
              />
            </div>

            <div className="form-group">
              <label className="input-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="Minimum 8 characters"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <div className="form-group">
              <label className="input-label">Confirm Password</label>
              <input
                className="input"
                type="password"
                placeholder="Repeat password"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={loading}
              style={{ justifyContent: 'center', height: 42, marginTop: 8, fontSize: 14 }}
            >
              {loading ? <div className="spinner" /> : 'Create Admin'}
            </button>
          </form>

          <div style={{
            marginTop: 20,
            paddingTop: 18,
            borderTop: '1px solid var(--border)',
            fontSize: 13,
            color: 'var(--text2)',
          }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
