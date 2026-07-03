import React, { useState } from 'react'
import { CURRENCIES } from '../lib/format'
import { THEMES } from '../lib/defaults'

// Edit the default values applied to every new bill (Quotation / Invoice) so
// the user can change starting values (category headings, terms, notes, etc.)
// from the app instead of editing code.
export default function DefaultsModal({ fields, builtins, values, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...builtins, ...values }))
  const [applyToCurrent, setApplyToCurrent] = useState(true)

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

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
