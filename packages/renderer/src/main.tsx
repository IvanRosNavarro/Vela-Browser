import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

interface ErrorBoundaryState { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static override getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[Vela] Error de renderizado:', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          background: '#0e0f12', color: '#e6e8ee', fontFamily: 'monospace', padding: 32,
        }}>
          <div style={{ fontSize: 14, color: '#ff8a8a', fontWeight: 600 }}>
            Error de renderizado
          </div>
          <pre style={{
            fontSize: 11, color: '#8c93a3', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxWidth: 640, maxHeight: 320, overflow: 'auto',
            background: '#1c1f25', padding: 12, borderRadius: 6,
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: '#4f8ef7', color: '#fff', cursor: 'pointer', fontSize: 12,
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
