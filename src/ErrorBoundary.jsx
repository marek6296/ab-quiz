import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary zachytil chybu:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', background: '#3b0707', color: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h1 style={{ color: '#ef4444' }}>💥 Aplikácia spadla</h1>
                    <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Prosím, pošlite screenshot tejto chyby vývojárovi:</p>
                    <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '12px', color: '#fca5a5', maxWidth: '90vw', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                        {this.state.error && this.state.error.toString()}
                        <br /><br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                    <button
                        style={{ marginTop: '2rem', padding: '1rem 2rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
                        onClick={() => {
                            window.localStorage.clear();
                            window.sessionStorage.clear();
                            window.location.reload();
                        }}
                    >
                        Obnoviť a vymazať pamäť
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
