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

// Grand total across all sections (+ optional transportation).
export function computeTotals(doc) {
  const subtotal = round2(
    docGroups(doc).reduce(
      (sum, g) => sum + g.sections.reduce((s, sec) => s + sectionTotal(sec), 0),
      0,
    ),
  )
  const transport = transportCost(doc)
  const grandTotal = round2(subtotal + transport)
  return { subtotal, transport, grandTotal }
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
