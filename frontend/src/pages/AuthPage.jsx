import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'
import toast from 'react-hot-toast'

/* ─────────────────────────────────────────────────────────────────────────────
   AuthPage — sliding dual-panel with creative enhancements:
   • Animated particle network canvas background
   • Typewriter heading on overlay panel
   • Live fleet stats ticker
   • Floating labels + live validation checkmarks on inputs
   • Signup step progress indicator
   • Success celebration state after signup
   • "Press Enter" keyboard hint
───────────────────────────────────────────────────────────────────────────── */

// ── Pulse-ring connection canvas ───────────────────────────────────────────
function ParticleCanvas({ isDark }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = canvas.width  = window.innerWidth
    let H = canvas.height = window.innerHeight

    // ── Palette ───────────────────────────────────────────────────────────
    const C  = isDark ? [0, 229, 255]  : [2, 132, 199]   // cyan / blue
    const C2 = isDark ? [0, 255, 136]  : [5, 150, 105]   // green  (occasional)

    // ── Dots (moving vehicles / nodes) ───────────────────────────────────
    const COUNT = Math.min(52, Math.floor((W * H) / 20000))
    const dots = Array.from({ length: COUNT }, () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.55,
      r:  1.4 + Math.random() * 1.6,
      // Each dot tracks which neighbours it is CURRENTLY connected to.
      // When a new neighbour enters range, a pulse ring is born.
      neighbours: new Set(),
    }))

    // ── Pulse rings pool ──────────────────────────────────────────────────
    // A ring lives for RING_LIFE ms, expanding from the dot's position.
    const RING_LIFE   = 620          // ms — matches the "~600ms" spec
    const RING_MAX_R  = 28           // max radius a ring expands to
    const CONNECT_D   = 130         // px — connection threshold
    const rings = []                 // { x, y, born, color }

    const spawnRing = (x, y, color) => rings.push({ x, y, born: performance.now(), color })

    // ── Helpers ───────────────────────────────────────────────────────────
    const rgb = c => `${c[0]},${c[1]},${c[2]}`

    const drawDot = (x, y, r, c, alpha) => {
      const gr = Math.max(0.01, r * 3.5)
      // soft glow
      const g = ctx.createRadialGradient(x, y, 0, x, y, gr)
      g.addColorStop(0, `rgba(${rgb(c)},${alpha * 0.45})`)
      g.addColorStop(1, `rgba(${rgb(c)},0)`)
      ctx.beginPath()
      ctx.arc(x, y, gr, 0, Math.PI * 2)
      ctx.fillStyle = g
      ctx.fill()
      // solid core
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${rgb(c)},${alpha})`
      ctx.fill()
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      const now = performance.now()

      // ── 1. Move dots ────────────────────────────────────────────────────
      dots.forEach(d => {
        d.x += d.vx
        d.y += d.vy
        // soft bounce off edges
        if (d.x < 0)   { d.x = 0;  d.vx *= -1 }
        if (d.x > W)   { d.x = W;  d.vx *= -1 }
        if (d.y < 0)   { d.y = 0;  d.vy *= -1 }
        if (d.y > H)   { d.y = H;  d.vy *= -1 }
      })

      // ── 2. Detect connections — spawn rings on NEW contacts ─────────────
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx   = dots[i].x - dots[j].x
          const dy   = dots[i].y - dots[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const wasConnected = dots[i].neighbours.has(j)

          if (dist < CONNECT_D) {
            const lineAlpha = 0.13 * (1 - dist / CONNECT_D)

            // ── draw connection line ──
            ctx.beginPath()
            ctx.moveTo(dots[i].x, dots[i].y)
            ctx.lineTo(dots[j].x, dots[j].y)
            ctx.strokeStyle = `rgba(${rgb(C)},${lineAlpha})`
            ctx.lineWidth   = 0.7
            ctx.stroke()

            // ── NEW contact → birth a pulse ring at BOTH endpoints ──
            if (!wasConnected) {
              const ringColor = Math.random() < 0.15 ? C2 : C
              spawnRing(dots[i].x, dots[i].y, ringColor)
              spawnRing(dots[j].x, dots[j].y, ringColor)
              dots[i].neighbours.add(j)
              dots[j].neighbours.add(i)
            }
          } else {
            // out of range — clear the connection so next entry triggers a new ring
            dots[i].neighbours.delete(j)
            dots[j].neighbours.delete(i)
          }
        }
      }

      // ── 3. Draw & age pulse rings ────────────────────────────────────────
      for (let k = rings.length - 1; k >= 0; k--) {
        const ring = rings[k]
        const age  = now - ring.born                      // ms elapsed
        const t    = age / RING_LIFE                      // 0 → 1

        if (t >= 1) { rings.splice(k, 1); continue }     // expired — remove

        // easeOut: ring expands fast early, slows near end
        const eased = 1 - Math.pow(1 - t, 2)
        const r     = Math.max(0, eased * RING_MAX_R)
        // alpha: peaks at t≈0.15, fades to 0 at t=1
        const alpha = Math.max(0, 0.55 * (1 - t) * Math.min(1, t * 7))

        ctx.beginPath()
        ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${rgb(ring.color)},${alpha})`
        ctx.lineWidth   = 1.2
        ctx.stroke()
      }

      // ── 4. Draw dots on top ──────────────────────────────────────────────
      dots.forEach(d => drawDot(d.x, d.y, d.r, C, 0.75))

      animRef.current = requestAnimationFrame(draw)
    }

    draw()

    const onResize = () => {
      W = canvas.width  = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [isDark])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.6 }}
    />
  )
}

// ── Typewriter hook ────────────────────────────────────────────────────────
function useTypewriter(text, speed = 52) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) { clearInterval(id); setDone(true) }
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])

  return { displayed, done }
}

// ── Typewriter heading ─────────────────────────────────────────────────────
function TypewriterHeading({ text }) {
  const { displayed, done } = useTypewriter(text, 48)
  return (
    <h2 className="auth-overlay-heading">
      {displayed}
      {!done && <span className="auth-cursor">|</span>}
    </h2>
  )
}

// ── Fleet stats ticker ─────────────────────────────────────────────────────
const STATS = [
  { icon: '🚛', value: '2,847', label: 'Vehicles tracked' },
  { icon: '⚡', value: '99.9%', label: 'Platform uptime'  },
  { icon: '🌍', value: '14',    label: 'Countries active' },
  { icon: '📍', value: '1.2M',  label: 'GPS pings / day'  },
]

function StatsTicker() {
  const [idx, setIdx]       = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setIdx(i => (i + 1) % STATS.length)
        setFading(false)
      }, 350)
    }, 2800)
    return () => clearInterval(id)
  }, [])

  const s = STATS[idx]
  return (
    <div className={`auth-stats-ticker ${fading ? 'auth-stats-fade' : ''}`}>
      <span className="auth-stats-icon">{s.icon}</span>
      <span className="auth-stats-value">{s.value}</span>
      <span className="auth-stats-label">{s.label}</span>
    </div>
  )
}

// ── Signup step indicator ──────────────────────────────────────────────────
const SIGNUP_STEPS = ['Identity', 'Contact', 'Security']

function StepIndicator({ form }) {
  const step =
    form.name && form.phone !== undefined ? (
      form.email ? (form.password ? 3 : 2) : 2
    ) : 1

  return (
    <div className="auth-steps">
      {SIGNUP_STEPS.map((label, i) => {
        const state = i + 1 < step ? 'done' : i + 1 === step ? 'active' : 'idle'
        return (
          <div key={label} className={`auth-step auth-step-${state}`}>
            <div className="auth-step-dot">
              {state === 'done' ? '✓' : i + 1}
            </div>
            <span className="auth-step-label">{label}</span>
            {i < SIGNUP_STEPS.length - 1 && <div className={`auth-step-line ${state === 'done' ? 'auth-step-line-done' : ''}`} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Confetti burst ─────────────────────────────────────────────────────────
function ConfettiBurst() {
  const pieces = Array.from({ length: 32 }, (_, i) => ({
    id: i,
    color: ['#00e5ff','#00ff88','#ff6b35','#ffd700','#a78bfa','#f472b6'][i % 6],
    x: 40 + Math.random() * 20,
    angle: Math.random() * 360,
    size: 6 + Math.random() * 8,
    delay: Math.random() * 0.3,
    dur: 0.7 + Math.random() * 0.6,
  }))

  return (
    <div className="auth-confetti-wrap" aria-hidden>
      {pieces.map(p => (
        <div
          key={p.id}
          className="auth-confetti-piece"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size * (Math.random() > 0.5 ? 1 : 2.5),
            background: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.angle}deg)`,
          }}
        />
      ))}
    </div>
  )
}

// ── Success state card ─────────────────────────────────────────────────────
function SuccessState({ onContinue }) {
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), 80); return () => clearTimeout(t) }, [])

  return (
    <div className={`auth-success-state ${show ? 'auth-success-visible' : ''}`}>
      <ConfettiBurst />
      <div className="auth-success-ring">
        <svg viewBox="0 0 52 52" className="auth-success-checkmark">
          <circle className="auth-check-circle" cx="26" cy="26" r="24" />
          <path className="auth-check-path" d="M14 27 L22 35 L38 18" />
        </svg>
      </div>
      <h2 className="auth-success-title">Account Created!</h2>
      <p className="auth-success-sub">Welcome to FleetOps. Your admin account is ready.</p>
      <button className="auth-submit-btn" style={{ marginTop: 24, maxWidth: 220 }} onClick={onContinue}>
        <span>Go to Sign In</span>
        <span className="auth-btn-arrow">→</span>
      </button>
    </div>
  )
}

// ── Enter key hint ─────────────────────────────────────────────────────────
function EnterHint({ show }) {
  return (
    <div className={`auth-enter-hint ${show ? 'auth-enter-hint-visible' : ''}`}>
      <kbd>↵</kbd> Press Enter to sign in
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────────────────────── */
export default function AuthPage() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { login, signupAdmin } = useAuth()
  const { isDark } = useTheme()

  const [isSignUp, setIsSignUp]     = useState(location.pathname === '/signup')
  const [animating, setAnimating]   = useState(false)
  const [signupDone, setSignupDone] = useState(false)

  // Login form
  const [loginForm, setLoginForm]       = useState({ email: '', password: '' })
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginErrors, setLoginErrors]   = useState({})
  const [showLoginPw, setShowLoginPw]   = useState(false)
  const [loginTouched, setLoginTouched] = useState({})

  // Signup form
  const [signupForm, setSignupForm]         = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [signupLoading, setSignupLoading]   = useState(false)
  const [signupErrors, setSignupErrors]     = useState({})
  const [showSignupPw, setShowSignupPw]     = useState(false)
  const [showConfirmPw, setShowConfirmPw]   = useState(false)
  const [signupTouched, setSignupTouched]   = useState({})

  // Sync URL
  useEffect(() => {
    const target = isSignUp ? '/signup' : '/login'
    if (location.pathname !== target) navigate(target, { replace: true })
  }, [isSignUp])

  const switchPanel = (toSignUp) => {
    if (animating || toSignUp === isSignUp) return
    setAnimating(true)
    setTimeout(() => { setIsSignUp(toSignUp); setAnimating(false) }, 340)
  }

  // ── Login ──────────────────────────────────────────────────────────────
  const handleLogin = async e => {
    e.preventDefault()
    const errs = {}
    if (!loginForm.email)    errs.email    = 'Email is required'
    if (!loginForm.password) errs.password = 'Password is required'
    if (Object.keys(errs).length) { setLoginErrors(errs); setLoginTouched({ email: true, password: true }); return }
    setLoginErrors({})
    setLoginLoading(true)
    try {
      await login(loginForm.email, loginForm.password)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid email or password')
    } finally { setLoginLoading(false) }
  }

  // ── Signup ─────────────────────────────────────────────────────────────
  const handleSignup = async e => {
    e.preventDefault()
    const errs = {}
    if (!signupForm.name.trim())  errs.name = 'Name is required'
    if (!signupForm.email.trim()) errs.email = 'Email is required'
    if (signupForm.password.length < 8) errs.password = 'Min 8 characters'
    if (signupForm.password !== signupForm.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    if (Object.keys(errs).length) { setSignupErrors(errs); setSignupTouched({ name:true,email:true,password:true,confirmPassword:true }); return }
    setSignupErrors({})
    setSignupLoading(true)
    try {
      await signupAdmin({
        name: signupForm.name.trim(),
        email: signupForm.email.trim(),
        phone: signupForm.phone.trim() || undefined,
        password: signupForm.password,
      })
      setSignupDone(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Signup failed')
    } finally { setSignupLoading(false) }
  }

  const afterSuccess = () => {
    setSignupDone(false)
    setSignupForm({ name:'',email:'',phone:'',password:'',confirmPassword:'' })
    setSignupTouched({})
    switchPanel(false)
  }

  const setL = k => e => {
    setLoginForm(p => ({ ...p, [k]: e.target.value }))
    setLoginTouched(p => ({ ...p, [k]: true }))
    if (loginErrors[k]) setLoginErrors(p => ({ ...p, [k]: '' }))
  }
  const setS = k => e => {
    setSignupForm(p => ({ ...p, [k]: e.target.value }))
    setSignupTouched(p => ({ ...p, [k]: true }))
    if (signupErrors[k]) setSignupErrors(p => ({ ...p, [k]: '' }))
  }

  // Show Enter hint once email is filled
  const showEnterHint = !!(loginForm.email && loginForm.password)

  // Live field validity
  const lv = {
    email:    loginTouched.email    && /\S+@\S+\.\S+/.test(loginForm.email),
    password: loginTouched.password && loginForm.password.length >= 1,
  }
  const sv = {
    name:            signupTouched.name    && signupForm.name.trim().length >= 2,
    email:           signupTouched.email   && /\S+@\S+\.\S+/.test(signupForm.email),
    phone:           signupTouched.phone && /^[+\d][\d\s\-]{6,}$/.test(signupForm.phone),
    password:        signupTouched.password        && signupForm.password.length >= 8,
    confirmPassword: signupTouched.confirmPassword && signupForm.confirmPassword === signupForm.password && signupForm.password.length >= 1,
  }

  const overlayHeading = isSignUp ? 'Welcome Back!' : 'Hello, Fleet Manager!'

  return (
    <div className="auth-page">
      <ParticleCanvas isDark={isDark} />

      {/* Theme toggle */}
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>

      {/* ── Card ── */}
      <div className="auth-card">

        {/* ── Sliding overlay ── */}
        <div className={`auth-overlay-panel ${isSignUp ? 'auth-overlay-right' : 'auth-overlay-left'}`}>
          <div className="auth-deco auth-deco-1" />
          <div className="auth-deco auth-deco-2" />
          <div className="auth-deco auth-deco-3" />
          <div className="auth-deco auth-deco-4" />
          <div className="auth-deco auth-deco-5" />

          <div className={`auth-overlay-content ${animating ? 'auth-overlay-content-hidden' : ''}`}>
            <div className="auth-overlay-logo">🚛</div>
            <div className="auth-overlay-brand">FleetOps</div>

            <TypewriterHeading text={overlayHeading} />

            <p className="auth-overlay-desc">
              {isSignUp
                ? <>Already have an account?<br />Sign in to access your fleet dashboard.</>
                : <>New here? Create your admin account<br />and start managing your fleet today.</>
              }
            </p>

            <button className="auth-overlay-btn" onClick={() => switchPanel(!isSignUp)}>
              {isSignUp ? 'SIGN IN' : 'SIGN UP'}
            </button>

            {/* Stats ticker */}
            <StatsTicker />
          </div>
        </div>

        {/* ── Sign-In form ── */}
        <div className={`auth-form-panel auth-form-left ${!isSignUp ? 'auth-form-active' : 'auth-form-hidden'}`}>
          <div className="auth-form-inner">
            <div className="auth-form-icon">🔑</div>
            <h2 className="auth-form-title">Sign In</h2>
            <p className="auth-form-sub">Welcome back to your fleet dashboard</p>

            <form onSubmit={handleLogin} noValidate>
              <FloatingInput
                label="Email Address" type="email" placeholder="you@example.com"
                value={loginForm.email} onChange={setL('email')}
                error={loginErrors.email} valid={lv.email} icon="✉"
                autoComplete="email"
              />
              <FloatingInput
                label="Password" type={showLoginPw ? 'text' : 'password'} placeholder="Enter your password"
                value={loginForm.password} onChange={setL('password')}
                error={loginErrors.password} valid={lv.password} icon="🔒"
                autoComplete="current-password"
                togglePw={() => setShowLoginPw(v => !v)} showPw={showLoginPw}
              />

              <EnterHint show={showEnterHint} />

              <button type="submit" className="auth-submit-btn" disabled={loginLoading}>
                {loginLoading
                  ? <span className="auth-spinner" />
                  : <><span>Sign In</span><span className="auth-btn-arrow">→</span></>
                }
              </button>
            </form>

            <div className="auth-switch-hint">
              Don't have an account?{' '}
              <button className="auth-switch-link" onClick={() => switchPanel(true)}>Create one</button>
            </div>
          </div>
        </div>

        {/* ── Sign-Up form ── */}
        <div className={`auth-form-panel auth-form-right ${isSignUp ? 'auth-form-active' : 'auth-form-hidden'}`}>
          {signupDone ? (
            <SuccessState onContinue={afterSuccess} />
          ) : (
            <div className="auth-form-inner">
              <div className="auth-form-icon">✍️</div>
              <h2 className="auth-form-title">Create Account</h2>
              <p className="auth-form-sub">Set up your FleetOps admin account</p>

              {/* Step indicator */}
              <StepIndicator form={signupForm} />

              <form onSubmit={handleSignup} noValidate>
                <div className="auth-form-row">
                  <FloatingInput
                    label="Full Name" type="text" placeholder="Your name"
                    value={signupForm.name} onChange={setS('name')}
                    error={signupErrors.name} valid={sv.name} icon="👤"
                    autoComplete="name"
                  />
                  <FloatingInput
                  label="Phone (optional)" type="tel" placeholder="+94770000000"
                  value={signupForm.phone} onChange={setS('phone')}
                  valid={sv.phone} icon="📱"
                  autoComplete="tel"
                    onKeyDown={e => {
                    const allowed = /[0-9+\-\s()]/
                    const ctrl = e.ctrlKey || e.metaKey
                    if (!ctrl && e.key.length === 1 && !allowed.test(e.key)) e.preventDefault()
                  }}
                />
                </div>

                <FloatingInput
                  label="Email Address" type="email" placeholder="admin@yourcompany.com"
                  value={signupForm.email} onChange={setS('email')}
                  error={signupErrors.email} valid={sv.email} icon="✉"
                  autoComplete="email"
                />

                <div className="auth-form-row">
                  <FloatingInput
                    label="Password" type={showSignupPw ? 'text' : 'password'} placeholder="Min. 8 chars"
                    value={signupForm.password} onChange={setS('password')}
                    error={signupErrors.password} valid={sv.password} icon="🔒"
                    autoComplete="new-password"
                    togglePw={() => setShowSignupPw(v => !v)} showPw={showSignupPw}
                  />
                  <FloatingInput
                    label="Confirm Password" type={showConfirmPw ? 'text' : 'password'} placeholder="Repeat"
                    value={signupForm.confirmPassword} onChange={setS('confirmPassword')}
                    error={signupErrors.confirmPassword} valid={sv.confirmPassword} icon="🔒"
                    autoComplete="new-password"
                    togglePw={() => setShowConfirmPw(v => !v)} showPw={showConfirmPw}
                  />
                </div>

                {signupForm.password.length > 0 && (
                  <PasswordStrength password={signupForm.password} />
                )}

                <button type="submit" className="auth-submit-btn" disabled={signupLoading}>
                  {signupLoading
                    ? <span className="auth-spinner" />
                    : <><span>Create Account</span><span className="auth-btn-arrow">→</span></>
                  }
                </button>
              </form>

              <div className="auth-switch-hint">
                Already have an account?{' '}
                <button className="auth-switch-link" onClick={() => switchPanel(false)}>Sign in</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Floating label input with live valid checkmark
───────────────────────────────────────────────────────────────────────────── */
// name map — tells the browser which saved credential field this is
const AUTOFILL_NAME = {
  'current-password': 'password',
  'new-password':     'new-password',
  'email':            'email',
  'name':             'name',
  'tel':              'tel',
}

function FloatingInput({ label, icon, type, placeholder, value, onChange, error, valid, autoComplete, togglePw, showPw, onKeyDown }) {
  const [focused, setFocused]         = useState(false)
  const [autofilled, setAutofilled]   = useState(false)
  const inputRef                      = useRef(null)

  // Detect browser autofill via the :-webkit-autofill animation trick
  // AND via animationstart event — covers Chrome, Edge, Safari, Firefox
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onAnim = (e) => {
      if (e.animationName === 'autofillStart') setAutofilled(true)
      if (e.animationName === 'autofillCancel') setAutofilled(false)
    }
    el.addEventListener('animationstart', onAnim)
    return () => el.removeEventListener('animationstart', onAnim)
  }, [])

  const floated = focused || value.length > 0 || autofilled
  const inputName = AUTOFILL_NAME[autoComplete] || autoComplete

  return (
    <div className="auth-field">
      <div className={`auth-field-wrap auth-field-floating
        ${error   ? 'auth-field-error'  : ''}
        ${valid && value.length > 0 ? 'auth-field-valid' : ''}
        ${focused ? 'auth-field-focus'  : ''}
      `}>
        <span className="auth-field-icon">{icon}</span>

        <div style={{ flex: 1, position: 'relative' }}>
          <label className={`auth-float-label ${floated ? 'auth-float-label-up' : ''}`}>
            {label}
          </label>
          <input
            ref={inputRef}
            className="auth-field-input auth-field-input-floating"
            type={type}
            /* Always keep a placeholder so browsers can fingerprint the field.
               It's invisible when the float label is resting on top. */
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoComplete={autoComplete}
            name={inputName}
            onKeyDown={onKeyDown}
          />
        </div>

        {valid && !error && value.length > 0 && (
          <span className="auth-valid-check">✓</span>
        )}

        {togglePw && (
          <button type="button" className="auth-pw-toggle" onClick={togglePw} tabIndex={-1}>
            {showPw ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {error && <span className="auth-field-err-msg">{error}</span>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Password strength
───────────────────────────────────────────────────────────────────────────── */
function PasswordStrength({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score  = checks.filter(Boolean).length
  const labels = ['Weak', 'Fair', 'Good', 'Strong']
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e']
  const hints  = ['Add uppercase letters', 'Add numbers', 'Add special characters (!@#)', '']

  return (
    <div className="auth-pw-strength">
      <div className="auth-pw-bars">
        {[0,1,2,3].map(i => (
          <div key={i} className="auth-pw-bar"
            style={{ background: i < score ? colors[score - 1] : undefined }} />
        ))}
      </div>
      <span className="auth-pw-label" style={{ color: colors[score-1] || 'var(--text3)' }}>
        {score > 0 ? labels[score - 1] : ''}
      </span>
    </div>
  )
}
