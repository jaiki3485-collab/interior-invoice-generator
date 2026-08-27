import { uid, todayISO, addDays } from './format'

// Common room/section names used in interior quotations.
export const ROOM_PRESETS = [
  'Kitchen',
  'Parents Bedroom',
  'Kids Bedroom',
  'Master Bedroom',
  'Living Room',
  'Dining Area',
  'Guest Bedroom',
  'Study Room',
  'Pooja Room',
  'Balcony',
  'Bathroom',
  'Foyer / Entrance',
]

// Common line-item names (Particulars) for interior quotations. Used to seed
// the auto-suggestion datalist; the editor also learns values you type.
export const PARTICULARS_PRESETS = [
  'Modular Base Cabinets',
  'Wall Cabinets',
  'Tandem Trolley',
  'Cutlery Trolley',
  'Tall Unit / Pantry Unit',
  'Loft Storage',
  'Granite Countertop',
  'Quartz Countertop',
  'Kitchen Sink',
  'Chimney',
  'Hob',
  'Wardrobe (Sliding)',
  'Wardrobe (Openable)',
  'Loft Above Wardrobe',
  'Bed with Storage',
  'Bedside Tables',
  'Dressing Unit with Mirror',
  'Study Table',
  'TV Unit',
  'Crockery Unit',
  'Shoe Rack',
  'False Ceiling (POP)',
  'False Ceiling (Gypsum)',
  'Cove Lighting',
  'Wall Panelling',
  'Wallpaper',
  'Pooja Unit',
  'Vanity Unit',
  'Mirror with Frame',
]

// Common Scope / specification notes.
export const SCOPE_PRESETS = [
  'Material + Labour',
  'Labour Only',
  'Material Only',
  'Supply & Installation',
  'BWP / Marine Ply with Laminate',
  'MR Ply with Laminate',
  'HDHMR with Laminate',
  'PU Finish',
  'Duco Paint Finish',
  'Acrylic Finish',
  'Membrane Shutters',
  'Soft-close Hinges & Channels',
  'Hettich / Hafele Hardware',
  'Ebco Hardware',
  '2 Coats',
  'As per design',
]

// Common units of measure for interior line items.
export const UNIT_PRESETS = [
  'nos.',
  'Sq.ft',
  'Rft',
  'Lump sum',
  'Set',
  'Pair',
  'Sq.mtr',
  'Kg',
]

// A single line item under a room/section.
// Columns: Particulars | HSN/SAC (optional) | Quantity | Unit (optional) | Rate (optional) | Cost | Scope (optional)
// opts.hsn overrides the built-in HSN default. Quantity is left as entered;
// the on-bill display can be masked separately without touching this value.
export function emptyItem(opts = {}) {
  const hsn = (opts.hsn != null && opts.hsn !== '') ? opts.hsn : '9403'
  return {
    id: uid(),
    particulars: '',
    hsn,
    quantity: '',
    unit: opts.unit || 'nos.',
    rate: '',
    cost: '',
    scope: '',
  }
}

// A room/section that groups items together.
export function emptySection(name = '', opts = {}) {
  return {
    id: uid(),
    name,
    items: [emptyItem(opts)],
  }
}

export function defaultBusiness() {
  return {
    name: 'Your Interior Studio',
    logo: '',
    address: '123 Design Street, City, State - 000000',
    phone: '+91 90000 00000',
    email: 'hello@yourstudio.com',
    website: 'www.yourstudio.com',
    gstin: '',
    signature: '',
  }
}

export function defaultClient() {
  return {
    name: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    placeOfSupply: '',
  }
}

// Built-in starting values applied to every new bill. Users can override any
// of these from the app's "Default Values" screen (persisted via storage);
// see getDefaults()/saveDefaults(). Keys here are the editable defaults.
export const BUILTIN_DEFAULTS = {
  currency: 'INR',
  theme: 'amber',
  category: 'FURNITURE',
  otherCategory: 'OTHER SERVICES',
  showRate: true,
  showHSN: false,
  showUnit: false,
  showScope: true,
  showTotals: true,
  showSignature: true,
  showGST: false,
  gstRate: 18,
  defaultHsn: '9403',
  maskQuantity: false,
  maskQuantityValue: '1',
  validityDays: 15,
  notes: 'Thank you for your business!',
  quotationTerms: '1. Estimate is not inclusive of GST Bill, 18% will be additional on GST Billing.\n2. 50% advance to confirm the order.\n3. Quantity is approximate and can vary based on site measurements.',
  invoiceTerms: '1. Payment due within 15 days.\n2. 50% advance required to start work.\n3. Goods once sold will not be taken back.',
}

// Editable-default field descriptors, used to render the "Default Values" form.
export const DEFAULT_FIELDS = [
  { key: 'category', label: 'Category heading', type: 'text', placeholder: 'e.g. FURNITURE' },
  { key: 'otherCategory', label: 'Other Services heading', type: 'text', placeholder: 'e.g. OTHER SERVICES' },
  { key: 'currency', label: 'Currency', type: 'currency' },
  { key: 'theme', label: 'Theme', type: 'theme' },
  { key: 'validityDays', label: 'Quotation validity (days)', type: 'number' },
  { key: 'showRate', label: 'Show Rate column by default', type: 'bool' },
  { key: 'showHSN', label: 'Show HSN/SAC column by default', type: 'bool' },
  { key: 'showUnit', label: 'Show Unit column by default', type: 'bool' },
  { key: 'showScope', label: 'Show Scope column by default', type: 'bool' },
  { key: 'showTotals', label: 'Show totals by default', type: 'bool' },
  { key: 'showGST', label: 'Show GST rows by default', type: 'bool' },
  { key: 'gstRate', label: 'GST rate (%)', type: 'number' },
  { key: 'defaultHsn', label: 'Default HSN/SAC value', type: 'text', placeholder: '9403' },
  { key: 'maskQuantity', label: 'Mask quantity on the bill by default', type: 'bool' },
  { key: 'maskQuantityValue', label: 'Masked quantity value', type: 'text', placeholder: '1' },
  { key: 'showSignature', label: 'Show signature block by default', type: 'bool' },
  { key: 'notes', label: 'Default Notes', type: 'textarea' },
  { key: 'quotationTerms', label: 'Default Terms — Quotation', type: 'textarea' },
  { key: 'invoiceTerms', label: 'Default Terms — Invoice', type: 'textarea' },
]

export function newDoc(type = 'quotation', overrides = {}) {
  const isInvoice = type === 'invoice'
  const d = { ...BUILTIN_DEFAULTS, ...overrides }
  const withUnit = d.showUnit === true
  const defaultHsn = (d.defaultHsn != null && d.defaultHsn !== '') ? d.defaultHsn : '9403'
  const itemOpts = { hsn: defaultHsn }
  return {
    id: uid(),
    type, // 'invoice' | 'quotation'
    currency: d.currency,
    theme: d.theme,
    category: d.category,
    date: todayISO(),
    validUntil: isInvoice ? '' : addDays(todayISO(), Number(d.validityDays) || 15),
    poNumber: '',
    showPO: false,
    business: defaultBusiness(),
    client: defaultClient(),
    sections: [
      {
        ...emptySection('Kitchen', itemOpts),
      },
    ],
    showOther: false,
    otherCategory: d.otherCategory,
    otherSections: [
      {
        ...emptySection('Painting', itemOpts),
      },
    ],
    showRate: d.showRate !== false,
    showHSN: d.showHSN === true,
    showUnit: withUnit,
    showScope: d.showScope !== false,
    defaultHsn,
    maskQuantity: d.maskQuantity === true,
    maskQuantityValue: (d.maskQuantityValue != null && d.maskQuantityValue !== '') ? d.maskQuantityValue : '1',
    showTransport: false,
    transport: '',
    notes: d.notes,
    terms: isInvoice ? d.invoiceTerms : d.quotationTerms,
    showSignature: d.showSignature !== false,
    showTotals: d.showTotals !== false,
    showGST: d.showGST === true,
    gstRate: Number(d.gstRate) || 18,
  }
}

export const THEMES = {
  teal: { name: 'Teal', primary: '#0f766e', light: '#ccfbf1' },
  indigo: { name: 'Indigo', primary: '#4338ca', light: '#e0e7ff' },
  rose: { name: 'Rose', primary: '#be123c', light: '#ffe4e6' },
  amber: { name: 'Amber', primary: '#b45309', light: '#fef3c7' },
  slate: { name: 'Slate', primary: '#334155', light: '#e2e8f0' },
  emerald: { name: 'Emerald', primary: '#047857', light: '#d1fae5' },
}

