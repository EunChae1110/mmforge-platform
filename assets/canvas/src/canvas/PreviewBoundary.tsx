import { Component, type ReactNode } from 'react'

export class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <p className="canvas-message" data-mmforge-preview-error role="alert">This design couldn’t render. Check the browser console.</p>
    }
    return this.props.children
  }
}
