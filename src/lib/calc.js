import { round2 } from './format'

// Cost for a single item.
// If a Rate is provided, Cost = Quantity × Rate (auto-calculated).
// If Rate is empty/zero, the manually entered Cost is used.
export function itemCost(item) {
  const qty = Number(item.quantity) || 0
  const rate = Number(item.rate) || 0
  if (rate > 0) return round2(qty * rate)
  return round2(Number(item.cost) || 0)
}

// Total cost for a room/section.
export function sectionTotal(section) {
  const items = section.items || []
  return round2(items.reduce((sum, it) => sum + itemCost(it), 0))
}

// Optional transportation/handling charge (added to the grand total).
export function transportCost(doc) {
  if (!doc.showTransport) return 0
  return round2(Number(doc.transport) || 0)
}

// Grand total across all sections (+ optional transportation), plus optional
// GST. When GST is enabled, `gst` is the tax on the grand total and
// `totalWithGst` is grandTotal + gst. The GST rate defaults to 18%.
export function computeTotals(doc) {
  const subtotal = round2(
    docGroups(doc).reduce(
      (sum, g) => sum + g.sections.reduce((s, sec) => s + sectionTotal(sec), 0),
      0,
    ),
  )
  const transport = transportCost(doc)
  const grandTotal = round2(subtotal + transport)
  const gstRate = doc.showGST ? (Number(doc.gstRate) || 18) : 0
  const gst = doc.showGST ? round2(grandTotal * gstRate / 100) : 0
  const totalWithGst = round2(grandTotal + gst)
  return { subtotal, transport, grandTotal, gstRate, gst, totalWithGst }
}

// The category groups that should appear in the document, in order.
// Always the main category; optionally the "Other Services" category.
export function docGroups(doc) {
  const groups = [{ category: doc.category, sections: doc.sections || [] }]
  if (doc.showOther) {
    groups.push({
      category: doc.otherCategory || 'OTHER SERVICES',
      sections: doc.otherSections || [],
    })
  }
  return groups
}
