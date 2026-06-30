import jsPDFImport from 'jspdf'
import autoTableImport from 'jspdf-autotable'
import { computeTotals, itemCost, sectionTotal, docGroups } from './calc'
import { formatDate, numberToWords, CURRENCIES } from './format'
import { THEMES } from './defaults'
import { InterRegular, InterBold, InterExtraBold } from './interFont'

const jsPDF = jsPDFImport.jsPDF || jsPDFImport.default || jsPDFImport
const autoTable = autoTableImport.default || autoTableImport

// Register the embedded Inter font so the PDF typography matches the preview.
// 'Inter' -> normal/bold ; 'InterX' -> extra-bold (used for the business name).
function registerInter(pdf) {
  pdf.addFileToVFS('Inter-Regular.ttf', InterRegular)
  pdf.addFont('Inter-Regular.ttf', 'Inter', 'normal')
  pdf.addFileToVFS('Inter-Bold.ttf', InterBold)
  pdf.addFont('Inter-Bold.ttf', 'Inter', 'bold')
  pdf.addFileToVFS('Inter-ExtraBold.ttf', InterExtraBold)
  pdf.addFont('Inter-ExtraBold.ttf', 'InterX', 'bold')
}

// ---- palette ----------------------------------------------------------
const DARK = [31, 41, 55] // #1f2937
const GREY = [107, 114, 128]
const GREY_DK = [55, 65, 81]
const LINE = [148, 163, 184]
const SOFT = [248, 250, 252]
const HAIR = [226, 232, 240]

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Money is rendered as plain grouped numbers (no currency symbol/prefix).
function money(amount, currencyCode = 'INR') {
  const c = CURRENCIES[currencyCode] || CURRENCIES.INR
  const n = Number.isFinite(amount) ? amount : 0
  return n.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// ---- main -------------------------------------------------------------
export async function exportPDF(doc, filename = 'document.pdf') {
  const theme = THEMES[doc.theme] || THEMES.amber
  const ACCENT = hexToRgb(theme.primary)
  const ACCENT_LT = hexToRgb(theme.light)
  const cur = doc.currency
  const isInvoice = doc.type === 'invoice'
  const title = isInvoice ? 'INVOICE' : 'QUOTATION'
  const showRate = doc.showRate !== false
  const showTotals = doc.showTotals !== false
  const totals = computeTotals(doc)
  const groups = docGroups(doc)

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true })
  registerInter(pdf)
  const PW = pdf.internal.pageSize.getWidth()
  const PH = pdf.internal.pageSize.getHeight()
  const M = 32
  const W = PW - M * 2

  // ---------- client rows ----------
  const clientRows = []
  if (doc.client.name) clientRows.push(['Client Name', doc.client.name])
  if (doc.client.address) clientRows.push(['Address', doc.client.address])
  const clientContact = [doc.client.phone, doc.client.email].filter(Boolean).join('  ·  ')
  if (clientContact) clientRows.push(['Contact', clientContact])
  if (doc.client.gstin) clientRows.push(['GSTIN', doc.client.gstin])
  clientRows.push(['Date', formatDate(doc.date)])
  if (isInvoice && doc.showPO && doc.poNumber) clientRows.push(['PO No.', doc.poNumber])

  const clientW = 216
  const clientX = M + W - clientW
  const VALX = 78 // x-offset of the value column within the client panel
  const brandX = M + 14
  const logoBox = 76

  let logoImg = null
  if (doc.business.logo && typeof doc.business.logo === 'string' && doc.business.logo.startsWith('data:')) {
    logoImg = await loadImage(doc.business.logo)
  }

  const textX = brandX + (logoImg ? logoBox + 16 : 0)
  const bizMaxW = clientX - textX - 14

  // pre-wrap business lines to compute header height
  pdf.setFont('InterX', 'bold'); pdf.setFontSize(17)
  const nameLines = doc.business.name ? pdf.splitTextToSize(doc.business.name, bizMaxW) : []
  pdf.setFont('Inter', 'normal'); pdf.setFontSize(9)
  const infoLines = []
  if (doc.business.address) {
    pdf.splitTextToSize(doc.business.address, bizMaxW).forEach((t) => infoLines.push({ kind: 'plain', text: t }))
  }
  if (doc.business.phone || doc.business.email || doc.business.website) {
    infoLines.push({ kind: 'contact', phone: doc.business.phone, email: doc.business.email, website: doc.business.website })
  }
  if (doc.business.gstin) infoLines.push({ kind: 'plain', text: `GSTIN: ${doc.business.gstin}`, strong: true })

  const NAME_GAP = 1        // gap between business name and first info line
  const INFO_LH = 15        // line height between business info lines (address/contact/gstin)
  const CLIENT_PAD_R = 16   // inner right padding of the client panel (keeps values off the border)
  const CLIENT_PAD_V = 36   // top+bottom padding budget for the client panel (keeps rows off borders)
  const bizHeight = 14 + nameLines.length * 19 + NAME_GAP + infoLines.length * INFO_LH

  // client box height — measure with the SAME font used to render the values
  // (otherwise wrapping differs between measure & draw, causing row overlap)
  pdf.setFont('Inter', 'bold'); pdf.setFontSize(9.5)
  const clientValLines = []
  clientRows.forEach(([, val]) => {
    const vLines = pdf.splitTextToSize(String(val), clientW - VALX - CLIENT_PAD_R)
    clientValLines.push(vLines)
  })
  const clientH = CLIENT_PAD_V +
    clientValLines.reduce((s, ls) => s + Math.max(1, ls.length) * 13, 0) +
    15 * (clientRows.length - 1)

  const headH = Math.max(bizHeight, clientH, logoImg ? logoBox + 24 : 78)
  const headY = M

  // card border + accent bar
  pdf.setDrawColor(...HAIR); pdf.setLineWidth(1)
  pdf.roundedRect(M, headY, W, headH, 8, 8, 'S')
  pdf.setFillColor(...ACCENT)
  pdf.rect(M, headY + 4, 4, headH - 8, 'F')

  // logo
  if (logoImg) {
    const ar = logoImg.width / logoImg.height
    let lw = logoBox, lh = logoBox
    if (ar > 1) lh = logoBox / ar; else lw = logoBox * ar
    const fmt = doc.business.logo.includes('image/png') ? 'PNG' : 'JPEG'
    pdf.addImage(doc.business.logo, fmt, brandX, headY + (headH - lh) / 2, lw, lh)
  }

  // business text — vertically centered within the header
  const bizContentH =
    nameLines.length * 19 + (nameLines.length ? NAME_GAP : 0) + infoLines.length * INFO_LH
  let by = headY + Math.max(24, (headH - bizContentH) / 2 + 14)
  if (nameLines.length) {
    pdf.setFont('InterX', 'bold'); pdf.setFontSize(17); pdf.setTextColor(...ACCENT)
    nameLines.forEach((ln) => { pdf.text(ln, textX, by); by += 19 })
    by += NAME_GAP
  }
  pdf.setFont('Inter', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...GREY_DK)
  infoLines.forEach((ln) => {
    if (ln.kind === 'contact') {
      let cx = textX
      const gap = pdf.getTextWidth(' ')
      const dot = () => {
        pdf.setFont('Inter', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...HAIR)
        pdf.text('·', cx, by); cx += pdf.getTextWidth('·') + gap
      }
      let first = true
      if (ln.phone) {
        pdf.setFont('Inter', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...GREY_DK)
        pdf.text(String(ln.phone), cx, by); cx += pdf.getTextWidth(String(ln.phone)) + gap
        first = false
      }
      if (ln.email) {
        if (!first) dot()
        pdf.setFont('times', 'italic'); pdf.setFontSize(9.5); pdf.setTextColor(...ACCENT)
        pdf.text(String(ln.email), cx, by); cx += pdf.getTextWidth(String(ln.email)) + gap
        first = false
      }
      if (ln.website) {
        if (!first) dot()
        pdf.setFont('Inter', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...GREY)
        pdf.text(String(ln.website), cx, by)
      }
      by += INFO_LH
    } else {
      pdf.setFont('Inter', ln.strong ? 'bold' : 'normal'); pdf.setFontSize(9)
      pdf.setTextColor(...(ln.strong ? GREY_DK : GREY_DK))
      pdf.text(ln.text, textX, by); by += INFO_LH
    }
  })

  // client panel
  pdf.setFillColor(...SOFT)
  pdf.rect(clientX, headY + 1, clientW - 1, headH - 2, 'F')
  pdf.setDrawColor(...HAIR); pdf.setLineWidth(1)
  pdf.line(clientX, headY + 1, clientX, headY + headH - 1)
  // vertically center the client rows within the header height
  const ROW_LINE = 13       // line height within a (possibly multi-line) value
  const ROW_GAP = 15        // vertical gap between rows (separator sits centered here)
  const rowHeights = clientValLines.map((ls) => Math.max(1, ls.length) * ROW_LINE)
  const clientContentH = rowHeights.reduce((s, h) => s + h, 0) + ROW_GAP * (clientRows.length - 1)
  // top baseline of the first row (cap height ~7pt below the block top)
  let cy = headY + Math.max(20, (headH - clientContentH) / 2) + 8
  clientRows.forEach(([lab, val], i) => {
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(7); pdf.setTextColor(...GREY)
    pdf.text(lab.toUpperCase(), clientX + 12, cy, { charSpace: 0.4 })
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...DARK)
    const vLines = clientValLines[i]
    vLines.forEach((vl, k) => pdf.text(vl, clientX + VALX, cy + k * 12))
    if (i < clientRows.length - 1) {
      // advance to the bottom of this row's text, then into the gap
      const rowBottom = cy + (Math.max(1, vLines.length) - 1) * 12 + 3
      const sepY = rowBottom + ROW_GAP / 2
      pdf.setDrawColor(...HAIR); pdf.setLineWidth(0.5)
      pdf.line(clientX + 12, sepY, clientX + clientW - 12, sepY)
      cy = rowBottom + ROW_GAP + 4 // next row baseline
    }
  })

  // ---------- TITLE BAND ----------
  let y = headY + headH + 16
  pdf.setFillColor(...DARK)
  pdf.rect(M, y, W, 26, 'F')
  pdf.setFont('Inter', 'bold'); pdf.setFontSize(13); pdf.setTextColor(255, 255, 255)
  pdf.text(title, PW / 2, y + 17.5, { align: 'center', charSpace: 1 })
  y += 26

  // ---------- ITEMS TABLE ----------
  const cols = ['sr', 'particulars', 'quantity']
  if (showRate) cols.push('rate')
  cols.push('cost', 'scope')
  const NC = cols.length
  const beforeCost = showRate ? 4 : 3 // sr + particulars + quantity + (rate)

  const head = [['Sr.', 'Particulars', 'Quantity', ...(showRate ? ['Rate'] : []), 'Cost', 'Scope']]

  const SEC = ACCENT_LT
  const body = []
  groups.forEach((group) => {
    if (group.category) {
      body.push([{ content: group.category, colSpan: NC, styles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left', fontSize: 9.5 } }])
    }
    group.sections.forEach((section) => {
      if (showTotals) {
        body.push([
          { content: '', styles: { fillColor: SEC } },
          { content: section.name || '', colSpan: beforeCost - 1, styles: { fillColor: SEC, fontStyle: 'bold', textColor: DARK } },
          { content: money(sectionTotal(section), cur), styles: { fillColor: SEC, fontStyle: 'bold', halign: 'right' } },
          { content: '', styles: { fillColor: SEC } },
        ])
      } else {
        body.push([
          { content: '', styles: { fillColor: SEC } },
          { content: section.name || '', colSpan: NC - 1, styles: { fillColor: SEC, fontStyle: 'bold', textColor: DARK } },
        ])
      }
      let sr = 0
      section.items.forEach((item) => {
        sr += 1
        const hasRate = Number(item.rate) > 0
        const row = [
          { content: String(sr), styles: { halign: 'center', textColor: GREY } },
          { content: item.particulars || '' },
          { content: item.quantity !== '' && item.quantity != null ? String(item.quantity) : '', styles: { halign: 'right' } },
        ]
        if (showRate) row.push({ content: hasRate ? money(Number(item.rate), cur) : '', styles: { halign: 'right' } })
        row.push({ content: money(itemCost(item), cur), styles: { halign: 'right' } })
        row.push({ content: item.scope || '' })
        body.push(row)
      })
    })
  })
  if (doc.showTransport) {
    body.push([
      { content: 'Transportation', colSpan: NC - 1, styles: { fillColor: SEC, textColor: DARK, fontStyle: 'bold', halign: 'left' } },
      { content: money(totals.transport, cur), styles: { fillColor: SEC, textColor: DARK, fontStyle: 'bold', halign: 'right' } },
    ])
  }
  if (showTotals) {
    body.push([
      { content: 'TOTAL SITE COST', colSpan: NC - 1, styles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left', fontSize: 11 } },
      { content: money(totals.grandTotal, cur), styles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right', fontSize: 11 } },
    ])
  }
  const pct = showRate
    ? { sr: 0.06, particulars: 0.24, quantity: 0.13, rate: 0.13, cost: 0.15, scope: 0.29 }
    : { sr: 0.07, particulars: 0.30, quantity: 0.16, cost: 0.18, scope: 0.29 }
  const columnStyles = {}
  cols.forEach((k, i) => { columnStyles[i] = { cellWidth: W * pct[k] } })

  autoTable(pdf, {
    head,
    body,
    startY: y,
    margin: { left: M, right: M },
    tableWidth: W,
    theme: 'grid',
    styles: {
      font: 'Inter', fontSize: 9, cellPadding: 5, lineColor: LINE, lineWidth: 0.5,
      textColor: GREY_DK, overflow: 'linebreak', valign: 'middle',
    },
    headStyles: {
      fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center',
      fontSize: 8.5, lineColor: LINE, lineWidth: 0.5,
    },
    columnStyles,
    rowPageBreak: 'avoid',
  })

  // ---------- BELOW TABLE ----------
  y = pdf.lastAutoTable.finalY + 18
  const ensure = (need) => { if (y + need > PH - M) { pdf.addPage(); y = M + 6 } }

  // amount in words
  if (showTotals) {
    ensure(34)
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...ACCENT)
    pdf.text('AMOUNT IN WORDS', M, y)
    y += 13
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(...DARK)
    pdf.splitTextToSize(numberToWords(totals.grandTotal, cur), W).forEach((ln) => { pdf.text(ln, M, y); y += 14 })
    y += 8
  }

  // notes / terms (left column) + signature (bottom-right) — mirrors the preview
  const showSig = doc.showSignature
  const LW = showSig ? Math.round(W * 0.60) : W
  const footerTop = y
  let leftBottom = y

  // notes
  if (doc.notes) {
    const lines = pdf.splitTextToSize(doc.notes, LW - 24)
    ensure(28 + lines.length * 12)
    const boxH = 18 + lines.length * 12
    pdf.setFillColor(...ACCENT_LT); pdf.roundedRect(M, y, LW, boxH, 6, 6, 'F')
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...ACCENT)
    pdf.text('NOTES', M + 12, y + 14)
    pdf.setFont('Inter', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(...GREY_DK)
    let ny = y + 26
    lines.forEach((ln) => { pdf.text(ln, M + 12, ny); ny += 12 })
    y += boxH + 12
    leftBottom = y - 12
  }

  // terms
  if (doc.terms) {
    const lines = []
    doc.terms.split('\n').forEach((l) => lines.push(...pdf.splitTextToSize(l, LW - 24)))
    ensure(28 + lines.length * 12)
    const boxH = 18 + lines.length * 12
    pdf.setFillColor(...ACCENT_LT); pdf.roundedRect(M, y, LW, boxH, 6, 6, 'F')
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...ACCENT)
    pdf.text('TERMS & CONDITIONS', M + 12, y + 14)
    pdf.setFont('Inter', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(...GREY_DK)
    let ty = y + 26
    lines.forEach((ln) => { pdf.text(ln, M + 12, ty); ty += 12 })
    y += boxH + 12
    leftBottom = y - 12
  }

  // signature — right side, bottom-aligned to the notes/terms block
  if (showSig) {
    const SIGW = 190
    const sigCx = M + W - SIGW / 2
    const hasLeft = !!(doc.notes || doc.terms)
    const sigData = (doc.business.signature && typeof doc.business.signature === 'string' && doc.business.signature.startsWith('data:'))
      ? doc.business.signature : null
    let sImg = null, sw = 0, sh = 0, fmt = 'PNG'
    if (sigData) {
      sImg = await loadImage(sigData)
      if (sImg) {
        const ar = sImg.width / sImg.height
        sh = 40; sw = Math.min(150, sh * ar)
        fmt = sigData.includes('image/png') ? 'PNG' : 'JPEG'
      }
    }
    let nameBaseline
    if (hasLeft) {
      // bottom-align beside the notes/terms block
      nameBaseline = leftBottom
      if (sImg) {
        const imgTop = Math.max(footerTop, nameBaseline - 16 - sh)
        pdf.addImage(sigData, fmt, sigCx - sw / 2, imgTop, sw, sh)
      }
    } else {
      // signature only: stack image on top, name below; reserve space
      ensure((sImg ? sh + 16 : 30) + 16)
      let sy = y
      if (sImg) { pdf.addImage(sigData, fmt, sigCx - sw / 2, sy, sw, sh); sy += sh + 16 }
      else { sy += 30 }
      nameBaseline = sy
    }
    pdf.setFont('Inter', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...DARK)
    pdf.text(`For ${doc.business.name || ''}`, sigCx, nameBaseline, { align: 'center' })
    y = Math.max(y, nameBaseline + 6)
  }

  pdf.save(filename)
}
