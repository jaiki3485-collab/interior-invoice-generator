// Import bills from a Word (.docx) quotation/invoice like the Krishna Furniture
// format: a header, a "To," + client name, an optional "Site:" and "DATE:",
// then a single table with columns [Sr.no., Description, Qty, Amount] where
// bold rows with an empty Qty & Amount are section headings (room names).
//
// Only the table + client details are imported. The current business profile
// is preserved by the caller (this module never sets a business identity).

import JSZip from 'jszip'
import { newDoc, emptyItem } from './defaults'
import { getDefaults } from './storage'
import { uid } from './format'

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// All text inside a fragment (concatenated <w:t> runs).
function textOf(frag) {
  const parts = frag.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []
  return unescapeXml(parts.map((p) => p.replace(/<[^>]+>/g, '')).join('')).trim()
}

// Ordered list of top-level paragraph texts that are NOT inside a table.
function paragraphTexts(xml) {
  const body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '\u0000TABLE\u0000')
  const out = []
  for (const seg of body.split('\u0000TABLE\u0000')) {
    const paras = seg.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []
    for (const p of paras) {
      const t = textOf(p)
      if (t) out.push(t)
    }
  }
  return out
}

// Parse the first table into rows of cell texts.
function firstTableRows(xml) {
  const tbl = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/) || [])[0]
  if (!tbl) return []
  const rows = tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []
  return rows.map((r) => {
    const cells = r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []
    return cells.map(textOf)
  })
}

function cleanQty(v) {
  const t = (v || '').trim()
  if (!t || t === '=' || t === '-') return ''
  return t
}

function cleanAmount(v) {
  const t = (v || '').replace(/[^0-9.]/g, '')
  return t
}

// Turn the full document XML into a doc object for the app.
function buildDocFromXml(xml) {
  const paras = paragraphTexts(xml)
  const joined = paras.join('\n')

  // Type: invoice vs quotation (default quotation; the sample says QUATATION).
  const type = /\bINVOICE\b/i.test(joined) ? 'invoice' : 'quotation'

  // Date: "DATE: 25/04/2026" -> keep as ISO if parseable, else raw.
  let date = ''
  const dm = joined.match(/DATE\s*[:\-]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4})/i)
  if (dm) {
    const parts = dm[1].split(/[\/.\-]/).map((n) => parseInt(n, 10))
    if (parts.length === 3) {
      let [d, mo, y] = parts
      if (y < 100) y += 2000
      const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (!Number.isNaN(Date.parse(iso))) date = iso
    }
  }

  // Site: "Site: Raheja Vista Premiere."
  let site = ''
  const sm = joined.match(/Site\s*[:\-]\s*(.+)/i)
  if (sm) site = sm[1].replace(/\.$/, '').trim()

  // Client name: first meaningful line after the "To," / DATE line that isn't
  // a header keyword, Site, or the document title.
  const IGNORE = /^(to,?|date\b|site\b|quat|quot|invoice|sr\.?no|description|qty|amount)/i
  let clientName = ''
  const dateIdx = paras.findIndex((p) => /DATE/i.test(p) || /^To,?$/i.test(p))
  const start = dateIdx >= 0 ? dateIdx + 1 : 0
  for (let i = start; i < paras.length; i++) {
    const t = paras[i]
    if (IGNORE.test(t)) continue
    clientName = t.replace(/,\s*$/, '').trim()
    break
  }

  // Table -> sections + items.
  const rows = firstTableRows(xml)
  // Locate header row and column indexes.
  let headerIdx = rows.findIndex((r) => r.some((c) => /description/i.test(c)) && r.some((c) => /qty|amount/i.test(c)))
  let descCol = 1, qtyCol = 2, amtCol = 3
  if (headerIdx >= 0) {
    const h = rows[headerIdx].map((c) => c.toLowerCase())
    const find = (re, dflt) => { const i = h.findIndex((c) => re.test(c)); return i >= 0 ? i : dflt }
    descCol = find(/description|particular/, 1)
    qtyCol = find(/qty|quantity/, 2)
    amtCol = find(/amount|cost|total/, 3)
  }

  const sections = []
  let current = null
  const pushSection = (name) => { current = { id: uid(), name, items: [] }; sections.push(current) }
  const dataRows = rows.slice(headerIdx >= 0 ? headerIdx + 1 : 0)
  for (const r of dataRows) {
    const desc = (r[descCol] || '').trim()
    const qty = cleanQty(r[qtyCol])
    const amt = cleanAmount(r[amtCol])
    if (!desc && !qty && !amt) continue
    const isHeading = desc && !qty && !amt
    if (isHeading) {
      pushSection(desc)
    } else if (desc || qty || amt) {
      if (!current) pushSection('Items')
      current.items.push({ ...emptyItem(), particulars: desc, quantity: qty, cost: amt })
    }
  }

  // Ensure at least one section/item so the editor renders.
  if (!sections.length) pushSection('Items')
  for (const s of sections) if (!s.items.length) s.items.push(emptyItem())

  const doc = newDoc(type, getDefaults())
  doc.id = uid()
  if (date) doc.date = date
  doc.showRate = false // source has no rate column
  doc.sections = sections
  doc.client = {
    ...doc.client,
    name: clientName || 'Imported Client',
    address: site || '',
  }
  doc.savedAt = new Date().toISOString()
  return doc
}

// Public API: parse a .docx File/Blob/ArrayBuffer into an app document.
export async function parseDocxToDocument(input) {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('Not a valid Word document')
  const xml = await file.async('string')
  return buildDocFromXml(xml)
}

// Exposed for unit testing without a zip.
export const __test = { buildDocFromXml }
