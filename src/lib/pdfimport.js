// Import a bill from a PDF BoQ/quotation like the "CSN Carpentry Boq" sample:
// a bordered table with columns [Location, S No, Description, Qty, Rate,
// Amount, Remarks] where Location acts as a row-span that names each section.
//
// PDFs have no table structure — only positioned text — so we reconstruct the
// grid ourselves: cluster text items into rows by their Y position, infer
// column boundaries from the header row's X positions, then drop each cell into
// the column whose X-range it falls in. The resulting 2-D array is handed to the
// shared table builder.

import { buildDocFromRows, isHeaderRow } from './tableimport'

let pdfjsLib = null
// Lazy-load pdf.js (and point it at its worker) only when a PDF is imported, so
// the ~1 MB library never bloats the initial app bundle.
async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib
  const lib = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  pdfjsLib = lib
  return lib
}

// Collect every text fragment on a page with its X/Y and width.
async function pageItems(page) {
  const content = await page.getTextContent()
  const items = []
  for (const it of content.items) {
    const str = (it.str || '')
    if (!str.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    items.push({ str, x, y, w: it.width || 0 })
  }
  return items
}

// Group fragments that share (roughly) the same baseline into rows, top-to-bottom.
function clusterRows(items, tol = 4) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows = []
  for (const it of sorted) {
    let row = rows.find((r) => Math.abs(r.y - it.y) <= tol)
    if (!row) { row = { y: it.y, items: [] }; rows.push(row) }
    row.items.push(it)
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x)
  return rows
}

// Merge fragments that belong to the same cell (small horizontal gaps) into one
// string positioned at the fragment's start X.
function mergeCells(rowItems, gap = 14) {
  const cells = []
  let cur = null
  for (const it of rowItems) {
    if (cur && it.x - (cur.x + cur.w) <= gap) {
      cur.str += ' ' + it.str
      cur.w = (it.x + it.w) - cur.x
    } else {
      cur = { str: it.str, x: it.x, w: it.w }
      cells.push(cur)
    }
  }
  return cells.map((c) => ({ str: c.str.replace(/\s+/g, ' ').trim(), x: c.x }))
}

// Find the header row's cells so we can learn the column X-anchors. Reuses the
// shared header detection so any recognised column spelling works here too.
function findHeader(rowCells) {
  for (let i = 0; i < rowCells.length; i++) {
    if (isHeaderRow(rowCells[i].map((c) => c.str))) return i
  }
  return -1
}

// Assign a cell to a column by choosing the header anchor nearest its start X.
function toColumns(cells, anchors) {
  const out = new Array(anchors.length).fill('')
  for (const c of cells) {
    let best = 0, bestD = Infinity
    for (let i = 0; i < anchors.length; i++) {
      const d = Math.abs(c.x - anchors[i])
      if (d < bestD) { bestD = d; best = i }
    }
    out[best] = out[best] ? out[best] + ' ' + c.str : c.str
  }
  return out.map((s) => s.trim())
}

function buildRows(allRowCells) {
  const headerIdx = findHeader(allRowCells)
  if (headerIdx < 0) {
    // No recognisable header: fall back to whitespace-joined rows so the shared
    // builder can still try positional defaults.
    return allRowCells.map((cells) => cells.map((c) => c.str))
  }
  const anchors = allRowCells[headerIdx].map((c) => c.x)
  const labels = allRowCells[headerIdx].map((c) => c.str)
  const rows = [labels]
  for (let i = headerIdx + 1; i < allRowCells.length; i++) {
    rows.push(toColumns(allRowCells[i], anchors))
  }
  return rows
}

// Public API: parse a PDF File/Blob/ArrayBuffer into an app document.
export async function parsePdfToDocument(input) {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer()
  const lib = await getPdfjs()
  const pdf = await lib.getDocument({ data: buf }).promise

  // Gather positioned text across all pages, keeping page order (each page's Y
  // is independent, so we cluster rows per page then concatenate).
  const allRowCells = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const items = await pageItems(page)
    const rows = clusterRows(items)
    for (const r of rows) allRowCells.push(mergeCells(r.items))
  }
  if (!allRowCells.length) throw new Error('Could not read any text from this PDF')

  // Document metadata from the page text (title => type, any DATE:, Site:).
  const flat = allRowCells.map((cells) => cells.map((c) => c.str).join(' ')).join('\n')
  const type = /\bINVOICE\b/i.test(flat) ? 'invoice' : 'quotation'
  let date = ''
  const dm = flat.match(/DATE\s*[:\-]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4})/i)
  if (dm) {
    const parts = dm[1].split(/[\/.\-]/).map((n) => parseInt(n, 10))
    if (parts.length === 3) {
      let [d, mo, y] = parts
      if (y < 100) y += 2000
      const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (!Number.isNaN(Date.parse(iso))) date = iso
    }
  }
  let site = ''
  const sm = flat.match(/Site\s*[:\-]\s*(.+)/i)
  if (sm) site = sm[1].split('\n')[0].replace(/\.$/, '').trim()

  const rows = buildRows(allRowCells)
  return buildDocFromRows(rows, { type, date, site })
}
