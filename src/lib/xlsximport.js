// Import a bill from an Excel BoQ/quotation. Excel already has real rows and
// columns, so we simply read the first non-empty sheet into a 2-D array of cell
// strings and hand it to the shared table builder (which finds the header,
// groups sections by a Location/Room column or heading rows, and maps items).

import * as XLSX from 'xlsx'
import { buildDocFromRows } from './tableimport'

// Public API: parse an .xlsx/.xls File/Blob/ArrayBuffer into an app document.
export async function parseExcelToDocument(input) {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  // Pick the first sheet that actually has data.
  let rows = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
    const nonEmpty = grid.filter((r) => r.some((c) => String(c).trim()))
    if (nonEmpty.length) { rows = grid; break }
  }
  if (!rows.length) throw new Error('Could not read any rows from this Excel file')

  const flat = rows.map((r) => r.join(' ')).join('\n')
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

  return buildDocFromRows(rows, { type, date, site })
}
