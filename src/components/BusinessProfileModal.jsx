import React, { useRef, useState } from 'react'

function LogoUpload({ value, onChange }) {
  const ref = useRef(null)
  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result)
    reader.readAsDataURL(file)
  }
  return (
    <div className="img-upload">
      {value ? (
        <div className="img-preview">
          <img src={value} alt="Logo" />
          <button type="button" onClick={() => onChange('')}>Remove</button>
        </div>
      ) : (
        <button type="button" className="btn-ghost" onClick={() => ref.current.click()}>
          Upload Logo
        </button>
      )}
      <input type="file" accept="image/*" ref={ref} hidden onChange={handleFile} />
    </div>
  )
}

// One-time business account setup (also reusable for editing later).
export default function BusinessProfileModal({ business, onSave, onClose, firstRun }) {
  const [form, setForm] = useState(() => ({
    name: '', logo: '', address: '', phone: '', email: '', website: '', gstin: '',
    ...business,
  }))
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  function handleSubmit(e) {
    e.preventDefault()
    onSave(form)
  }

  return (
    <div className="modal-backdrop" onClick={firstRun ? undefined : onClose}>
      <form className="modal profile-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>{firstRun ? 'Set up your business account' : 'Business Profile'}</h3>
          {!firstRun && <button type="button" className="btn-ghost" onClick={onClose}>✕</button>}
        </div>

        {firstRun && (
          <p className="doc-muted profile-intro">
            Enter your business details once. Your logo, address and other info will be
            reused on every quotation and invoice you create.
          </p>
        )}

        <LogoUpload value={form.logo} onChange={(v) => set('logo', v)} />

        <label className="field">
          <span>Business Name</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. JM Interiors" autoFocus />
        </label>
        <label className="field">
          <span>Address</span>
          <textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, City, State - PIN" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Phone</span>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </label>
          <label className="field">
            <span>Website</span>
            <input value={form.website} onChange={(e) => set('website', e.target.value)} />
          </label>
          <label className="field">
            <span>GSTIN</span>
            <input value={form.gstin} onChange={(e) => set('gstin', e.target.value)} />
          </label>
        </div>

        <div className="profile-actions">
          {!firstRun && <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>}
          <button type="submit" className="btn btn-primary">
            {firstRun ? 'Save & Continue' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
