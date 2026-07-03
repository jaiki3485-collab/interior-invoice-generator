import React, { useRef, useState, useEffect } from 'react'
import Editor from './components/Editor'
import DocumentPreview from './components/DocumentPreview'
import SavedModal from './components/SavedModal'
import BusinessProfileModal from './components/BusinessProfileModal'
import DefaultsModal from './components/DefaultsModal'
import CloudSync from './components/CloudSync'
import WelcomeModal from './components/WelcomeModal'
import { hasValidToken as gdriveHasToken, hasStoredToken as gdriveHasStoredToken, pushBackup as gdrivePush, pullBackup as gdrivePull, signIn as gdriveSignIn, signOut as gdriveSignOut, isConfigured as gdriveConfigured } from './lib/gdrive'
import { newDoc, DEFAULT_FIELDS, BUILTIN_DEFAULTS } from './lib/defaults'
import { toLocalISO } from './lib/format'
import {
  listDocuments, saveDocument, deleteDocument,
  getBusiness, saveBusiness, listClients, saveClient,
  isOnboarded, setOnboarded, exportBackup, importBackup,
  clearAll, importForeignDocuments, getDefaults, saveDefaults,
} from './lib/storage'
import { exportPDF } from './lib/pdf'
import { exportExcel } from './lib/excel'
import { parseDocxToDocument } from './lib/docximport'
import { parsePdfToDocument } from './lib/pdfimport'
import { parseExcelToDocument } from './lib/xlsximport'

// Human-friendly download name, e.g. "Client Name_Quotation_2026-07-01".
// The date keeps multiple bills for the same client from overwriting each
// other on download.
function docFilename(d, ext) {
  const client = (d.client?.name || 'Document').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ') || 'Document'
  const typeLabel = d.type === 'invoice' ? 'Invoice' : 'Quotation'
  const date = (d.date || toLocalISO(new Date())).slice(0, 10)
  return `${client}_${typeLabel}_${date}.${ext}`
}

export default function App() {
  const [doc, setDoc] = useState(() => {
    const d = newDoc('invoice', getDefaults())
    const biz = getBusiness()
    if (biz) d.business = { ...d.business, ...biz }
    return d
  })
  const [clients, setClients] = useState(() => listClients())
  const [savedDocs, setSavedDocs] = useState(() => listDocuments())
  const [showSaved, setShowSaved] = useState(false)
  const [toast, setToast] = useState('')
  const [exporting, setExporting] = useState(false)
  const [showDownload, setShowDownload] = useState(false)
  const [mobileView, setMobileView] = useState('edit') // edit | preview
  const [showProfile, setShowProfile] = useState(false)
  const [showDefaults, setShowDefaults] = useState(false)
  // First-run / sign-in gate: 'welcome' (Google sign-in) -> 'profile' (manual
  // business setup) -> 'done'. When Drive is configured, signing in is
  // MANDATORY: the app stays gated behind 'welcome' until there's a valid
  // Google token, and returns there whenever the user signs out or the token
  // expires. When Drive isn't configured, fall back to manual onboarding.
  const [onboard, setOnboard] = useState(() => {
    if (gdriveConfigured()) {
      if (!gdriveHasToken()) return 'welcome'
      return isOnboarded() ? 'done' : 'profile'
    }
    return isOnboarded() ? 'done' : 'profile'
  })
  const [onboarding, setOnboarding] = useState(false)

  const previewRef = useRef(null)
  const syncingRef = useRef(false)
  const toastTimer = useRef(null)

  function flash(msg) {
    // Cancel any pending clear so an earlier toast's timer can't wipe this
    // message almost immediately (e.g. saving right after another action).
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => {
      setToast('')
      toastTimer.current = null
    }, 2200)
  }

  // Sign-in is mandatory (when Drive is configured). On load, if a returning
  // user's token has expired, try a SILENT re-auth so a refresh doesn't force
  // a full sign-in dialog. If that fails, the Welcome gate remains.
  useEffect(() => {
    if (!gdriveConfigured() || gdriveHasToken() || !gdriveHasStoredToken()) return
    let cancelled = false
    ;(async () => {
      try {
        await gdriveSignIn({ prompt: '' })
        if (cancelled) return
        const remote = await gdrivePull({ interactive: false })
        if (remote) { importBackup(remote, { merge: true }); refreshFromStorage() }
        const biz = getBusiness()
        if (biz && biz.name) { setOnboarded(true); setOnboard('done') }
        else setOnboard('profile')
      } catch { /* stay on the Welcome gate — user must sign in */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Force the sign-in gate back up if the token expires while the app is open
  // (checked when the tab regains focus, since tokens live ~1 hour).
  useEffect(() => {
    if (!gdriveConfigured()) return
    function check() {
      if (!gdriveHasToken()) setOnboard((s) => (s === 'done' ? 'welcome' : s))
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  // Persist the business profile only when the user actually edits it (via the
  // inline "Your Business" fields or the Business Profile modal) — NOT whenever
  // doc.business changes. Loading/importing a saved bill sets doc.business to
  // that bill's embedded snapshot; persisting that would clobber the user's
  // real profile and leak stale values into future new bills.
  function handleBusinessChange(business) {
    setDoc((d) => ({ ...d, business }))
    saveBusiness(business)
  }

  function handleNew(type) {
    const d = newDoc(type, getDefaults())
    const biz = getBusiness()
    if (biz) d.business = { ...d.business, ...biz }
    setDoc(d)
    flash('Started a new ' + type)
  }

  // Mirror local state to Google Drive when signed in. To avoid clobbering
  // docs that only exist on another device, we first pull the remote backup
  // and merge it into local (honoring tombstones), then push the union.
  // Returns a status so callers can surface it: 'synced' | 'failed' | 'skipped'.
  async function syncUp() {
    if (!gdriveHasToken() || syncingRef.current) return 'skipped'
    syncingRef.current = true
    try {
      const remote = await gdrivePull({ interactive: false })
      if (remote) {
        importBackup(remote, { merge: true })
        setSavedDocs(listDocuments())
        setClients(listClients())
      }
      await gdrivePush(exportBackup(), { interactive: false })
      return 'synced'
    } catch (e) {
      console.error('Drive sync failed', e)
      return 'failed'
    } finally {
      syncingRef.current = false
    }
  }

  function handleSave() {
    const existed = savedDocs.some((d) => d.id === doc.id)
    saveDocument(doc)
    setSavedDocs(listDocuments())
    if (doc.client.name) {
      saveClient(doc.client)
      setClients(listClients())
    }
    const base = existed ? 'Updated' : 'Saved'
    if (gdriveHasToken()) {
      flash(base + ' · syncing to Drive…')
      syncUp().then((status) => {
        if (status === 'synced') flash(base + ' & synced to Drive')
        else if (status === 'failed') flash(base + ' locally · Drive sync failed')
      })
    } else {
      flash(base + ' locally')
    }
  }

  function handleLoad(d) {
    setDoc(d)
    setShowSaved(false)
    flash('Opened ' + (d.client?.name || d.type))
  }

  function handleDelete(id) {
    deleteDocument(id)
    setSavedDocs(listDocuments())
    // Push the tombstone so the deletion propagates to other devices.
    syncUp()
  }

  // Save the one-time business account; reuse it on the current document too.
  function handleProfileSave(business) {
    saveBusiness(business)
    setOnboarded(true)
    setDoc((d) => ({ ...d, business: { ...d.business, ...business } }))
    setShowProfile(false)
    setOnboard('done')
    flash('Business profile saved')
    syncUp()
  }

  // Save the editable default values for new bills. Optionally apply them to
  // the current document too (only overwrites the default-driven fields).
  function handleDefaultsSave(defaults, { applyToCurrent = false } = {}) {
    saveDefaults(defaults)
    setShowDefaults(false)
    if (applyToCurrent) {
      setDoc((d) => ({
        ...d,
        category: defaults.category,
        otherCategory: defaults.otherCategory,
        currency: defaults.currency,
        theme: defaults.theme,
        showRate: defaults.showRate !== false,
        showTotals: defaults.showTotals !== false,
        showGST: defaults.showGST === true,
        gstRate: Number(defaults.gstRate) || 18,
        showSignature: defaults.showSignature !== false,
        notes: defaults.notes,
        terms: d.type === 'invoice' ? defaults.invoiceTerms : defaults.quotationTerms,
      }))
    }
    flash('Default values saved')
    syncUp()
  }

  // First-run: sign in with Google, then pull any existing data from Drive.
  // If the user already has a business profile in the cloud, skip the manual
  // setup entirely; otherwise fall through to the profile form.
  async function handleWelcomeSignIn() {
    setOnboarding(true)
    try {
      await gdriveSignIn({ prompt: 'consent' })
      const remote = await gdrivePull({ interactive: false })
      if (remote) {
        importBackup(remote, { merge: true })
        refreshFromStorage()
      }
      const biz = getBusiness()
      if (remote && biz && biz.name) {
        // Existing account found in Drive — straight into the app.
        setOnboarded(true)
        setOnboard('done')
        flash('Welcome back! Your data is synced')
      } else {
        // Signed in, but nothing saved yet — collect business details.
        setOnboard('profile')
      }
    } finally {
      setOnboarding(false)
    }
  }

  // Refresh in-memory state after a cloud (Drive) sync-down merged new data.
  function refreshFromStorage() {
    setSavedDocs(listDocuments())
    setClients(listClients())
    const biz = getBusiness()
    if (biz) setDoc((d) => ({ ...d, business: { ...d.business, ...biz } }))
  }

  // Sign out: push the latest data to Drive (best-effort), revoke the Google
  // token, then wipe local data so the next account starts clean — and return
  // to the Welcome / onboarding screen.
  async function handleSignOut() {
    try {
      if (gdriveHasToken()) await gdrivePush(exportBackup(), { interactive: false })
    } catch (e) {
      console.error('Final sync before sign-out failed', e)
    }
    gdriveSignOut()
    clearAll()
    setSavedDocs([])
    setClients([])
    setDoc(newDoc('invoice', getDefaults()))
    setShowSaved(false)
    setShowProfile(false)
    setOnboard(gdriveConfigured() ? 'welcome' : 'profile')
    flash('Signed out')
  }

  // Import bills from another company's exported data file. Adds them as new
  // bills (fresh ids) under your current business profile — never overwrites
  // your existing bills or your business identity.
  function handleImportBills(data) {
    try {
      const n = importForeignDocuments(data, { business: getBusiness() })
      setSavedDocs(listDocuments())
      flash(`Imported ${n} bill${n === 1 ? '' : 's'}`)
      syncUp()
    } catch (e) {
      console.error(e)
      flash(e.message || 'Import failed')
    }
  }

  // Import a bill from a Word (.docx), PDF (.pdf) or Excel (.xlsx/.xls) BoQ /
  // quotation. Extracts the client details + line-item table, stamps it with
  // your current business profile, saves it as a new bill, and opens it for
  // review. The correct parser is chosen from the file extension.
  async function handleImportDoc(file) {
    const name = (file?.name || '').toLowerCase()
    let parse, kind
    if (name.endsWith('.pdf')) { parse = parsePdfToDocument; kind = 'PDF' }
    else if (name.endsWith('.xlsx') || name.endsWith('.xls')) { parse = parseExcelToDocument; kind = 'Excel' }
    else { parse = parseDocxToDocument; kind = 'Word' }
    try {
      const parsed = await parse(file)
      const biz = getBusiness()
      const stamped = { ...parsed, ...(biz ? { business: { ...parsed.business, ...biz } } : {}) }
      saveDocument(stamped)
      setDoc(stamped)
      setSavedDocs(listDocuments())
      setClients(listClients())
      setShowSaved(false)
      flash(`Imported bill from ${kind} document`)
      syncUp()
    } catch (e) {
      console.error(e)
      flash(e.message || `Could not read this ${kind} document`)
    }
  }

  // Export all bills + profile to a JSON data file (so another device or
  // company can import them).
  function handleExportData() {
    const data = exportBackup()
    const stamp = toLocalISO(new Date())
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `interior-bills_${stamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1500)
    flash('Data file downloaded')
  }

  async function handlePDF() {
    setExporting(true)
    setShowDownload(false)
    try {
      const name = docFilename(doc, 'pdf')
      await exportPDF(doc, name)
      flash('PDF downloaded')
    } catch (e) {
      console.error(e)
      flash('PDF export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleExcel() {
    setShowDownload(false)
    try {
      const name = docFilename(doc, 'xlsx')
      await exportExcel(doc, name)
      flash('Excel downloaded')
    } catch (e) {
      console.error(e)
      flash('Excel export failed')
    }
  }

  function handlePrint() {
    window.print()
  }

  function pickClient(c) {
    setDoc((d) => ({ ...d, client: { ...d.client, ...c } }))
  }

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="brand-mark">▦</span>
          <div>
            <div className="brand-title">Interior Quotation &amp; Invoice Generator</div>
            <div className="brand-sub">Create, save &amp; download professional documents</div>
          </div>
        </div>
        <div className="toolbar">
          <div className="seg">
            <button onClick={() => handleNew('invoice')}>+ Invoice</button>
            <button onClick={() => handleNew('quotation')}>+ Quotation</button>
          </div>
          <button className="btn-ghost" onClick={() => { setSavedDocs(listDocuments()); setShowSaved(true) }}>
            Saved ({savedDocs.length})
          </button>
          <button className="btn-ghost" onClick={() => setShowProfile(true)} title="Edit your saved business details">
            Business Profile
          </button>
          <button className="btn-ghost" onClick={() => setShowDefaults(true)} title="Edit default values used for new bills">
            Defaults
          </button>
          <CloudSync onAfterRestore={refreshFromStorage} onSignOut={handleSignOut} flash={flash} />
          <button className="btn-ghost" onClick={handleSave}>Save</button>
          <button className="btn-ghost" onClick={handlePrint}>Print</button>
          <div className="download-wrap">
            <button
              className="btn btn-primary"
              onClick={() => setShowDownload((s) => !s)}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : 'Download ▾'}
            </button>
            {showDownload && (
              <>
                <div className="download-backdrop" onClick={() => setShowDownload(false)} />
                <div className="download-menu">
                  <button onClick={handlePDF}>
                    <span className="dl-ico">📄</span> PDF document
                  </button>
                  <button onClick={handleExcel}>
                    <span className="dl-ico">📊</span> Excel spreadsheet
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mobile-tabs no-print">
        <button className={mobileView === 'edit' ? 'active' : ''} onClick={() => setMobileView('edit')}>Edit</button>
        <button className={mobileView === 'preview' ? 'active' : ''} onClick={() => setMobileView('preview')}>Preview</button>
      </div>

      <main className="layout">
        <div className={'pane editor-pane no-print ' + (mobileView === 'edit' ? 'show' : 'hide')}>
          <Editor doc={doc} update={setDoc} clients={clients} onPickClient={pickClient} savedDocs={savedDocs} onBusinessChange={handleBusinessChange} />
        </div>
        <div className={'pane preview-pane ' + (mobileView === 'preview' ? 'show' : 'hide')}>
          <div className="preview-scroll">
            <DocumentPreview doc={doc} ref={previewRef} />
          </div>
        </div>
      </main>

      {showSaved && (
        <SavedModal
          docs={savedDocs}
          onClose={() => setShowSaved(false)}
          onLoad={handleLoad}
          onDelete={handleDelete}
          onImport={handleImportBills}
          onImportDoc={handleImportDoc}
          onExport={handleExportData}
        />
      )}

      {onboard === 'welcome' && (
        <WelcomeModal
          onSignIn={handleWelcomeSignIn}
          onManual={() => setOnboard('profile')}
          mandatory={gdriveConfigured()}
          busy={onboarding}
        />
      )}

      {(showProfile || onboard === 'profile') && (
        <BusinessProfileModal
          business={getBusiness() || doc.business}
          firstRun={onboard === 'profile'}
          onSave={handleProfileSave}
          onClose={() => setShowProfile(false)}
        />
      )}

      {showDefaults && (
        <DefaultsModal
          fields={DEFAULT_FIELDS}
          builtins={BUILTIN_DEFAULTS}
          values={getDefaults()}
          onSave={handleDefaultsSave}
          onClose={() => setShowDefaults(false)}
        />
      )}

      {toast && <div className="toast no-print">{toast}</div>}
    </div>
  )
}
