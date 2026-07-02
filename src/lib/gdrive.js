// Google Drive sync using Google Identity Services (GIS) token flow + the
// Drive REST API. Bills are stored in the user's *own* Drive, inside the
// hidden, per-app "appDataFolder" (scope: drive.appdata) — the app can only
// see files it created, nothing else in the user's Drive.
//
// One OAuth Client ID (set via VITE_GOOGLE_CLIENT_ID) is shared by all users;
// each user signs in with their own Google account and syncs to their own Drive.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const BACKUP_NAME = 'interior-bills.json'
const TOKEN_KEY = 'iig_gdrive_token_v1'

export function isConfigured() {
  return Boolean(CLIENT_ID)
}

let gisPromise = null
function loadGIS() {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(s)
  })
  return gisPromise
}

// ---- token persistence (so a refresh keeps you signed in until expiry) ----
function saveToken(tok) {
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tok)) } catch {}
}
function readToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const tok = JSON.parse(raw)
    if (!tok?.access_token || !tok?.expires_at) return null
    if (Date.now() > tok.expires_at - 60_000) return null // expired / about to
    return tok
  } catch { return null }
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY) } catch {}
}

export function hasValidToken() {
  return Boolean(readToken())
}

// True when a token blob exists in storage even if it has since expired. Used
// to decide whether to attempt a silent re-auth on load (returning users)
// versus showing a fresh sign-in prompt (brand-new users).
export function hasStoredToken() {
  try { return Boolean(localStorage.getItem(TOKEN_KEY)) } catch { return false }
}

let tokenClient = null
async function getTokenClient() {
  await loadGIS()
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {}, // set per-request below
    })
  }
  return tokenClient
}

// Interactive sign-in (must be triggered by a user gesture). Resolves with the
// access token. `prompt: ''` lets Google skip the dialog if already consented.
export function signIn({ prompt = 'consent' } = {}) {
  return new Promise(async (resolve, reject) => {
    if (!CLIENT_ID) return reject(new Error('Missing VITE_GOOGLE_CLIENT_ID'))
    try {
      const client = await getTokenClient()
      client.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error))
        const tok = {
          access_token: resp.access_token,
          expires_at: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
        }
        saveToken(tok)
        resolve(tok.access_token)
      }
      client.requestAccessToken({ prompt })
    } catch (e) {
      reject(e)
    }
  })
}

export function signOut() {
  const tok = readToken()
  clearToken()
  if (tok?.access_token && window.google?.accounts?.oauth2) {
    try { window.google.accounts.oauth2.revoke(tok.access_token, () => {}) } catch {}
  }
}

// Return a usable access token, silently refreshing if possible.
async function ensureToken(interactive = false) {
  const tok = readToken()
  if (tok) return tok.access_token
  if (!interactive) {
    // try a silent grant (no dialog) if the user previously consented
    try { return await signIn({ prompt: '' }) } catch { return null }
  }
  return signIn({ prompt: 'consent' })
}

async function driveFetch(url, opts = {}, token) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })
  if (res.status === 401) {
    clearToken()
    throw new Error('unauthorized')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive API ${res.status}: ${text}`)
  }
  return res
}

// Find the app-data backup file's id (if it exists).
async function findBackupFileId(token) {
  const q = encodeURIComponent(`name='${BACKUP_NAME}'`)
  const url =
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}` +
    `&fields=files(id,name,modifiedTime)&pageSize=1`
  const res = await driveFetch(url, {}, token)
  const data = await res.json()
  return data.files?.[0]?.id || null
}

// Upload (create or update) the backup JSON into appDataFolder.
export async function pushBackup(backup, { interactive = false } = {}) {
  const token = await ensureToken(interactive)
  if (!token) throw new Error('not-signed-in')

  const existingId = await findBackupFileId(token)
  const metadata = existingId
    ? {}
    : { name: BACKUP_NAME, parents: ['appDataFolder'] }

  const boundary = 'iig_' + Math.random().toString(36).slice(2)
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(backup) +
    `\r\n--${boundary}--`

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id,modifiedTime`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime`

  const res = await driveFetch(
    url,
    {
      method: existingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    token,
  )
  return res.json()
}

// Download the backup JSON from appDataFolder (or null if none yet).
export async function pullBackup({ interactive = false } = {}) {
  const token = await ensureToken(interactive)
  if (!token) throw new Error('not-signed-in')

  const id = await findBackupFileId(token)
  if (!id) return null
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    {},
    token,
  )
  return res.json()
}
