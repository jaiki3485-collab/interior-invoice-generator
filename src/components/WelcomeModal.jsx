import React, { useState } from 'react'

// First-run gate: invite the user to sign in with Google so their existing
// business profile and bills (from another device) load automatically. If they
// have nothing yet — or prefer not to sign in — they can set up manually.
export default function WelcomeModal({ onSignIn, onManual, busy }) {
  const [error, setError] = useState('')

  async function handleSignIn() {
    setError('')
    try {
      await onSignIn()
    } catch (e) {
      console.error(e)
      setError('Google sign-in failed. Please try again, or set up manually.')
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal welcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Welcome 👋</h3>
        </div>

        <p className="doc-muted profile-intro">
          Sign in with Google to load your business details and saved bills, and
          to keep them in sync across your devices. Already used this app on
          another device? Sign in with the same Google account to pick up right
          where you left off.
        </p>

        <div className="welcome-actions">
          <button className="btn btn-primary welcome-google" onClick={handleSignIn} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in with Google'}
          </button>
          <button className="btn-ghost" onClick={onManual} disabled={busy}>
            Set up manually instead
          </button>
        </div>

        {error && <p className="welcome-error">{error}</p>}
      </div>
    </div>
  )
}
