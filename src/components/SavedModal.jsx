import React, { useRef } from 'react'
import { formatDate } from '../lib/format'

export default function SavedModal({ docs, onClose, onLoad, onDelete, onImport, onImportDocx, onExport }) {
  const fileRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const name = (file.name || '').toLowerCase()
    if (name.endsWith('.docx') && onImportDocx) {
      onImportDocx(file)
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        onImport(JSON.parse(reader.result))
      } catch {
        onImport(null)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Saved Bills</h3>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        {(onImport || onExport) && (
          <div className="saved-toolbar">
            {onImport && (
              <button
                className="btn-ghost"
                onClick={() => fileRef.current.click()}
                title="Import bills from a Word (.docx) quotation or an exported data file"
              >
                ⬆ Import bills
              </button>
            )}
            {onExport && (
              <button
                className="btn-ghost"
                onClick={onExport}
                title="Download all your bills as a data file you can import elsewhere"
              >
                ⬇ Export data file
              </button>
            )}
            <input type="file" accept=".json,application/json,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" ref={fileRef} hidden onChange={handleFile} />
          </div>
        )}

        {docs.length === 0 ? (
          <p className="doc-muted">No saved bills yet. Create one and click Save, or import a data file.</p>
        ) : (
          <ul className="saved-list">
            {docs.map((d) => (
              <li key={d.id}>
                <div className="saved-info" onClick={() => onLoad(d)}>
                  <span className={'tag ' + d.type}>{d.type}</span>
                  <strong>{d.client?.name || 'Untitled'}</strong>
                  <span className="doc-muted">{formatDate(d.date)}</span>
                </div>
                <div className="saved-actions">
                  <button className="btn-ghost" onClick={() => onLoad(d)}>Open</button>
                  <button className="btn-ghost danger" onClick={() => onDelete(d.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
