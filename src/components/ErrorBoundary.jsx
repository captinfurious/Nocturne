import { Component } from 'react'
import { NovaMark } from './Logo.jsx'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[NOVA] UI error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal-screen">
          <NovaMark size={54} />
          <p className="eyebrow">Projection interrupted</p>
          <h1>The picture stopped.</h1>
          <p>NOVA hit an unexpected interface error. Reloading usually brings the screen back.</p>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            Reload NOVA
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
