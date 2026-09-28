import React from 'react';

interface State { error: Error | null; }
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Biznexco] Application render failure', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 680, margin: 'auto', background: '#1e293b', border: '1px solid #475569', borderRadius: 16, padding: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Biznexco could not display this page</h1>
          <p style={{ marginBottom: 16 }}>Your saved invoices have not been cleared. A startup error was detected.</p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, background: '#0f172a', borderRadius: 8, padding: 16 }}>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 18, padding: '10px 18px', borderRadius: 8, background: '#059669', color: '#fff', fontWeight: 700 }}>Retry loading</button>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 18 }}>If this message persists, share a screenshot of the error above. Do not clear browser storage.</p>
        </div>
      </main>
    );
  }
}
