// Shared "table of rows -> app document" builder used by every importer
// (Word .docx, PDF and Excel). Each importer is responsible for turning its
// file into a simple 2-D array of cell strings (`rows`); this module then:
//   * finds the header row and maps columns by their labels
//   * groups line items into sections, either by a "Location/Room" column
//     (carried forward when blank, BoQ-style) or by heading-only rows
//   * maps cells onto our item schema (particulars, quantity, rate, cost, scope)
//
// The current business profile is preserved by the caller — importers never set
// a business identity.

import { newDoc, emptyItem } from './defaults'
import { getDefaults } from './storage'
import { uid } from './format'

function norm(v) {
  return (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim()
}

// Quantity: keep the raw value but drop obvious placeholders.
function cleanQty(v) {
  const t = norm(v)
  if (!t || t === '=' || t === '-') return ''
  return t
}

// Money: strip currency symbols/commas, keep digits and a decimal point.
function cleanAmount(v) {
  return norm(v).replace(/[^0-9.]/g, '')
}

// True when the description cell is *only* a running-total keyword (e.g.
// "Total", "Sub Total", "Grand Total") — such rows are summaries, not items.
// Anchoring to the whole cell keeps real items like "Printing Total Station".
function isTotalKeyword(desc) {
  return /^(sub[\s-]?total|grand\s*total|total)\b[:.\s]*$/i.test(norm(desc))
}

// Locate the header row + resolve column indexes from its labels. Falls back to
// Ordered synonym patterns for each logical column. Order matters only within
// the scoring below; the assignment step guarantees each header cell maps to at
// most one field and each field to at most one column, so overlapping words
// (e.g. "unit rate" vs "total amount") resolve to their best fit rather than
// clashing. Add new spellings here as more bill formats appear.
const COLUMN_SYNONYMS = {
  location: [/^location$/, /^room$/, /^area$/, /^section$/, /^zone$/, /^space$/, /^floor$/, /location|room\b|area\b|section|zone|space/],
  sno: [/^s\.?\s*no\.?$/, /^sr\.?\s*no\.?$/, /^sl\.?\s*no\.?$/, /^#$/, /^sno$/, /^no\.?$/, /serial|s\.?\s*no|sr\.?\s*no|sl\.?\s*no/],
  desc: [/^description$/, /^particulars?$/, /^item$/, /^work$/, /^scope of work$/, /descriptio|particular|item\s*name|item\b|work|activity|nomenclature|detail/],
  qty: [/^qty\.?$/, /^quantity$/, /^nos\.?$/, /^units?$/, /qty|quantity|\bnos\.?\b|\bno of\b|\bunits?\b|sq\.?\s*ft|sqft|running\s*ft|\brft\b|\bsft\b/],
  rate: [/^rate$/, /^price$/, /^unit\s*rate$/, /^unit\s*price$/, /^rate\/unit$/, /rate|price|unit\s*cost|per\s*unit|rate\s*per/],
  amount: [/^amount$/, /^cost$/, /^total$/, /^total\s*amount$/, /^value$/, /^price$/, /amount|cost|total|value|sub\s*total|line\s*total/],
  remarks: [/^remarks?$/, /^scope$/, /^notes?$/, /^description$/, /^details?$/, /^specification$/, /remark|scope|note|specificat|comment|finish/],
}

// Score how well a header label matches a field's synonym list: an exact
// (anchored) match beats a loose substring match, so "Amount" wins the amount
// column even if another column merely contains the word "amount".
function scoreLabel(label, patterns) {
  const t = label.toLowerCase().trim()
  if (!t) return 0
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(t)) {
      // Anchored patterns (exact-ish) sit first in each list -> higher score.
      const anchored = patterns[i].source.startsWith('^')
      return anchored ? 100 - i : 40 - i
    }
  }
  return 0
}

// Assign header columns to logical fields without collisions: build every
// (field, columnIndex, score) candidate, then greedily take the highest scores,
// skipping fields/columns already used. This tolerates arbitrary column orders
// and unknown extra columns.
function assignColumns(headerCells) {
  const labels = headerCells.map((c) => norm(c))
  const candidates = []
  for (const field of Object.keys(COLUMN_SYNONYMS)) {
    for (let ci = 0; ci < labels.length; ci++) {
      const s = scoreLabel(labels[ci], COLUMN_SYNONYMS[field])
      if (s > 0) candidates.push({ field, ci, s })
    }
  }
  candidates.sort((a, b) => b.s - a.s)
  const col = { location: -1, sno: -1, desc: -1, qty: -1, rate: -1, amount: -1, remarks: -1 }
  const usedCol = new Set()
  for (const c of candidates) {
    if (col[c.field] >= 0 || usedCol.has(c.ci)) continue
    col[c.field] = c.ci
    usedCol.add(c.ci)
  }
  return col
}

// A header row is any row that names at least a description-like column AND a
// numeric column (qty/amount/rate) — enough to trust the mapping.
function looksLikeHeader(cells) {
  const col = assignColumns(cells)
  return col.desc >= 0 && (col.qty >= 0 || col.amount >= 0 || col.rate >= 0)
}

// Locate the header row + resolve column indexes from its labels. Falls back to
// sensible positional defaults when no header is recognised.
function resolveColumns(rows) {
  const headerIdx = rows.findIndex((r) => looksLikeHeader(r))
  if (headerIdx < 0) {
    // No recognisable header: assume [., description, qty, ., amount] layout.
    return { headerIdx, col: { location: -1, sno: 0, desc: 1, qty: 2, rate: -1, amount: 3, remarks: -1 } }
  }
  const col = assignColumns(rows[headerIdx])
  if (col.desc < 0) col.desc = 1 // safety net; header matched but desc slipped
  return { headerIdx, col }
}

// Build sections + items from the resolved table.
function rowsToSections(rows, headerIdx, col) {
  const dataRows = rows.slice(headerIdx >= 0 ? headerIdx + 1 : 0)
  const sections = []
  let current = null
  const pushSection = (name) => { current = { id: uid(), name: name || 'Items', items: [] }; sections.push(current) }

  const useLocation = col.location >= 0
  let hasRate = false

  for (const r of dataRows) {
    const loc = col.location >= 0 ? norm(r[col.location]) : ''
    const desc = norm(r[col.desc])
    const qty = cleanQty(r[col.qty])
    const rate = col.rate >= 0 ? cleanAmount(r[col.rate]) : ''
    const amount = col.amount >= 0 ? cleanAmount(r[col.amount]) : ''
    const remarks = col.remarks >= 0 ? norm(r[col.remarks]) : ''

    // Skip fully blank spacer rows and any running-total line (named or bare).
    if (!loc && !desc && !qty && !amount && !remarks) continue
    if (isTotalKeyword(desc)) continue

    if (useLocation) {
      // A new, non-empty Location starts a new section (carried forward while
      // blank so subsequent items stay under the same room).
      if (loc && (!current || current.name.toLowerCase() !== loc.toLowerCase())) {
        pushSection(loc)
      }
      // Real line items need a description; this skips location-only rows and
      // bare total figures (an amount with no description).
      if (!desc) continue
      if (!current) pushSection('Items')
    } else {
      // Heading-row mode: a row with only a description names a section.
      const isHeading = desc && !qty && !amount
      if (isHeading) { pushSection(desc); continue }
      if (!desc) continue
      if (!current) pushSection('Items')
    }

    if (rate) hasRate = true
    current.items.push({
      ...emptyItem(),
      particulars: desc,
      quantity: qty,
      rate,
      cost: amount,
      scope: remarks,
    })
  }

  if (!sections.length) pushSection('Items')
  for (const s of sections) if (!s.items.length) s.items.push(emptyItem())
  return { sections, hasRate }
}

// Public: turn a 2-D array of cell strings + optional metadata into a document.
export function buildDocFromRows(rows, meta = {}) {
  const clean = (rows || []).map((r) => (Array.isArray(r) ? r.map(norm) : []))
  const { headerIdx, col } = resolveColumns(clean)
  const { sections, hasRate } = rowsToSections(clean, headerIdx, col)

  const doc = newDoc(meta.type || 'quotation', getDefaults())
  doc.id = uid()
  if (meta.date) doc.date = meta.date
  // Only show the Rate column when the source actually carried rate values.
  doc.showRate = hasRate
  doc.sections = sections
  doc.client = {
    ...doc.client,
    name: meta.clientName || 'Imported Client',
    address: meta.site || '',
  }
  doc.savedAt = new Date().toISOString()
  return doc
}

// Exposed so the PDF importer can reuse the exact same header detection when
// locating the table's header row among positioned text.
export function isHeaderRow(cells) {
  return looksLikeHeader((cells || []).map(norm))
}
