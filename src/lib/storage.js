// localStorage persistence for documents, clients and business profile
import { uid } from './format'

const DOC_KEY = 'iig_documents_v1'
const BIZ_KEY = 'iig_business_v1'
const CLIENT_KEY = 'iig_clients_v1'
const ONBOARD_KEY = 'iig_onboarded_v1'
const TOMBSTONE_KEY = 'iig_tombstones_v1'
const DEFAULTS_KEY = 'iig_defaults_v1'

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error('Storage write failed', e)
  }
}

export function listDocuments() {
  const v = read(DOC_KEY, [])
  return Array.isArray(v) ? v : []
}

export function saveDocument(doc) {
  const docs = listDocuments()
  const idx = docs.findIndex((d) => d.id === doc.id)
  const stamped = { ...doc, savedAt: new Date().toISOString() }
  if (idx >= 0) docs[idx] = stamped
  else docs.unshift(stamped)
  write(DOC_KEY, docs)
  // Re-saving revives a previously deleted id: clear its tombstone.
  clearTombstone(doc.id)
  return stamped
}

export function deleteDocument(id) {
  write(DOC_KEY, listDocuments().filter((d) => d.id !== id))
  // Record a tombstone so the deletion propagates across devices via sync
  // instead of being resurrected by a merge from another device.
  const tombs = getTombstones()
  tombs[id] = new Date().toISOString()
  write(TOMBSTONE_KEY, tombs)
}

// ---- Deletion tombstones (soft-delete markers for cross-device sync) ----
export function getTombstones() {
  const raw = read(TOMBSTONE_KEY, {})
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

function clearTombstone(id) {
  const tombs = getTombstones()
  if (tombs[id]) {
    delete tombs[id]
    write(TOMBSTONE_KEY, tombs)
  }
}

export function getBusiness() {
  return read(BIZ_KEY, null)
}

export function saveBusiness(business) {
  write(BIZ_KEY, { ...business, updatedAt: new Date().toISOString() })
}

// True when object `a` was edited at or after object `b` (used to resolve
// business/defaults conflicts during a merge). A missing timestamp counts as
// epoch 0, so any real edit wins over an un-stamped legacy value.
function newerOrEqual(a, b) {
  const ta = new Date(a?.updatedAt || 0).getTime()
  const tb = new Date(b?.updatedAt || 0).getTime()
  return ta >= tb
}

// ---- Document defaults (values applied to every newly created bill) ----
// Lets the user edit the "starting values" for new quotations/invoices from
// the app instead of changing code. Anything not overridden falls back to the
// built-in defaults in defaults.js.
export function getDefaults() {
  const v = read(DEFAULTS_KEY, {})
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

export function saveDefaults(defaults) {
  const obj = defaults && typeof defaults === 'object' ? defaults : {}
  write(DEFAULTS_KEY, { ...obj, updatedAt: new Date().toISOString() })
}

export function listClients() {
  const v = read(CLIENT_KEY, [])
  return Array.isArray(v) ? v : []
}

export function saveClient(client) {
  if (!client.name) return
  const clients = listClients()
  const idx = clients.findIndex(
    (c) => c.name.toLowerCase() === client.name.toLowerCase()
  )
  if (idx >= 0) clients[idx] = client
  else clients.unshift(client)
  write(CLIENT_KEY, clients)
}

export function deleteClient(name) {
  write(CLIENT_KEY, listClients().filter((c) => c.name !== name))
}

// ---- Onboarding (one-time business account setup) ----
export function isOnboarded() {
  return read(ONBOARD_KEY, false) === true
}

export function setOnboarded(value = true) {
  write(ONBOARD_KEY, value)
}

// ---- Backup / Restore (store on a personal/synced drive as a JSON file) ----
// Bundles the business profile, all saved bills and saved clients so the user
// can keep a copy anywhere (Google Drive, iCloud, Dropbox folder, etc.) and
// restore/edit them later — even on another machine.
export function exportBackup() {
  return {
    app: 'interior-quotation-generator',
    version: 1,
    exportedAt: new Date().toISOString(),
    business: getBusiness(),
    defaults: getDefaults(),
    documents: listDocuments(),
    clients: listClients(),
    tombstones: getTombstones(),
  }
}

export function importBackup(data, { merge = true } = {}) {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file')

  // Business profile & defaults are single objects, so resolve conflicts by
  // their updatedAt timestamp (last edit wins). This keeps a freshly-saved
  // profile/defaults from being clobbered by a stale copy pulled from another
  // device during sync — and lets a newer remote edit propagate here.
  if (data.business) {
    if (!merge) write(BIZ_KEY, data.business)
    else if (newerOrEqual(data.business, getBusiness())) write(BIZ_KEY, data.business)
  }
  if (data.defaults && typeof data.defaults === 'object' && !Array.isArray(data.defaults)) {
    if (!merge) write(DEFAULTS_KEY, data.defaults)
    else if (newerOrEqual(data.defaults, getDefaults())) write(DEFAULTS_KEY, data.defaults)
  }

  // Merge deletion tombstones first (keep the latest deletedAt per id).
  const incomingTombs = data.tombstones && typeof data.tombstones === 'object' && !Array.isArray(data.tombstones)
    ? data.tombstones
    : {}
  const tombs = merge ? getTombstones() : {}
  for (const [id, ts] of Object.entries(incomingTombs)) {
    if (!ts) continue
    if (!tombs[id] || new Date(ts) > new Date(tombs[id])) tombs[id] = ts
  }

  // Rebuild the document set whenever we're merging or the backup carries a
  // documents array. (When merging without a documents field, this still lets
  // incoming tombstones prune local docs.)
  const hasDocField = Array.isArray(data.documents)
  if (merge || hasDocField) {
    const incomingDocs = hasDocField ? data.documents : []
    // Combine existing + incoming docs, keeping the newer save per id.
    const byId = new Map()
    if (merge) listDocuments().forEach((d) => { if (d && d.id) byId.set(d.id, d) })
    incomingDocs.forEach((d) => {
      if (!d || !d.id) return
      const cur = byId.get(d.id)
      if (!cur || new Date(d.savedAt || 0) >= new Date(cur.savedAt || 0)) byId.set(d.id, d)
    })

    // Apply tombstones: a deletion wins on ties (protects against accidental
    // resurrection); only a strictly later save revives the doc and drops the
    // tombstone.
    const kept = []
    for (const d of byId.values()) {
      const deletedAt = tombs[d.id]
      if (deletedAt && new Date(deletedAt) >= new Date(d.savedAt || 0)) continue
      if (deletedAt) delete tombs[d.id]
      kept.push(d)
    }
    kept.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))
    write(DOC_KEY, kept)
  }

  write(TOMBSTONE_KEY, pruneTombstones(tombs))

  if (Array.isArray(data.clients)) {
    if (merge) {
      const existing = listClients()
      const byName = new Map(existing.map((c) => [c.name?.toLowerCase(), c]))
      data.clients.forEach((c) => { if (c && c.name) byName.set(c.name.toLowerCase(), c) })
      write(CLIENT_KEY, [...byName.values()])
    } else {
      write(CLIENT_KEY, data.clients)
    }
  }
  setOnboarded(true)
  return { documents: listDocuments(), clients: listClients(), business: getBusiness() }
}

// Keep the tombstone map from growing without bound: retain the most recent
// MAX_TOMBSTONES deletions (by timestamp). Deletions this old are extremely
// unlikely to be re-introduced by a stale device.
const MAX_TOMBSTONES = 1000
function pruneTombstones(tombs) {
  const entries = Object.entries(tombs).filter(([, ts]) => ts)
  if (entries.length <= MAX_TOMBSTONES) return tombs
  entries.sort((a, b) => new Date(b[1]) - new Date(a[1]))
  return Object.fromEntries(entries.slice(0, MAX_TOMBSTONES))
}

// Wipe all locally stored app data. Used on sign-out so the next account that
// signs in on this device starts clean (no data bleed between accounts).
export function clearAll() {
  ;[DOC_KEY, BIZ_KEY, CLIENT_KEY, ONBOARD_KEY, TOMBSTONE_KEY, DEFAULTS_KEY].forEach((k) => {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  })
}

// Import bills (documents only) from another company's exported data file.
// Every imported bill gets a fresh id and savedAt so it is *added* alongside
// your existing bills — never overwriting them — and each is stamped with the
// current business profile so it prints under your identity, not theirs.
// Returns the number of bills imported.
export function importForeignDocuments(data, { business = null } = {}) {
  if (!data || typeof data !== 'object') throw new Error('Invalid data file')
  const incoming = Array.isArray(data.documents)
    ? data.documents
    : (Array.isArray(data) ? data : null)
  if (!incoming) throw new Error('No bills found in this file')

  const now = new Date().toISOString()
  const biz = business || getBusiness()
  const cleaned = incoming
    .filter((d) => d && typeof d === 'object')
    .map((d) => ({
      ...d,
      id: uid(),
      savedAt: now,
      ...(biz ? { business: { ...d.business, ...biz } } : {}),
    }))

  if (!cleaned.length) throw new Error('No bills found in this file')
  write(DOC_KEY, [...cleaned, ...listDocuments()])
  return cleaned.length
}

