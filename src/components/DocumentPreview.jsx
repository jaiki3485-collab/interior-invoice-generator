import React, { forwardRef } from 'react'
import { money, formatDate, numberToWords } from '../lib/format'
import { computeTotals, itemCost, sectionTotal, docGroups } from '../lib/calc'
import { THEMES } from '../lib/defaults'

const DocumentPreview = forwardRef(function DocumentPreview({ doc }, ref) {
  const theme = THEMES[doc.theme] || THEMES.amber
  const totals = computeTotals(doc)
  const cur = doc.currency
  const isInvoice = doc.type === 'invoice'
  const title = isInvoice ? 'INVOICE' : 'QUOTATION'
  const showRate = doc.showRate !== false
  const showTotals = doc.showTotals !== false
  const groups = docGroups(doc)

  // Columns: Sr. | Particulars | Quantity | [Rate] | Cost | Scope
  const colCount = showRate ? 6 : 5
  const beforeCost = showRate ? 4 : 3 // sr + particulars + quantity + (rate)

  // Business header lines (only the ones that have a value)
  const bizContact = [doc.business.phone, doc.business.email].filter(Boolean).join('  ·  ')

  // Client detail rows (only the ones that have a value)
  const clientContact = [doc.client.phone, doc.client.email].filter(Boolean).join('  ·  ')
  const clientRows = []
  if (doc.client.name) clientRows.push(['Client Name', doc.client.name])
  if (doc.client.address) clientRows.push(['Address', doc.client.address])
  if (clientContact) clientRows.push(['Contact', clientContact])
  if (doc.client.gstin) clientRows.push(['GSTIN', doc.client.gstin])
  clientRows.push(['Date', formatDate(doc.date)])
  if (isInvoice && doc.showPO && doc.poNumber) clientRows.push(['PO No.', doc.poNumber])

  return (
    <div className="doc-page" ref={ref} style={{ '--accent': theme.primary, '--accent-light': theme.light }}>
      {/* ---- Header (logo | company | client) ---- */}
      <div className="doc-header">
        <div className="dh-brand">
          <div className="dh-logo">
            {doc.business.logo
              ? <img src={doc.business.logo} alt="logo" className="doc-logo" />
              : <div className="hg-logo-ph">{(doc.business.name || 'LOGO').slice(0, 18)}</div>}
          </div>
          <div className="dh-biz">
            {doc.business.name && <div className="hg-name">{doc.business.name}</div>}
            {doc.business.address && <div className="hg-info hg-address">{doc.business.address}</div>}
            {(bizContact || doc.business.website) && (
              <div className="hg-info hg-contact">
                {doc.business.phone && <span className="hg-phone">{doc.business.phone}</span>}
                {doc.business.phone && doc.business.email ? <span className="hg-dot">·</span> : null}
                {doc.business.email && <span className="hg-email">{doc.business.email}</span>}
                {(doc.business.phone || doc.business.email) && doc.business.website ? <span className="hg-dot">·</span> : null}
                {doc.business.website && <span className="hg-web">{doc.business.website}</span>}
              </div>
            )}
            {doc.business.gstin && <div className="hg-info hg-strong">GSTIN: {doc.business.gstin}</div>}
          </div>
        </div>
        <div className="dh-client">
          <dl className="dh-meta">
            {clientRows.map(([lab, val]) => (
              <div className="dh-row" key={lab}>
                <dt>{lab}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* ---- Title band ---- */}
      <div className="doc-titleband">{title}</div>

      {/* ---- Section-based items table ---- */}
      <table className="doc-items doc-sections">
        <thead>
          <tr>
            <th className="c-sr">Sr.</th>
            <th className="c-desc">Particulars</th>
            <th className="c-num">Quantity</th>
            {showRate && <th className="c-num">Rate</th>}
            <th className="c-num c-amt">Cost</th>
            <th className="c-scope">Scope</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, gIdx) => (
            <React.Fragment key={gIdx}>
              {group.category && (
                <tr><th className="sec-category" colSpan={colCount}>{group.category}</th></tr>
              )}
              {group.sections.map((section) => {
                let sr = 0
                return (
                  <React.Fragment key={section.id}>
                    <tr className="sec-head">
                      <td className="sec-name" colSpan={showTotals ? beforeCost : colCount}>{section.name}</td>
                      {showTotals && (
                        <td className="sec-total" colSpan={colCount - beforeCost}>{money(sectionTotal(section), cur)}</td>
                      )}
                    </tr>
                    {section.items.map((item) => {
                      const hasRate = Number(item.rate) > 0
                      sr += 1
                      return (
                        <tr key={item.id}>
                          <td className="c-sr">{sr}</td>
                          <td className="c-desc">{item.particulars}</td>
                          <td className="c-num">{item.quantity !== '' ? item.quantity : ''}</td>
                          {showRate && <td className="c-num">{hasRate ? money(Number(item.rate), cur) : ''}</td>}
                          <td className="c-num c-amt">{money(itemCost(item), cur)}</td>
                          <td className="c-scope">{item.scope}</td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </React.Fragment>
          ))}
          {doc.showTransport && (
            <tr className="transport-row">
              <td colSpan={colCount - 1}>Transportation</td>
              <td className="c-amt">{money(totals.transport, cur)}</td>
            </tr>
          )}
          {showTotals && (
            <tr className="grand-row">
              <td colSpan={colCount - 1}>TOTAL SITE COST</td>
              <td className="c-amt">{money(totals.grandTotal, cur)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ---- Amount in words ---- */}
      {showTotals && (
        <div className="doc-bottom">
          <div className="doc-words-bank">
            <div className="doc-words">
              <span className="doc-party-label">Amount in Words</span>
              <div>{numberToWords(totals.grandTotal, cur)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Notes / Terms / Signature ---- */}
      <div className={'doc-footer' + (doc.showSignature ? '' : ' no-sign')}>
        <div className="doc-footer-text">
          {doc.notes && (
            <div className="doc-note-block">
              <span className="doc-party-label">Notes</span>
              <div className="doc-pre">{doc.notes}</div>
            </div>
          )}
          {doc.terms && (
            <div className="doc-note-block">
              <span className="doc-party-label">Terms &amp; Conditions</span>
              <div className="doc-pre">{doc.terms}</div>
            </div>
          )}
        </div>
        {doc.showSignature && (
          <div className="doc-sign">
            {doc.business.signature && (
              <img src={doc.business.signature} alt="signature" className="doc-sign-img" />
            )}
            <div className="doc-sign-name">For {doc.business.name}</div>
          </div>
        )}
      </div>
    </div>
  )
})

export default DocumentPreview
