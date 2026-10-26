import { Component } from 'react'
import { NocturneMark } from './Logo.jsx'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[Nocturne] UI error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal-screen">
          <NocturneMark size={54} />
          <p className="eyebrow">Projection interrupted</p>
          <h1>The picture stopped.</h1>
          <p>Nocturne hit an unexpected interface error. Reloading usually brings the screen back.</p>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            Reload Nocturne
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
