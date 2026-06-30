// Number, currency and misc helpers

export const CURRENCIES = {
  INR: { symbol: '₹', code: 'INR', name: 'Indian Rupee', locale: 'en-IN' },
  USD: { symbol: '$', code: 'USD', name: 'US Dollar', locale: 'en-US' },
  EUR: { symbol: '€', code: 'EUR', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', code: 'GBP', name: 'British Pound', locale: 'en-GB' },
  AED: { symbol: 'AED ', code: 'AED', name: 'UAE Dirham', locale: 'en-AE' },
}

export function fmt(amount, currencyCode = 'INR') {
  const cur = CURRENCIES[currencyCode] || CURRENCIES.INR
  const n = Number.isFinite(amount) ? amount : 0
  return cur.symbol + n.toLocaleString(cur.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Plain grouped number with no currency symbol (mirrors Excel/PDF output).
export function money(amount, currencyCode = 'INR') {
  const cur = CURRENCIES[currencyCode] || CURRENCIES.INR
  const n = Number.isFinite(amount) ? amount : 0
  return n.toLocaleString(cur.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
  'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
  'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty',
  'Seventy', 'Eighty', 'Ninety']

function twoDigits(n) {
  if (n < 20) return ONES[n]
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
}

function threeDigits(n) {
  const hundred = Math.floor(n / 100)
  const rest = n % 100
  let str = ''
  if (hundred) str += ONES[hundred] + ' Hundred'
  if (rest) str += (hundred ? ' ' : '') + twoDigits(rest)
  return str
}

// Indian numbering system word conversion (Lakh / Crore)
export function numberToWords(amount, currencyCode = 'INR') {
  const cur = CURRENCIES[currencyCode] || CURRENCIES.INR
  const num = Math.floor(Math.abs(Number(amount) || 0))
  const paise = Math.round((Math.abs(Number(amount) || 0) - num) * 100)

  const mainUnit = currencyCode === 'INR' ? 'Rupees'
    : cur.name + (num === 1 ? '' : 's')
  const subUnit = currencyCode === 'INR' ? 'Paise' : 'Cents'

  let words = ''
  if (num === 0) {
    words = 'Zero'
  } else if (currencyCode === 'INR') {
    const crore = Math.floor(num / 10000000)
    const lakh = Math.floor((num % 10000000) / 100000)
    const thousand = Math.floor((num % 100000) / 1000)
    const hundred = num % 1000
    const parts = []
    if (crore) parts.push(threeDigits(crore) + ' Crore')
    if (lakh) parts.push(twoDigits(lakh) + ' Lakh')
    if (thousand) parts.push(twoDigits(thousand) + ' Thousand')
    if (hundred) parts.push(threeDigits(hundred))
    words = parts.join(' ')
  } else {
    const billion = Math.floor(num / 1000000000)
    const million = Math.floor((num % 1000000000) / 1000000)
    const thousand = Math.floor((num % 1000000) / 1000)
    const hundred = num % 1000
    const parts = []
    if (billion) parts.push(threeDigits(billion) + ' Billion')
    if (million) parts.push(threeDigits(million) + ' Million')
    if (thousand) parts.push(threeDigits(thousand) + ' Thousand')
    if (hundred) parts.push(threeDigits(hundred))
    words = parts.join(' ')
  }

  let result = `${mainUnit} ${words}`
  if (paise > 0) result += ` and ${twoDigits(paise)} ${subUnit}`
  return result + ' Only'
}

export function todayISO() {
  return toLocalISO(new Date())
}

// Format a Date as YYYY-MM-DD using its LOCAL calendar date (not UTC).
// Using toISOString() here would shift the day for users in timezones ahead of
// UTC (e.g. IST +5:30), making "today" render as yesterday before ~5:30 AM.
export function toLocalISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toLocalISO(d)
}

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
