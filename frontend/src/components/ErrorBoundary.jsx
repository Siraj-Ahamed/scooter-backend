import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0a0c10', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 40,
          fontFamily: 'monospace', color: '#ff3d5a',
        }}>
          <div style={{ maxWidth: 600, width: '100%' }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>⚠ App Error</div>
            <div style={{ background: '#111318', border: '1px solid #ff3d5a40', borderRadius: 8, padding: 20, fontSize: 13, color: '#e8eaf0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </div>
            <button onClick={() => window.location.reload()}
              style={{ marginTop: 16, padding: '8px 20px', background: '#00e5ff', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
