/** How the shopper gets paid, from their Perpay account (Perpay is repaid straight from each paycheck). */
export interface Paycheck {
  /** Take-home pay per paycheck. */
  net: number
  /** Hours worked per pay period. */
  hours: number
  everyDays: number
  /** Any past or future payday, as YYYY-MM-DD. */
  anchor: string
}

const DAY = 24 * 60 * 60 * 1000

export function workHours(amount: number, paycheck: Paycheck) {
  return amount / (paycheck.net / paycheck.hours)
}

export function hoursText(hours: number) {
  if (hours < 1) return 'under an hour'
  const rounded = hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours)
  return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`
}

/** The next `count` paydays, starting today or later. */
export function paydays(paycheck: Paycheck, count: number, from = new Date()) {
  const [year, month, day] = paycheck.anchor.split('-').map(Number)
  const anchor = new Date(year, month - 1, day)
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const periods = Math.ceil((today.getTime() - anchor.getTime()) / DAY / paycheck.everyDays)
  const first = new Date(anchor)
  first.setDate(anchor.getDate() + periods * paycheck.everyDays)
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(first)
    date.setDate(first.getDate() + i * paycheck.everyDays)
    return date
  })
}

export function shortDate(date: Date | number, withYear = false) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
}

export function weekday(date: Date | number) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
}
