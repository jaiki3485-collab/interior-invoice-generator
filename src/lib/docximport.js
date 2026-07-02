// Import bills from a Word (.docx) quotation/invoice like the Krishna Furniture
// format: a header, a "To," + client name, an optional "Site:" and "DATE:",
// then a single table with columns [Sr.no., Description, Qty, Amount] where
// bold rows with an empty Qty & Amount are section headings (room names).
//
// Only the table + client details are imported. The current business profile
// is preserved by the caller (this module never sets a business identity).

import JSZip from 'jszip'
import { buildDocFromRows } from './tableimport'

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

  // Table -> rows -> shared builder (handles header detection, sections, items).
  const rows = firstTableRows(xml)
  return buildDocFromRows(rows, { type, date, site, clientName })
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
