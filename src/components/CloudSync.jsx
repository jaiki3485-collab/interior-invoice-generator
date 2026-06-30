import React, { useEffect, useState } from 'react'
import {
  isConfigured, hasValidToken, signIn, signOut, pushBackup, pullBackup,
} from '../lib/gdrive'
import { exportBackup, importBackup } from '../lib/storage'

// Cloud Sync control: sign in with Google and sync bills to the user's own
// Google Drive (hidden app folder). Lets you create a bill on a laptop and
// edit it on a phone by signing in with the same Google account.
export default function CloudSync({ onAfterRestore, onSignOut, flash }) {
  const configured = isConfigured()
  const [signedIn, setSignedIn] = useState(() => hasValidToken())
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => { setSignedIn(hasValidToken()) }, [open])

  if (!configured) return null

  async function handleSignIn() {
    setBusy('signin')
    try {
      await signIn({ prompt: 'consent' })
      setSignedIn(true)
      flash?.('Signed in to Google')
      // pull on first sign-in so existing cloud bills appear immediately
      await doPull(true)
    } catch (e) {
      console.error(e)
      flash?.('Google sign-in failed')
    } finally {
      setBusy('')
    }
  }

  function handleSignOut() {
    setOpen(false)
    setSignedIn(false)
    if (onSignOut) onSignOut()
    else { signOut(); flash?.('Signed out') }
  }

  async function doPush() {
    setBusy('push')
    try {
      // Pull + merge remote first so we never overwrite docs that only exist
      // on another device, then push the union back.
      const remote = await pullBackup({ interactive: !signedIn })
      if (remote) {
        importBackup(remote, { merge: true })
        onAfterRestore?.()
      }
      await pushBackup(exportBackup(), { interactive: !signedIn })
      setSignedIn(hasValidToken())
      flash?.('Bills synced to Drive')
    } catch (e) {
      console.error(e)
      flash?.(e.message === 'not-signed-in' ? 'Sign in first' : 'Sync up failed')
    } finally {
      setBusy('')
    }
  }

  async function doPull(silent = false) {
    if (!silent) setBusy('pull')
    try {
      const data = await pullBackup({ interactive: !signedIn })
      setSignedIn(hasValidToken())
      if (data) {
        importBackup(data, { merge: true })
        onAfterRestore?.()
        if (!silent) flash?.('Bills loaded from Drive')
      } else if (!silent) {
        flash?.('No cloud backup yet — use “Sync up”')
      }
    } catch (e) {
      console.error(e)
      if (!silent) flash?.(e.message === 'not-signed-in' ? 'Sign in first' : 'Sync down failed')
    } finally {
      if (!silent) setBusy('')
    }
  }

  return (
    <div className="cloud-wrap">
      <button className="btn-ghost" onClick={() => setOpen((s) => !s)} title="Sync bills across devices via Google Drive">
        ☁ {signedIn ? 'Synced' : 'Cloud'}
      </button>
      {open && (
        <>
          <div className="download-backdrop" onClick={() => setOpen(false)} />
          <div className="download-menu cloud-menu">
            {!signedIn ? (
              <button onClick={handleSignIn} disabled={busy === 'signin'}>
                <span className="dl-ico">🔑</span> {busy === 'signin' ? 'Signing in…' : 'Sign in with Google'}
              </button>
            ) : (
              <>
                <button onClick={doPush} disabled={busy === 'push'}>
                  <span className="dl-ico">⬆</span> {busy === 'push' ? 'Syncing…' : 'Sync up (save to Drive)'}
                </button>
                <button onClick={() => doPull(false)} disabled={busy === 'pull'}>
                  <span className="dl-ico">⬇</span> {busy === 'pull' ? 'Loading…' : 'Sync down (load from Drive)'}
                </button>
                <button onClick={handleSignOut}>
                  <span className="dl-ico">🚪</span> Sign out
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
