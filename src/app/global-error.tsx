'use client';

// Catches errors thrown in the root layout itself. Must render its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f8fafc', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 40, maxWidth: 360, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>
              The app hit an unexpected error. Please try again.
            </p>
            <button
              onClick={reset}
              style={{ fontSize: 14, fontWeight: 500, color: '#fff', background: '#7d1535', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
