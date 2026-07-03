import React, { useRef, useMemo } from 'react'
import { ROOM_PRESETS, PARTICULARS_PRESETS, SCOPE_PRESETS, emptyItem, emptySection, THEMES } from '../lib/defaults'
import { fmt, uid } from '../lib/format'
import { itemCost, sectionTotal } from '../lib/calc'

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function ImageUpload({ value, onChange, label }) {
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
          <img src={value} alt={label} />
          <button type="button" onClick={() => onChange('')}>Remove</button>
        </div>
      ) : (
        <button type="button" className="btn-ghost" onClick={() => ref.current.click()}>
          Upload {label}
        </button>
      )}
      <input type="file" accept="image/*" ref={ref} hidden onChange={handleFile} />
    </div>
  )
}

export default function Editor({ doc, update, clients, onPickClient, savedDocs = [], onBusinessChange }) {
  // Auto-suggestions: curated presets + values already typed in this document
  // (so frequently-used particulars/scopes are remembered as you go).
  const { particularsOptions, scopeOptions } = useMemo(() => {
    const allSections = [...(doc.sections || []), ...(doc.otherSections || [])]
    const pSet = new Set(PARTICULARS_PRESETS)
    const sSet = new Set(SCOPE_PRESETS)
    allSections.forEach((sec) =>
      (sec.items || []).forEach((it) => {
        if (it.particulars && it.particulars.trim()) pSet.add(it.particulars.trim())
        if (it.scope && it.scope.trim()) sSet.add(it.scope.trim())
      }),
    )
    const byAlpha = (a, b) => a.localeCompare(b)
    return {
      particularsOptions: [...pSet].sort(byAlpha),
      scopeOptions: [...sSet].sort(byAlpha),
    }
  }, [doc.sections, doc.otherSections])

  // Helpers to update nested slices immutably
  const setField = (key, value) => update({ ...doc, [key]: value })
  // Editing any "Your Business" field updates the current doc AND persists the
  // value as the saved profile (so future new bills reuse it). Falls back to a
  // plain doc update if no persist handler was provided.
  const setBusiness = (key, value) => {
    const business = { ...doc.business, [key]: value }
    if (onBusinessChange) onBusinessChange(business)
    else update({ ...doc, business })
  }
  const setClient = (key, value) =>
    update({ ...doc, client: { ...doc.client, [key]: value } })

  const setItem = (key, sectionId, itemId, field, value) =>
    update({
      ...doc,
      [key]: doc[key].map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              items: sec.items.map((it) =>
                it.id === itemId ? { ...it, [field]: value } : it,
              ),
            }
          : sec,
      ),
    })

  const setSection = (key, sectionId, field, value) =>
    update({
      ...doc,
      [key]: doc[key].map((sec) =>
        sec.id === sectionId ? { ...sec, [field]: value } : sec,
      ),
    })

  const addItem = (key, sectionId) =>
    update({
      ...doc,
      [key]: doc[key].map((sec) =>
        sec.id === sectionId ? { ...sec, items: [...sec.items, emptyItem()] } : sec,
      ),
    })

  const removeItem = (key, sectionId, itemId) =>
    update({
      ...doc,
      [key]: doc[key].map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: sec.items.filter((it) => it.id !== itemId) }
          : sec,
      ),
    })

  const moveItem = (key, sectionId, idx, dir) =>
    update({
      ...doc,
      [key]: doc[key].map((sec) => {
        if (sec.id !== sectionId) return sec
        const items = [...sec.items]
        const target = idx + dir
        if (target < 0 || target >= items.length) return sec
        ;[items[idx], items[target]] = [items[target], items[idx]]
        return { ...sec, items }
      }),
    })

  const addSection = (key, name = '') =>
    update({ ...doc, [key]: [...doc[key], emptySection(name)] })

  const removeSection = (key, sectionId) =>
    update({ ...doc, [key]: doc[key].filter((s) => s.id !== sectionId) })

  const moveSection = (key, idx, dir) => {
    const sections = [...doc[key]]
    const target = idx + dir
    if (target < 0 || target >= sections.length) return
    ;[sections[idx], sections[target]] = [sections[target], sections[idx]]
    update({ ...doc, [key]: sections })
  }

  // Copy the rooms/items (particulars) from a previously saved bill into the
  // current one. Non-destructive: the copied rooms are appended with fresh ids
  // so nothing you've already entered is lost. Empty default rooms (a single
  // untouched row) are dropped so you don't end up with a blank leading room.
  const cloneSections = (sections = []) =>
    sections.map((sec) => ({
      id: uid(),
      name: sec.name || '',
      items: (sec.items && sec.items.length ? sec.items : [emptyItem()]).map((it) => ({
        id: uid(),
        particulars: it.particulars || '',
        quantity: it.quantity ?? '',
        rate: it.rate ?? '',
        cost: it.cost ?? '',
        scope: it.scope || '',
      })),
    }))

  const isBlankSection = (sec) =>
    (!sec.name || !sec.name.trim()) &&
    (sec.items || []).every((it) =>
      !it.particulars?.trim() && (it.quantity === '' || it.quantity == null) &&
      (it.rate === '' || it.rate == null) && (it.cost === '' || it.cost == null) && !it.scope?.trim())

  const copyFromBill = (sourceId) => {
    const src = savedDocs.find((d) => d.id === sourceId)
    if (!src) return
    const patch = { ...doc }
    const curMain = (doc.sections || []).filter((s) => !isBlankSection(s))
    patch.sections = [...curMain, ...cloneSections(src.sections || [])]
    if (Array.isArray(src.otherSections) && src.otherSections.length) {
      const curOther = (doc.otherSections || []).filter((s) => !isBlankSection(s))
      patch.otherSections = [...curOther, ...cloneSections(src.otherSections)]
      patch.showOther = true
      if (src.otherCategory) patch.otherCategory = src.otherCategory
    }
    update(patch)
  }

  const renderSections = (key) => (
    <>
      {doc[key].map((section, sIdx) => (
        <div className="section-edit" key={section.id}>
          <div className="section-edit-head">
            <input
              className="section-name-input"
              value={section.name}
              onChange={(e) => setSection(key, section.id, 'name', e.target.value)}
              placeholder="Room name (e.g. Kitchen)"
              list="room-presets"
            />
            <span className="section-total-chip">{fmt(sectionTotal(section), doc.currency)}</span>
            <div className="item-actions">
              <button type="button" title="Move section up" onClick={() => moveSection(key, sIdx, -1)}>↑</button>
              <button type="button" title="Move section down" onClick={() => moveSection(key, sIdx, 1)}>↓</button>
              <button type="button" className="danger" title="Remove room"
                onClick={() => removeSection(key, section.id)} disabled={doc[key].length === 1}>✕</button>
            </div>
          </div>

          {section.items.map((item, idx) => {
            const hasRate = Number(item.rate) > 0
            return (
              <div className="item-row" key={item.id}>
                <div className="item-row-head">
                  <span className="item-index">#{idx + 1}</span>
                  <div className="item-actions">
                    <button type="button" title="Move up" onClick={() => moveItem(key, section.id, idx, -1)}>↑</button>
                    <button type="button" title="Move down" onClick={() => moveItem(key, section.id, idx, 1)}>↓</button>
                    <button type="button" className="danger" title="Remove"
                      onClick={() => removeItem(key, section.id, item.id)} disabled={section.items.length === 1}>✕</button>
                  </div>
                </div>
                <Field label="Particulars">
                  <input value={item.particulars} onChange={(e) => setItem(key, section.id, item.id, 'particulars', e.target.value)} placeholder="e.g. Tandem Trolley" list="particulars-presets" />
                </Field>
                <div className="grid-4">
                  <Field label="Quantity">
                    <input type="number" min="0" step="any" onWheel={(e) => e.target.blur()} value={item.quantity} onChange={(e) => setItem(key, section.id, item.id, 'quantity', e.target.value)} />
                  </Field>
                  {doc.showRate && (
                    <Field label="Rate (optional)">
                      <input className="no-spin" type="number" min="0" step="any" onWheel={(e) => e.target.blur()} value={item.rate} onChange={(e) => setItem(key, section.id, item.id, 'rate', e.target.value)} />
                    </Field>
                  )}
                  <Field label={hasRate ? 'Cost (auto)' : 'Cost'}>
                    <input
                      className="no-spin"
                      type="number" min="0" step="any"
                      onWheel={(e) => e.target.blur()}
                      value={hasRate ? itemCost(item) : item.cost}
                      readOnly={hasRate}
                      title={hasRate ? 'Quantity × Rate' : 'Enter cost manually'}
                      onChange={(e) => setItem(key, section.id, item.id, 'cost', e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Scope">
                  <input value={item.scope} onChange={(e) => setItem(key, section.id, item.id, 'scope', e.target.value)} placeholder="e.g. Onyx fittings" list="scope-presets" />
                </Field>
              </div>
            )
          })}
          <div className="item-add-row">
            <button type="button" className="btn" onClick={() => addItem(key, section.id)}>+ Add Item</button>
          </div>
        </div>
      ))}

      <div className="item-add-row">
        <button type="button" className="btn btn-primary" onClick={() => addSection(key, '')}>+ Add Room</button>
      </div>
      <div className="sample-chips">
        <span className="doc-muted">Quick add room:</span>
        {ROOM_PRESETS.map((r) => (
          <button type="button" key={r} className="chip" onClick={() => addSection(key, r)}>
            {r}
          </button>
        ))}
      </div>
    </>
  )

  const billLabel = (b) => {
    const who = b.client?.name?.trim() || 'Untitled'
    const type = b.type === 'invoice' ? 'Invoice' : 'Quotation'
    return `${who} — ${type}${b.date ? ' · ' + b.date : ''}`
  }

  // Saved bills (other than the one being edited) that actually have line items
  // worth copying.
  const copyableBills = useMemo(() => {
    const hasItems = (secs) => Array.isArray(secs) && secs.some((s) =>
      (s.items || []).some((it) => (it.particulars || '').trim()))
    return (savedDocs || []).filter((b) =>
      b && b.id !== doc.id && (hasItems(b.sections) || hasItems(b.otherSections)))
  }, [savedDocs, doc.id])

  return (
    <div className="editor">
      {/* Document type & meta */}
      <section className="card">
        <h3>Document</h3>
        <div className="type-toggle">
          <button
            className={doc.type === 'invoice' ? 'active' : ''}
            onClick={() => setField('type', 'invoice')}
          >Invoice</button>
          <button
            className={doc.type === 'quotation' ? 'active' : ''}
            onClick={() => update({ ...doc, type: 'quotation', showPO: false })}
          >Quotation</button>
        </div>
        <div className="grid-2">
          <Field label="Date">
            <input type="date" value={doc.date} onChange={(e) => setField('date', e.target.value)} />
          </Field>
          <Field label="Theme Color">
            <select value={doc.theme} onChange={(e) => setField('theme', e.target.value)}>
              {Object.entries(THEMES).map(([k, t]) => (
                <option key={k} value={k}>{t.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {doc.type === 'invoice' && (
          <>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!doc.showPO}
                onChange={(e) => setField('showPO', e.target.checked)}
              />
              Add PO Number
            </label>
            {doc.showPO && (
              <Field label="PO Number">
                <input value={doc.poNumber} onChange={(e) => setField('poNumber', e.target.value)} />
              </Field>
            )}
          </>
        )}
      </section>

      {/* Business */}
      <section className="card">
        <h3>Your Business</h3>
        <ImageUpload label="Logo" value={doc.business.logo} onChange={(v) => setBusiness('logo', v)} />
        <Field label="Business Name">
          <input value={doc.business.name} onChange={(e) => setBusiness('name', e.target.value)} />
        </Field>
        <Field label="Address">
          <textarea rows={2} value={doc.business.address} onChange={(e) => setBusiness('address', e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label="Phone">
            <input value={doc.business.phone} onChange={(e) => setBusiness('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <input value={doc.business.email} onChange={(e) => setBusiness('email', e.target.value)} />
          </Field>
          <Field label="Website">
            <input value={doc.business.website} onChange={(e) => setBusiness('website', e.target.value)} />
          </Field>
          <Field label="GSTIN">
            <input value={doc.business.gstin} onChange={(e) => setBusiness('gstin', e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Client */}
      <section className="card">
        <h3>{doc.type === 'invoice' ? 'Bill To (Client)' : 'Quotation For (Client)'}</h3>
        {clients.length > 0 && (
          <Field label="Pick saved client">
            <select
              value=""
              onChange={(e) => {
                const c = clients.find((x) => x.name === e.target.value)
                if (c) onPickClient(c)
              }}
            >
              <option value="">— Select —</option>
              {clients.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Client Name">
          <input value={doc.client.name} onChange={(e) => setClient('name', e.target.value)} />
        </Field>
        <Field label="Address">
          <textarea rows={2} value={doc.client.address} onChange={(e) => setClient('address', e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label="Phone">
            <input value={doc.client.phone} onChange={(e) => setClient('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <input value={doc.client.email} onChange={(e) => setClient('email', e.target.value)} />
          </Field>
          <Field label="GSTIN">
            <input value={doc.client.gstin} onChange={(e) => setClient('gstin', e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Sections (rooms) */}
      <section className="card">
        <h3>Rooms & Items</h3>
        <div className="grid-2">
          <Field label="Category Heading">
            <input value={doc.category} onChange={(e) => setField('category', e.target.value)} placeholder="e.g. FURNITURE" />
          </Field>
          <label className="checkbox" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={doc.showRate} onChange={(e) => setField('showRate', e.target.checked)} />
            Show Rate column
          </label>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={doc.showTotals !== false} onChange={(e) => setField('showTotals', e.target.checked)} />
          Show totals (section totals, total site cost & amount in words)
        </label>
        <div className="grid-2">
          <label className="checkbox" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={doc.showGST === true} onChange={(e) => setField('showGST', e.target.checked)} disabled={doc.showTotals === false} />
            Add GST rows (GST on total & total incl. GST)
          </label>
          {doc.showGST && (
            <Field label="GST rate (%)">
              <input type="number" min="0" step="any" className="no-spin" onWheel={(e) => e.target.blur()} value={doc.gstRate ?? 18} onChange={(e) => setField('gstRate', e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
          )}
        </div>

        {copyableBills.length > 0 && (
          <Field label="Copy rooms & items from a saved bill">
            <select
              value=""
              onChange={(e) => { if (e.target.value) copyFromBill(e.target.value); e.target.value = '' }}
            >
              <option value="">— Select a bill to copy from —</option>
              {copyableBills.map((b) => (
                <option key={b.id} value={b.id}>{billLabel(b)}</option>
              ))}
            </select>
          </Field>
        )}

        {renderSections('sections')}

        <datalist id="room-presets">
          {ROOM_PRESETS.map((r) => <option key={r} value={r} />)}
        </datalist>
        <datalist id="particulars-presets">
          {particularsOptions.map((p) => <option key={p} value={p} />)}
        </datalist>
        <datalist id="scope-presets">
          {scopeOptions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </section>

      {/* Other Services (optional second category) */}
      <section className="card">
        <h3>
          Other Services
          <label className="checkbox inline">
            <input type="checkbox" checked={!!doc.showOther} onChange={(e) => setField('showOther', e.target.checked)} />
            Add category
          </label>
        </h3>
        {doc.showOther && (
          <>
            <Field label="Category Heading">
              <input
                value={doc.otherCategory}
                onChange={(e) => setField('otherCategory', e.target.value)}
                placeholder="e.g. OTHER SERVICES"
              />
            </Field>
            {renderSections('otherSections')}
            <div className="sample-chips">
              <span className="doc-muted">Quick add:</span>
              {['Painting', 'Electrical Fitting', 'False Ceiling', 'Plumbing', 'Civil Work'].map((r) => (
                <button type="button" key={r} className="chip" onClick={() => addSection('otherSections', r)}>
                  {r}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Transportation (optional charge added above the total) */}
      <section className="card">
        <h3>
          Transportation
          <label className="checkbox inline">
            <input type="checkbox" checked={!!doc.showTransport} onChange={(e) => setField('showTransport', e.target.checked)} />
            Add charge
          </label>
        </h3>
        {doc.showTransport && (
          <Field label="Transportation Amount">
            <input
              type="number" min="0" step="any"
              onWheel={(e) => e.target.blur()}
              value={doc.transport}
              onChange={(e) => setField('transport', e.target.value)}
              placeholder="e.g. 2500"
            />
          </Field>
        )}
      </section>

      {/* Notes / Terms / Signature */}
      <section className="card">
        <h3>Notes, Terms & Signature</h3>
        <Field label="Notes">
          <textarea rows={2} value={doc.notes} onChange={(e) => setField('notes', e.target.value)} />
        </Field>
        <Field label="Terms & Conditions">
          <textarea rows={4} value={doc.terms} onChange={(e) => setField('terms', e.target.value)} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={doc.showSignature} onChange={(e) => setField('showSignature', e.target.checked)} />
          Show signature block
        </label>
        {doc.showSignature && (
          <ImageUpload label="Signature" value={doc.business.signature} onChange={(v) => setBusiness('signature', v)} />
        )}
      </section>
    </div>
  )
}
