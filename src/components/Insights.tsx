import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { capturedOn, catalogSize, marketplaceImage, marketplaceUrl, type MarketplaceItem } from '../data/marketplace'
import type { PageSnapshot } from '../lib/page-reader'
import { paydays, shortDate, weekday, type Paycheck } from '../lib/paycheck'
import { usd, type PerpayPlan } from '../lib/perpay-plan'
import type { ActivePlan } from '../lib/session'

const hasStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local
const RECENT_KEY = 'loupe-recent'
const EASE = [0.16, 1, 0.3, 1] as const

/** A product page Loupe remembered, written by the content script. */
export interface Viewed {
  title: string
  host?: string
  price: number
  item: MarketplaceItem | null
  at: number
}

export function useRecent() {
  const [recent, setRecent] = useState<Viewed[]>([])
  useEffect(() => {
    if (!hasStorage) {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Viewed[])
      return
    }
    chrome.storage.local.get(RECENT_KEY).then((stored) => setRecent((stored[RECENT_KEY] as Viewed[] | undefined) ?? []))
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && RECENT_KEY in changes) setRecent((changes[RECENT_KEY].newValue as Viewed[] | undefined) ?? [])
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])
  return recent
}

/** What's still owed on plans already running, which is what's using the spending limit. */
export function owed(plans: ActivePlan[]) {
  return plans.reduce((sum, plan) => sum + (plan.pays - plan.paid) * plan.perPay, 0)
}

const STORES: Record<string, string> = {
  'amazon.com': 'Amazon',
  'walmart.com': 'Walmart',
  'bestbuy.com': 'Best Buy',
  'target.com': 'Target',
}
const bareHost = (host: string) => host.replace(/^www\./, '')
const storeName = (host: string) => STORES[bareHost(host)] ?? bareHost(host)
const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60)

function ago(at: number) {
  const days = Math.floor((Date.now() - at) / 864e5)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
}

function Section({ eyebrow, title, sub, delay, children }: { eyebrow: string; title: string; sub?: ReactNode; delay: number; children: ReactNode }) {
  return (
    <motion.section
      className="glass-card p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{eyebrow}</p>
      <h2 className="mt-1 text-[16px] font-semibold leading-snug tracking-tight text-ink">{title}</h2>
      {sub && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{sub}</p>}
      {children}
    </motion.section>
  )
}

function Grow({ width, className, delay = 0 }: { width: number; className: string; delay?: number }) {
  return (
    <motion.div
      className={`h-full ${className}`}
      initial={{ width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(100, width * 100))}%` }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    />
  )
}

// ── Price Passport ───────────────────────────────────────────────────────

export function PricePassport({ page, match, plan, recent, delay }: { page: PageSnapshot; match: MarketplaceItem | null; plan: PerpayPlan | null; recent: Viewed[]; delay: number }) {
  const here = bareHost(page.host)
  const rows = [{ host: here, price: page.price!, at: Date.now(), current: true }]
  for (const seen of recent) {
    if (!seen.host || rows.some((row) => row.host === bareHost(seen.host!))) continue
    const same = match ? seen.item?.id === match.id : titleKey(seen.title) === titleKey(page.title)
    if (same) rows.push({ host: bareHost(seen.host), price: seen.price, at: seen.at, current: false })
  }
  rows.sort((a, b) => a.price - b.price)
  const best = rows[0]
  const current = rows.find((row) => row.current)!
  const max = Math.max(...rows.map((row) => row.price))
  const title =
    rows.length === 1
      ? `${usd(current.price)} here`
      : best.current
        ? 'This is the lowest price you’ve seen'
        : `${usd(current.price - best.price)} less at ${storeName(best.host)}`

  return (
    <Section
      eyebrow="Price passport"
      title={title}
      sub={rows.length === 1 ? 'Open it at another store and Loupe lines the prices up here.' : `Across the ${rows.length} stores you’ve checked`}
      delay={delay}
    >
      <ul className="mt-3 space-y-2.5">
        {rows.map((row, index) => (
          <li key={row.host} className="flex items-center gap-2.5">
            <img src={`https://www.google.com/s2/favicons?domain=${row.host}&sz=64`} alt="" className="h-7 w-7 shrink-0 rounded-lg border border-line bg-white p-1" draggable={false} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  {storeName(row.host)}
                  {rows.length > 1 && index === 0 && (
                    <span className="rounded-full bg-[#e7f6ee] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[#067d62]">Lowest</span>
                  )}
                </span>
                <span className={`text-[13.5px] font-semibold tabular-nums ${index === 0 && rows.length > 1 ? 'text-[#067d62]' : 'text-ink'}`}>{usd(row.price)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                  <Grow width={row.price / max} className={`rounded-full ${row.current ? 'bg-ink/70' : 'bg-ink/25'}`} delay={delay + 0.1 + index * 0.06} />
                </div>
                <span className="w-[68px] shrink-0 text-right text-[11px] text-ink-faint">{row.current ? 'This page' : ago(row.at)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {plan && (
        <div className="mt-3 flex items-center gap-2.5 border-t border-line pt-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-wash">
            <img src="./images/perpay-logo.svg" alt="" className="h-[7px] w-auto" draggable={false} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink">Perpay Marketplace</span>
              <span className="text-[13.5px] font-semibold tabular-nums text-brand">
                {usd(plan.perPay, 'always')}
                <span className="text-[11px] font-medium">/paycheck</span>
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {usd(plan.total, 'always')} total over {plan.pays} paychecks, nothing up front
            </p>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Paycheck runway ──────────────────────────────────────────────────────

export function PaycheckRunway({ paycheck, plans, plan, delay }: { paycheck: Paycheck; plans: ActivePlan[]; plan: PerpayPlan | null; delay: number }) {
  const rows = paydays(paycheck, 6).map((date, i) => {
    const others = plans.filter((p) => p.paid + i < p.pays).reduce((sum, p) => sum + p.perPay, 0)
    const mine = plan && i < plan.pays ? plan.perPay : 0
    const ends = plans.filter((p) => p.paid + i === p.pays - 1)
    return { date, others, mine, left: paycheck.net - others - mine, ends }
  })
  const lowest = Math.min(...rows.map((row) => row.left))
  const share = plan ? Math.max(1, Math.round((plan.perPay / paycheck.net) * 100)) : 0

  return (
    <Section
      eyebrow="Paycheck runway"
      title={`Every paycheck keeps at least ${usd(Math.floor(lowest))}`}
      sub={plan ? `This takes ${usd(plan.perPay, 'always')} a payday, ${share}% of your ${usd(paycheck.net)} take-home.` : `Your next paydays, after what you already pay Perpay.`}
      delay={delay}
    >
      <ul className="mt-3 space-y-2">
        {rows.map((row, i) => (
          <li key={row.date.toISOString()}>
            <div className="flex items-center gap-2.5">
              <span className="w-[74px] shrink-0 text-[11.5px] font-medium text-ink-soft">
                {weekday(row.date)}, {shortDate(row.date)}
              </span>
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-brand-wash">
                <Grow width={row.others / paycheck.net} className="bg-ink/35" delay={delay + 0.1 + i * 0.05} />
                <Grow width={row.mine / paycheck.net} className="bg-brand" delay={delay + 0.15 + i * 0.05} />
              </div>
              <span className="w-[54px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-ink">{usd(Math.floor(row.left))}</span>
            </div>
            {row.ends.map((ended) => (
              <p key={ended.name} className="ml-[84px] mt-1 text-[11px] font-medium text-[#067d62]">
                ✓ {ended.name} paid off after this one
              </p>
            ))}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        {plan && <Legend className="bg-brand" label="This purchase" />}
        {plans.length > 0 && <Legend className="bg-ink/35" label="Already on Perpay" />}
        <Legend className="bg-brand-wash" label="Yours to keep" />
      </div>
    </Section>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  )
}

// ── Limit planner ────────────────────────────────────────────────────────

export function LimitPlanner({ limit, plans, plan, paycheck, delay }: { limit: number; plans: ActivePlan[]; plan: PerpayPlan; paycheck?: Paycheck; delay: number }) {
  const used = owed(plans)
  const available = Math.max(0, limit - used)
  const after = available - plan.total
  const fits = after >= 0
  const longest = Math.max(plan.pays, ...plans.map((p) => p.pays - p.paid))
  const refilled = paycheck ? paydays(paycheck, longest).at(-1) : null

  return (
    <Section
      eyebrow="Spending limit"
      title={fits ? `Fits, with ${usd(Math.floor(after))} to spare` : `${usd(Math.ceil(-after))} more than you have left`}
      sub={`${usd(available)} of your ${usd(limit)} limit is free right now.`}
      delay={delay}
    >
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-brand-wash">
        <Grow width={used / limit} className="bg-ink/35" delay={delay + 0.1} />
        <Grow width={Math.min(plan.total, available) / limit} className={fits ? 'bg-brand' : 'bg-[#c2571a]'} delay={delay + 0.2} />
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="On Perpay" value={usd(Math.round(used))} dot="bg-ink/35" />
        <Stat label="This item" value={usd(Math.round(plan.total))} dot={fits ? 'bg-brand' : 'bg-[#c2571a]'} />
        <Stat label="Left after" value={fits ? usd(Math.floor(after)) : '—'} dot="bg-brand-wash" />
      </dl>
      {refilled && (
        <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-[11.5px] leading-snug text-ink-soft">
          Each payment frees your limit back up. All {usd(limit)} is yours again by <span className="font-semibold text-ink">{shortDate(refilled, true)}</span>.
        </p>
      )}
    </Section>
  )
}

function Stat({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-ink-faint">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  )
}

// ── Credit builder ───────────────────────────────────────────────────────

export function CreditBuilder({ plans, plan, paycheck, delay }: { plans: ActivePlan[]; plan: PerpayPlan | null; paycheck?: Paycheck; delay: number }) {
  const made = plans.reduce((sum, p) => sum + p.paid, 0)
  const scheduled = plans.reduce((sum, p) => sum + p.pays - p.paid, 0)
  const added = plan?.pays ?? 0
  const total = made + scheduled + added
  const longest = Math.max(added, ...plans.map((p) => p.pays - p.paid))
  const by = paycheck && longest > 0 ? paydays(paycheck, longest).at(-1) : null

  const radius = 30
  const around = 2 * Math.PI * radius
  const arcs = [
    { count: made, className: 'stroke-brand-deep' },
    { count: scheduled, className: 'stroke-brand/45' },
    { count: added, className: 'stroke-brand' },
  ]
  let start = 0

  return (
    <Section eyebrow="Credit builder" title={`${total} on-time payments reported${by ? ` by ${shortDate(by, true)}` : ''}`} delay={delay}>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-[76px] w-[76px] shrink-0">
          <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
            <circle cx="38" cy="38" r={radius} fill="none" strokeWidth="8" className="stroke-canvas" />
            {arcs.map(({ count, className }, i) => {
              const length = (count / Math.max(total, 1)) * around
              const offset = start
              start += length
              return (
                <motion.circle
                  key={i}
                  cx="38"
                  cy="38"
                  r={radius}
                  fill="none"
                  strokeWidth="8"
                  className={className}
                  strokeDashoffset={-offset}
                  initial={{ strokeDasharray: `0 ${around}` }}
                  animate={{ strokeDasharray: `${Math.max(0, length - 1.5)} ${around}` }}
                  transition={{ duration: 0.8, delay: delay + 0.15 + i * 0.15, ease: EASE }}
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <span className="text-[19px] font-semibold leading-none tracking-tight text-ink">{total}</span>
          </div>
        </div>
        <ul className="space-y-1.5 text-[12px]">
          {made > 0 && <CreditLine className="bg-brand-deep" count={made} label="already made" />}
          {scheduled > 0 && <CreditLine className="bg-brand/45" count={scheduled} label="still to come" />}
          {added > 0 && <CreditLine className="bg-brand" count={added} label="from this purchase" plus />}
        </ul>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-ink-faint">With Perpay+, every on-time payment is reported to Experian, Equifax and TransUnion.</p>
    </Section>
  )
}

function CreditLine({ className, count, label, plus = false }: { className: string; count: number; label: string; plus?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-ink-soft">
      <span className={`h-2 w-2 shrink-0 rounded-full ${className}`} />
      <span>
        <span className="font-semibold text-ink">
          {plus ? '+' : ''}
          {count}
        </span>{' '}
        {label}
      </span>
    </li>
  )
}

// ── Perpay offer ─────────────────────────────────────────────────────────

export function PerpayStrip({ plan, onOpen, delay }: { plan: PerpayPlan; onOpen: (url: string) => void; delay: number }) {
  return (
    <motion.section
      className="rounded-[20px] bg-gradient-to-br from-brand to-brand-deep p-3 text-white shadow-[0_14px_34px_-14px_rgb(31_92_255/0.7)]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
    >
      <div className="flex items-center gap-3">
        <img src={marketplaceImage(plan.item)} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1" draggable={false} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight tracking-tight">
            {usd(plan.perPay, 'always')}
            <span className="text-[12px] font-medium text-white/75">/paycheck on Perpay</span>
          </p>
          <p className="mt-0.5 truncate text-[11px] text-white/70">
            {plan.pays} paychecks · {usd(plan.total, 'always')} total · 0% interest
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(marketplaceUrl(plan.item))}
          className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-brand transition hover:bg-white/90"
        >
          View
        </button>
      </div>
      <p className="mt-2 text-center text-[10px] text-white/50">
        Matched across {catalogSize().toLocaleString()} Marketplace listings · prices as of {capturedOn()}
      </p>
    </motion.section>
  )
}
