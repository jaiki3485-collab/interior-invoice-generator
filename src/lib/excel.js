import ExcelJS from 'exceljs'
import { computeTotals, itemCost, sectionTotal, docGroups } from './calc'
import { formatDate, numberToWords } from './format'
import { THEMES } from './defaults'

// ---- palette (mirrors the on-screen template) ----
const DARK = 'FF1F2937'
const WHITE = 'FFFFFFFF'
const GREY = 'FF6B7280'
const GREY_DK = 'FF374151'
const GREY_BG = 'FFF3F4F6'

const THIN = { style: 'thin', color: { argb: 'FF9CA3AF' } }
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN }

// Convert a #rrggbb hex (PDF theme) to ExcelJS ARGB (FFrrggbb).
function hexToArgb(hex) {
  return 'FF' + String(hex || '').replace('#', '').slice(0, 6).toUpperCase()
}

function colLetter(n) {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Build a section-based, fully styled .xlsx that mirrors the template
// (logo + company header, GSTIN, Sr.No column, borders, section bands).
export async function exportExcel(doc, filename = 'document.xlsx') {
  const totals = computeTotals(doc)
  const isInvoice = doc.type === 'invoice'
  const title = isInvoice ? 'INVOICE' : 'QUOTATION'
  const showRate = doc.showRate !== false
  const showHSN = doc.showHSN === true
  const showUnit = doc.showUnit === true
  const showScope = doc.showScope !== false
  const showTotals = doc.showTotals !== false
  const maskQty = doc.maskQuantity === true
  const maskQtyVal = doc.maskQuantityValue ?? '1'
  const money = '#,##0.00'

  // Theme-driven accent colors (mirror the PDF, which uses THEMES[doc.theme]).
  const theme = THEMES[doc.theme] || THEMES.amber
  const ACCENT = hexToArgb(theme.primary)
  const ACCENT_LT = hexToArgb(theme.light)

  const wb = new ExcelJS.Workbook()
  wb.creator = doc.business.name || 'Interior Quotation Generator'
  const ws = wb.addWorksheet(title, {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  // Column layout:  Sr | Particulars | [HSN/SAC] | Quantity | [Unit] | [Rate] | Cost | [Scope]
  const cols = ['sr', 'particulars']
  if (showHSN) cols.push('hsn')
  cols.push('quantity')
  if (showUnit) cols.push('unit')
  if (showRate) cols.push('rate')
  cols.push('cost')
  if (showScope) cols.push('scope')
  const NC = cols.length
  const C = {}
  cols.forEach((k, i) => { C[k] = i + 1 })
  const LAST = NC

  // widths
  const widthMap = { sr: 6, particulars: 34, hsn: 12, quantity: 12, unit: 10, rate: 11, cost: 14, scope: 40 }
  cols.forEach((k, i) => { ws.getColumn(i + 1).width = widthMap[k] })

  const merge = (r1, c1, r2, c2) =>
    ws.mergeCells(`${colLetter(c1)}${r1}:${colLetter(c2)}${r2}`)

  function set(r, c, val, opts = {}) {
    const cell = ws.getCell(r, c)
    if (val !== undefined) cell.value = val
    const {
      bold = false, size, color, fill, align, valign = 'middle',
      numFmt, border = true, wrap = false,
    } = opts
    cell.font = { bold, size, color: color ? { argb: color } : undefined, name: 'Calibri' }
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    cell.alignment = { horizontal: align, vertical: valign, wrapText: wrap }
    if (numFmt) cell.numFmt = numFmt
    if (border) cell.border = ALL_BORDERS
    return cell
  }
  // fill a whole row's cells with border/fill so merged regions look clean
  const dressRow = (r, fill) => {
    for (let c = 1; c <= NC; c++) {
      const cell = ws.getCell(r, c)
      cell.border = ALL_BORDERS
      if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    }
  }

  let r = 1

  // ---------- HEADER GRID (dynamic rows) ----------
  const headTop = r
  const cMidEnd = Math.max(2, NC - 2)
  const labC = NC - 1
  const valC = NC

  // business middle lines (only the ones that have a value)
  const bizLines = []
  if (doc.business.name) bizLines.push({ text: doc.business.name, opts: { bold: true, size: 18, color: ACCENT, align: 'center' } })
  if (doc.business.address) bizLines.push({ text: doc.business.address, opts: { align: 'center', color: GREY_DK, wrap: true } })
  if (doc.business.gstin) bizLines.push({ text: `GSTIN: ${doc.business.gstin}`, opts: { bold: true, align: 'center', color: GREY_DK } })
  const bizContact = [doc.business.phone, doc.business.email].filter(Boolean).join('  ·  ')
  if (bizContact) bizLines.push({ text: bizContact, opts: { align: 'center', color: GREY } })
  if (doc.business.website) bizLines.push({ text: doc.business.website, opts: { align: 'center', color: GREY } })

  // client detail rows (only the ones that have a value)
  const clientContact = [doc.client.phone, doc.client.email].filter(Boolean).join('  ·  ')
  const details = []
  if (doc.client.name) details.push(['Client Name', doc.client.name])
  if (doc.client.address) details.push(['Address', doc.client.address])
  if (clientContact) details.push(['Contact', clientContact])
  if (doc.client.gstin) details.push(['GSTIN', doc.client.gstin])
  details.push(['Date', formatDate(doc.date)])
  if (isInvoice && doc.showPO && doc.poNumber) details.push(['PO No.', doc.poNumber])

  const nRows = Math.max(bizLines.length, details.length, 3)
  for (let i = 0; i < nRows; i++) ws.getRow(headTop + i).height = 22

  // logo cell A(top):A(bottom)
  merge(headTop, 1, headTop + nRows - 1, 1)

  // business lines, centered across the middle columns
  bizLines.forEach((ln, i) => {
    merge(headTop + i, 2, headTop + i, cMidEnd)
    set(headTop + i, 2, ln.text, { ...ln.opts, border: false })
  })
  for (let i = bizLines.length; i < nRows; i++) {
    merge(headTop + i, 2, headTop + i, cMidEnd)
    set(headTop + i, 2, '', { align: 'center', border: false })
  }

  // right detail block (label col = NC-1, value col = NC)
  details.forEach(([lab, val], i) => {
    set(headTop + i, labC, lab, { bold: true, align: 'left', color: GREY_DK, fill: GREY_BG, border: false })
    set(headTop + i, valC, val, { align: 'center', color: GREY_DK, wrap: true, border: false })
  })
  for (let i = details.length; i < nRows; i++) {
    set(headTop + i, labC, '', { fill: GREY_BG, border: false })
    set(headTop + i, valC, '', { border: false })
  }

  // Clean card borders: outer box + divider before the client panel + light
  // separators between client rows. No internal gridlines over the logo area.
  for (let i = 0; i < nRows; i++) {
    const rr = headTop + i
    for (let c = 1; c <= NC; c++) {
      const cell = ws.getCell(rr, c)
      const b = {}
      if (i === 0) b.top = THIN
      if (i === nRows - 1) b.bottom = THIN
      if (c === 1) b.left = THIN
      if (c === NC) b.right = THIN
      if (c === labC) b.left = THIN
      cell.border = b
    }
  }
  // subtle horizontal separators between client detail rows
  for (let i = 0; i < details.length - 1; i++) {
    const rr = headTop + i
    ;[labC, valC].forEach((c) => {
      const cell = ws.getCell(rr, c)
      cell.border = { ...cell.border, bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } }
    })
  }

  // embed logo if available (data URL)
  if (doc.business.logo && typeof doc.business.logo === 'string' && doc.business.logo.startsWith('data:')) {
    try {
      const ext = doc.business.logo.includes('image/png') ? 'png'
        : doc.business.logo.includes('image/jpeg') || doc.business.logo.includes('image/jpg') ? 'jpeg' : 'png'
      const base64 = doc.business.logo.split(',')[1]
      const imgId = wb.addImage({ base64, extension: ext })
      // Scale the logo to the real header height (nRows) so it never bleeds
      // into the title band below. Keep aspect ratio (~1.36) from the source.
      const logoH = Math.round(nRows * 29 - 6)
      const logoW = Math.round(logoH * 1.36)
      ws.addImage(imgId, {
        tl: { col: 0.1, row: headTop - 1 + 0.12 },
        ext: { width: logoW, height: logoH },
        editAs: 'oneCell',
      })
    } catch (e) { /* ignore logo errors */ }
  }
  r = headTop + nRows

  // spacer
  ws.getRow(r).height = 6; r += 1

  // title band
  merge(r, 1, r, NC)
  set(r, 1, title, { bold: true, size: 14, color: WHITE, fill: DARK, align: 'center' })
  dressRow(r, DARK)
  ws.getRow(r).height = 24; r += 1

  const HEADERS = { sr: 'Sr.', particulars: 'Particulars', hsn: 'HSN/SAC', quantity: 'Quantity', unit: 'Unit', rate: 'Rate', cost: 'Cost', scope: 'Scope' }

  const banner = (text) => {
    merge(r, 1, r, NC)
    set(r, 1, text, { bold: true, size: 12, color: WHITE, fill: DARK, align: 'left' })
    dressRow(r, DARK)
    ws.getRow(r).height = 22; r += 1
  }
  const headerRow = () => {
    cols.forEach((k, i) => set(r, i + 1, HEADERS[k], { bold: true, color: WHITE, fill: ACCENT, align: 'center' }))
    ws.getRow(r).height = 18; r += 1
  }

  // groups: main category + optional Other Services
  const groups = docGroups(doc)
  let srn = 0
  groups.forEach((group) => {
    if (group.category) banner(group.category)
    headerRow()
    group.sections.forEach((section) => {
      srn = 0
      // section subtotal row
      set(r, C.sr, '', { fill: ACCENT_LT })
      set(r, C.particulars, section.name || '', { bold: true, fill: ACCENT_LT, align: 'left' })
      if (showTotals) {
        merge(r, C.particulars, r, C.cost - 1)
        for (let c = C.particulars; c < C.cost; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_LT } }
        set(r, C.cost, sectionTotal(section), { bold: true, fill: ACCENT_LT, align: 'right', numFmt: money })
        if (showScope) set(r, C.scope, '', { fill: ACCENT_LT })
      } else {
        merge(r, C.particulars, r, LAST)
        for (let c = C.particulars; c <= LAST; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_LT } }
      }
      dressRow(r, undefined)
      ws.getRow(r).height = 18; r += 1

      section.items.forEach((item) => {
        srn += 1
        const hasRate = Number(item.rate) > 0
        set(r, C.sr, srn, { align: 'center', color: GREY })
        set(r, C.particulars, item.particulars || '', { align: 'left', wrap: true })
        if (showHSN) set(r, C.hsn, item.hsn || '', { align: 'center' })
        const q = maskQty ? maskQtyVal : item.quantity
        const qNum = q !== '' && q !== null && q !== undefined && !isNaN(Number(q)) ? Number(q) : q
        set(r, C.quantity, (q === '' || q == null) ? '' : qNum, { align: typeof qNum === 'number' ? 'right' : 'center', numFmt: typeof qNum === 'number' ? '#,##0.00' : undefined })
        const hasQ = q !== '' && q !== null && q !== undefined
        if (showUnit) set(r, C.unit, hasQ ? (item.unit || 'nos.') : '', { align: 'center' })
        if (showRate) set(r, C.rate, hasRate ? Number(item.rate) : '', { align: 'right', numFmt: hasRate ? money : undefined })
        set(r, C.cost, itemCost(item), { align: 'right', numFmt: money })
        if (showScope) set(r, C.scope, item.scope || '', { align: 'left', wrap: true })
        r += 1
      })
    })
  })

  // transportation (optional) — above the grand total, amount on the right
  if (doc.showTransport) {
    merge(r, 1, r, NC - 1)
    set(r, 1, 'Transportation', { bold: true, fill: ACCENT_LT, align: 'left', color: DARK })
    for (let c = 1; c < NC; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_LT } }
    set(r, NC, totals.transport, { bold: true, fill: ACCENT_LT, align: 'right', color: DARK, numFmt: money })
    dressRow(r, undefined)
    ws.getRow(r).height = 20; r += 1
  }

  // grand total — amount on the far right
  if (showTotals) {
    merge(r, 1, r, NC - 1)
    set(r, 1, 'TOTAL SITE COST', { bold: true, size: 12, color: WHITE, fill: DARK, align: 'left' })
    for (let c = 1; c < NC; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
    set(r, NC, totals.grandTotal, { bold: true, size: 12, color: WHITE, fill: DARK, align: 'right', numFmt: money })
    dressRow(r, undefined)
    ws.getRow(r).height = 22; r += 1

    // GST rows (optional): tax on total, then total including GST
    if (doc.showGST) {
      merge(r, 1, r, NC - 1)
      set(r, 1, `GST @ ${totals.gstRate}%`, { bold: true, fill: ACCENT_LT, align: 'left', color: DARK })
      for (let c = 1; c < NC; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_LT } }
      set(r, NC, totals.gst, { bold: true, fill: ACCENT_LT, align: 'right', color: DARK, numFmt: money })
      dressRow(r, undefined)
      ws.getRow(r).height = 20; r += 1

      merge(r, 1, r, NC - 1)
      set(r, 1, 'TOTAL AMOUNT (INCL. GST)', { bold: true, size: 12, color: WHITE, fill: DARK, align: 'left' })
      for (let c = 1; c < NC; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
      set(r, NC, totals.totalWithGst, { bold: true, size: 12, color: WHITE, fill: DARK, align: 'right', numFmt: money })
      dressRow(r, undefined)
      ws.getRow(r).height = 22; r += 1
    }

    // amount in words (PDF style: accent label + dark bold value)
    set(r, 1, 'AMOUNT IN WORDS', { bold: true, size: 9, align: 'left', color: ACCENT, fill: ACCENT_LT })
    merge(r, 1, r, 2)
    for (let c = 1; c <= 2; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_LT } }
    set(r, 3, numberToWords(doc.showGST ? totals.totalWithGst : totals.grandTotal, doc.currency), { bold: true, align: 'left', color: DARK })
    merge(r, 3, r, NC)
    dressRow(r, undefined)
    ws.getRow(r).height = 20; r += 2
  } else {
    r += 1
  }

  // notes / terms (left columns) + signature (right columns) — mirrors the preview
  const showSig = doc.showSignature
  const LC = showSig ? Math.max(3, NC - 2) : NC // last left column
  const footerRow = r
  let lastRow = footerRow - 1
  const dressRange = (row, c1, c2, fill) => {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(row, c)
      cell.border = ALL_BORDERS
      if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    }
  }

  // notes (accent-light filled box with accent label)
  if (doc.notes) {
    set(r, 1, 'NOTES', { bold: true, size: 9, color: ACCENT, fill: ACCENT_LT, align: 'left' })
    merge(r, 1, r, LC)
    dressRange(r, 1, LC, ACCENT_LT); r += 1
    merge(r, 1, r, LC)
    set(r, 1, doc.notes, { align: 'left', color: GREY_DK, wrap: true, fill: ACCENT_LT })
    dressRange(r, 1, LC, ACCENT_LT)
    ws.getRow(r).height = 30
    lastRow = r; r += 2
  }

  // terms (accent-light filled box with accent label)
  if (doc.terms) {
    set(r, 1, 'TERMS & CONDITIONS', { bold: true, size: 9, color: ACCENT, fill: ACCENT_LT, align: 'left' })
    merge(r, 1, r, LC)
    dressRange(r, 1, LC, ACCENT_LT); r += 1
    doc.terms.split('\n').forEach((line) => {
      merge(r, 1, r, LC)
      set(r, 1, line, { align: 'left', color: GREY_DK, fill: ACCENT_LT })
      dressRange(r, 1, LC, ACCENT_LT)
      lastRow = r; r += 1
    })
  }

  // signature — right columns, bottom-aligned to the notes/terms block
  if (showSig) {
    const sc1 = LC + 1
    if (lastRow < footerRow) { lastRow = footerRow + 2; r = Math.max(r, lastRow + 1) }
    const nameRow = lastRow
    const hasSigImg = doc.business.signature && typeof doc.business.signature === 'string' && doc.business.signature.startsWith('data:')
    if (hasSigImg) {
      try {
        const ext = doc.business.signature.includes('image/png') ? 'png'
          : doc.business.signature.includes('image/jpeg') || doc.business.signature.includes('image/jpg') ? 'jpeg' : 'png'
        const base64 = doc.business.signature.split(',')[1]
        const imgId = wb.addImage({ base64, extension: ext })
        ws.addImage(imgId, {
          tl: { col: sc1 - 1 + 0.15, row: Math.max(footerRow - 1, (nameRow - 1) - 2.4) },
          ext: { width: 150, height: 46 },
          editAs: 'oneCell',
        })
      } catch (e) { /* ignore signature image errors */ }
    }
    merge(nameRow, sc1, nameRow, NC)
    set(nameRow, sc1, `For ${doc.business.name || ''}`, { bold: true, size: 10, color: DARK, align: 'center', border: false })
  }

  // download
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
