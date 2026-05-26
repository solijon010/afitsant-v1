const formatter = new Intl.NumberFormat('uz-UZ')

export function fmtMoney(n: number): string {
  return formatter.format(Math.round(n))
}

export function fmtMoneyWithUnit(n: number, unit = "so'm"): string {
  return `${fmtMoney(n)} ${unit}`
}

export function fmtQty(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

export function fmtDate(ts: number, locale = 'uz-UZ'): string {
  return new Date(ts).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function fmtTime(ts: number, locale = 'uz-UZ'): string {
  return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

export function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}
