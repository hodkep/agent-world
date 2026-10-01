import { Component, type ErrorInfo, type ReactNode } from 'react'

/** If something in the interface throws, say so and offer a reload, instead of leaving the whole window empty. */
export class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The interface hit an error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="no-bridge" role="alert">
        <h1>Something went wrong in the window</h1>
        <p>Your agents are still running. Reload the window to carry on.</p>
        <pre>{this.state.error.message}</pre>
        <button className="primary" onClick={() => location.reload()}>
          Reload
        </button>
      </main>
    )
  }
}
