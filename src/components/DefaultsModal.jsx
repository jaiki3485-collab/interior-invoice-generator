import React, { useState } from 'react'
import { CURRENCIES } from '../lib/format'
import { THEMES } from '../lib/defaults'

// Edit the default values applied to every new bill (Quotation / Invoice) so
// the user can change starting values (category headings, terms, notes, etc.)
// from the app instead of editing code.
export default function DefaultsModal({ fields, builtins, values, savedDocs = [], onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...builtins, ...values }))
  const [applyToCurrent, setApplyToCurrent] = useState(true)
  const [copiedFrom, setCopiedFrom] = useState('')

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const billLabel = (b) => {
    const who = b.client?.name?.trim() || 'Untitled'
    const type = b.type === 'invoice' ? 'Invoice' : 'Quotation'
    return `${who} — ${type}${b.date ? ' · ' + b.date : ''}`
  }

  // Prefill the defaults form from a previously saved bill so the user can
  // reuse its headings, terms, currency, theme and column toggles instead of
  // retyping them. Only the fields the defaults form actually manages are
  // copied; the bill's terms map onto the matching (invoice/quotation) slot.
  function applyFromBill(bill) {
    if (!bill) return
    setForm((f) => {
      const next = { ...f }
      const copyStr = (k, v) => { if (v !== undefined && v !== null && v !== '') next[k] = v }
      copyStr('category', bill.category)
      copyStr('otherCategory', bill.otherCategory)
      copyStr('currency', bill.currency)
      copyStr('theme', bill.theme)
      copyStr('notes', bill.notes)
      copyStr('defaultHsn', bill.defaultHsn)
      copyStr('maskQuantityValue', bill.maskQuantityValue)
      if (typeof bill.maskQuantity === 'boolean') next.maskQuantity = bill.maskQuantity
      if (typeof bill.showRate === 'boolean') next.showRate = bill.showRate
      if (typeof bill.showHSN === 'boolean') next.showHSN = bill.showHSN
      if (typeof bill.showUnit === 'boolean') next.showUnit = bill.showUnit
      if (typeof bill.showScope === 'boolean') next.showScope = bill.showScope
      if (typeof bill.showGST === 'boolean') next.showGST = bill.showGST
      if (typeof bill.showSignature === 'boolean') next.showSignature = bill.showSignature
      if (typeof bill.showTotals === 'boolean') next.showTotals = bill.showTotals
      if (bill.gstRate !== undefined && bill.gstRate !== null && bill.gstRate !== '') next.gstRate = bill.gstRate
      if (bill.terms) {
        if (bill.type === 'invoice') next.invoiceTerms = bill.terms
        else next.quotationTerms = bill.terms
      }
      return next
    })
    setCopiedFrom(billLabel(bill))
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave(form, { applyToCurrent })
  }

  function resetAll() {
    setForm({ ...builtins })
  }

  const renderField = (f) => {
    const val = form[f.key]
    switch (f.type) {
      case 'bool':
        return (
          <label className="checkbox" key={f.key}>
            <input type="checkbox" checked={val !== false} onChange={(e) => set(f.key, e.target.checked)} />
            {f.label}
          </label>
        )
      case 'textarea':
        return (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <textarea rows={4} value={val ?? ''} onChange={(e) => set(f.key, e.target.value)} />
          </label>
        )
      case 'number':
        return (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <input type="number" min="0" step="1" onWheel={(e) => e.target.blur()} value={val ?? ''} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
        )
      case 'currency':
        return (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <select value={val} onChange={(e) => set(f.key, e.target.value)}>
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol.trim()})</option>
              ))}
            </select>
          </label>
        )
      case 'theme':
        return (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <select value={val} onChange={(e) => set(f.key, e.target.value)}>
              {Object.entries(THEMES).map(([key, t]) => (
                <option key={key} value={key}>{t.name}</option>
              ))}
            </select>
          </label>
        )
      default:
        return (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <input value={val ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
          </label>
        )
    }
  }

  const boolFields = fields.filter((f) => f.type === 'bool')
  const otherFields = fields.filter((f) => f.type !== 'bool')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal profile-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>Default Values</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <p className="doc-muted profile-intro">
          These starting values are applied to every new Invoice / Quotation you create.
          Changing them here does not affect bills you've already saved.
        </p>

        {savedDocs.length > 0 && (
          <label className="field">
            <span>Copy defaults from a saved bill</span>
            <select
              value=""
              onChange={(e) => {
                const b = savedDocs.find((d) => d.id === e.target.value)
                if (b) applyFromBill(b)
              }}
            >
              <option value="">— Select a bill to copy from —</option>
              {savedDocs.map((b) => (
                <option key={b.id} value={b.id}>{billLabel(b)}</option>
              ))}
            </select>
            {copiedFrom && <span className="doc-muted">Filled from: {copiedFrom} · review &amp; Save Defaults</span>}
          </label>
        )}

        {otherFields.map(renderField)}

        <div className="defaults-toggles">
          {boolFields.map(renderField)}
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={applyToCurrent} onChange={(e) => setApplyToCurrent(e.target.checked)} />
          Also apply these to the bill I'm currently editing
        </label>

        <div className="profile-actions">
          <button type="button" className="btn-ghost reset-left" onClick={resetAll}>Reset to built-in</button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save Defaults</button>
        </div>
      </form>
    </div>
  )
}
