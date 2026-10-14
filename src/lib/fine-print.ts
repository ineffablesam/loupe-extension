import type { PageSnapshot } from './page-reader'

export type FindingKind = 'addon' | 'shipping' | 'fee' | 'financing' | 'late_fee' | 'subscription' | 'returns'

export interface Finding {
  kind: FindingKind
  label: string
  detail: string
  /** Exact text on the page this finding came from. */
  quote: string
  /** Dollars, dollars per month, or percent depending on kind. */
  amount: number | null
  apr?: number
  months?: number
  /** Length of a return window or trial, for reminders. */
  days?: number
  /** True when the charge is already part of what the shopper will pay. */
  inCart: boolean
  source: 'rules' | 'ai'
}

/** Kinds that raise the total today, as opposed to risks to watch for. */
export const COST_KINDS: FindingKind[] = ['addon', 'shipping', 'fee']

const money = (value: string) => Number(value.replace(/,/g, ''))
const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)`

// ── Rules ────────────────────────────────────────────────────────────────

export function findWithRules(page: PageSnapshot): Finding[] {
  const findings: Finding[] = []
  const add = (finding: Omit<Finding, 'source'>) => findings.push({ ...finding, source: 'rules' })

  for (const label of page.selected) {
    const price = label.match(new RegExp(MONEY))
    if (!price || /free|\$0(\.00)?\b/i.test(label)) continue
    // Condition and variant pickers ("New $429", "Pre-owned $366") choose the item itself; they aren't extras.
    if (/^(new|used|pre-?owned|renewed|refurbished|open-?box|like new)\b/i.test(label)) continue
    if (page.price && money(price[1]) >= page.price * 0.5) continue
    add({
      kind: 'addon',
      label: shorten(label.replace(new RegExp(MONEY, 'g'), '').replace(/(?:[\s\-–—:,]|\b(?:for|at|only|just)\b)+$/i, ''), 42) || 'Add-on',
      detail: 'Already selected for you. Untick it if you don’t want it.',
      quote: label,
      amount: money(price[1]),
      inCart: true,
    })
  }

  for (const line of page.snippets) {
    const apr = line.match(/((?:\d{1,2}(?:\.\d{1,2})?\s?%?\s?(?:[-–]|to)\s?)?\d{1,2}(?:\.\d{1,2})?)\s?%\s*APR/i)
    if (apr) {
      const rates = apr[1].match(/\d{1,2}(?:\.\d{1,2})?/g)!.map(Number)
      const highest = Math.max(...rates)
      const months = line.match(/(\d{1,2})\s*(?:months|mos?\b|monthly payments)/i)
      if (highest > 0) {
        add({
          kind: 'financing',
          label: rates.length > 1 ? `Financing up to ${highest}% APR` : `Financing at ${highest}% APR`,
          detail: 'Interest is added on top of the price when you pay over time.',
          quote: line,
          amount: highest,
          apr: highest,
          months: months ? Number(months[1]) : undefined,
          inCart: false,
        })
      }
      continue
    }

    const lateFee = line.match(new RegExp(String.raw`late (?:payment )?fees?[^$]{0,40}?${MONEY}`, 'i')) ??
      line.match(new RegExp(String.raw`${MONEY}\s*late (?:payment )?fee`, 'i'))
    if (lateFee) {
      add({
        kind: 'late_fee',
        label: `$${lateFee[1]} late fee`,
        detail: 'Charged each time a payment is missed.',
        quote: line,
        amount: money(lateFee[1]),
        inCart: false,
      })
      continue
    }

    const restocking = line.match(/(\d{1,2})\s?%\s*restocking/i)
    if (restocking) {
      add({
        kind: 'returns',
        label: `${restocking[1]}% restocking fee`,
        detail: 'Taken out of your refund if you return it.',
        quote: line,
        amount: Number(restocking[1]),
        inCart: false,
      })
      continue
    }

    if (/non-?returnable|final sale|no returns/i.test(line)) {
      add({ kind: 'returns', label: 'Can’t be returned', detail: 'All sales are final on this item.', quote: line, amount: null, inCart: false })
      continue
    }

    const returnWindow = line.match(/(\d{1,2})[- ]day (?:free )?(?:refund|return)/i)
    if (returnWindow && Number(returnWindow[1]) <= 30) {
      add({
        kind: 'returns',
        label: `Only ${returnWindow[1]} days to return`,
        detail: 'After that, you’re stuck with it, so test it early.',
        quote: line,
        amount: null,
        days: Number(returnWindow[1]),
        inCart: false,
      })
      continue
    }

    const trial = line.match(/(\d{1,3})[- ]day (?:free )?trial/i)
    if (trial) {
      const name = line.match(/trial of ([A-Z][\w+]*)/)?.[1]
      const then = line.match(new RegExp(String.raw`then ${MONEY}`, 'i'))
      add({
        kind: 'subscription',
        label: `${name ? `${name} trial` : 'Trial'} ends after ${trial[1]} days`,
        detail: then ? `Then it charges $${then[1]} until you cancel.` : 'Then it turns into a paid plan unless you cancel.',
        quote: line,
        amount: then ? money(then[1]) : null,
        days: Number(trial[1]),
        inCart: false,
      })
      continue
    }

    const monthly = line.match(new RegExp(String.raw`${MONEY}\s?(?:/|per |a )\s?(?:mo|month)\b`, 'i'))
    if (monthly && /monthly|membership|subscri|plan|applecare|protection|warranty/i.test(line) && !/\bapr\b|interest|financ|\d+ months/i.test(line)) {
      add({
        kind: 'subscription',
        label: `$${monthly[1]}/mo plan`,
        detail: 'A monthly charge that keeps going until you cancel.',
        quote: line,
        amount: money(monthly[1]),
        inCart: false,
      })
      continue
    }

    const renews = line.match(new RegExp(String.raw`(?:free trial|auto-?renew|renews|then)[^$]{0,60}?${MONEY}\s?(?:/|per |a )\s?(mo|month|yr|year)`, 'i'))
    if (renews) {
      const yearly = /^y/i.test(renews[2])
      add({
        kind: 'subscription',
        label: `Renews at $${renews[1]}/${yearly ? 'yr' : 'mo'}`,
        detail: 'Keeps charging until you cancel.',
        quote: line,
        amount: money(renews[1]),
        inCart: false,
      })
      continue
    }

    const fee = line.match(new RegExp(String.raw`(service|processing|convenience|handling|delivery) fee[^$]{0,24}?${MONEY}`, 'i'))
    if (fee) {
      add({
        kind: 'fee',
        label: `${capitalize(fee[1])} fee`,
        detail: 'Added at checkout.',
        quote: line,
        amount: money(fee[2]),
        inCart: page.isCheckout,
      })
      continue
    }

    const shipping = line.match(new RegExp(String.raw`(?:shipping|delivery)[^$]{0,24}?${MONEY}`, 'i'))
    if (shipping && page.isCheckout && !/free/i.test(line)) {
      add({ kind: 'shipping', label: 'Shipping', detail: 'Added to your order total.', quote: line, amount: money(shipping[1]), inCart: true })
    }
  }

  return dedupe(findings)
}

// ── On-device AI ─────────────────────────────────────────────────────────

const KINDS: FindingKind[] = ['addon', 'shipping', 'fee', 'financing', 'late_fee', 'subscription', 'returns']

export const AI_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS },
          label: { type: 'string', maxLength: 48 },
          detail: { type: 'string', maxLength: 110 },
          quote: { type: 'string', maxLength: 280 },
          amount: { type: 'number' },
          months: { type: 'integer' },
        },
        required: ['kind', 'label', 'detail', 'quote', 'amount', 'months'],
      },
    },
  },
  required: ['findings'],
}

export const AI_SYSTEM_PROMPT = `You protect shoppers on tight budgets. You read text from a shopping page and list anything that makes the purchase cost more than the sticker price, or that could cost the shopper money later.

Kinds:
- addon: extra product or plan already selected (protection plan, warranty, membership). amount = dollars.
- shipping / fee: charges added at checkout. amount = dollars.
- financing: pay-over-time offers with interest. amount = APR percent. months = term if stated.
- late_fee: fees for missed payments. amount = dollars.
- subscription: trials or plans that renew and keep charging. amount = dollars per month.
- returns: restocking fees, short return windows, final sale. amount = percent, or 0.

Use 0 for amount or months when the page doesn't state one.

Rules:
- quote must be copied exactly from the page text, word for word.
- Only include things that are actually on the page. Never guess numbers.
- Skip anything free, $0, or 0% APR.
- label: under 6 words. detail: one plain sentence a teenager would understand.
- If nothing qualifies, return an empty list.`

export function buildAiPrompt(page: PageSnapshot) {
  return [
    `Site: ${page.host}`,
    `Product: ${page.title}`,
    page.price ? `Price: $${page.price}` : '',
    page.selected.length ? `Already selected options:\n${page.selected.map((line) => `- ${line}`).join('\n')}` : '',
    `Page text:\n${page.snippets.map((line) => `- ${line}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

interface AiFinding {
  kind: FindingKind
  label: string
  detail: string
  quote: string
  amount: number
  months: number
}

/**
 * Keeps only AI findings that point at real text on the page and whose
 * numbers appear in that text, so the model can't invent charges.
 */
export function verifyAiFindings(page: PageSnapshot, raw: AiFinding[]): Finding[] {
  const sources = [...page.selected, ...page.snippets]
  const normalized = sources.map(normalize)
  const verified: Finding[] = []

  for (const item of raw) {
    if (!KINDS.includes(item.kind) || !item.quote) continue
    const quote = normalize(item.quote)
    const index = normalized.findIndex((source) => source.includes(quote) || (quote.length > 24 && quote.includes(source)))
    if (index === -1) continue
    const source = sources[index]
    const amount = item.amount > 0 ? item.amount : null
    if (amount === null && (COST_KINDS.includes(item.kind) || item.kind === 'financing')) continue
    if (amount !== null && !mentionsNumber(source, amount)) continue

    verified.push({
      kind: item.kind,
      label: shorten(item.label, 42),
      detail: item.detail,
      quote: source,
      amount,
      apr: item.kind === 'financing' ? amount! : undefined,
      months: item.months > 0 ? item.months : undefined,
      inCart: item.kind === 'addon' ? page.selected.includes(source) : COST_KINDS.includes(item.kind) && page.isCheckout,
      source: 'ai',
    })
  }
  return verified
}

/** Rule findings win on numbers; the AI fills in what rules missed and explains in plain words. */
export function mergeFindings(rules: Finding[], ai: Finding[]) {
  const merged = rules.map((rule) => {
    const match = ai.find((item) => item.kind === rule.kind && (item.quote === rule.quote || item.amount === rule.amount))
    return match ? { ...rule, detail: match.detail, source: 'ai' as const } : rule
  })
  for (const item of ai) {
    if (!merged.some((existing) => existing.kind === item.kind && (existing.quote === item.quote || existing.amount === item.amount))) {
      merged.push(item)
    }
  }
  return dedupe(merged)
}

// ── Money math ───────────────────────────────────────────────────────────

export const TYPICAL_CARD_APR = 22
export const DEFAULT_TERM_MONTHS = 12

export interface PayOption {
  id: string
  name: string
  note: string
  total: number
  interest: number
  monthly: number
  months: number
}

/** Total paid on a fixed-rate loan with equal monthly payments. */
export function financedTotal(principal: number, apr: number, months: number) {
  const rate = apr / 100 / 12
  if (rate === 0) return principal
  const monthly = (principal * rate) / (1 - (1 + rate) ** -months)
  return monthly * months
}

export function extrasInCart(findings: Finding[]) {
  return findings.filter((item) => item.inCart && COST_KINDS.includes(item.kind) && item.amount).reduce((sum, item) => sum + item.amount!, 0)
}

export function payOptions(principal: number, findings: Finding[]): PayOption[] {
  const options: PayOption[] = []
  const financing = findings
    .filter((item) => item.kind === 'financing' && item.apr)
    .sort((a, b) => b.apr! - a.apr!)[0]

  if (financing) {
    const months = financing.months ?? DEFAULT_TERM_MONTHS
    const total = financedTotal(principal, financing.apr!, months)
    options.push({
      id: 'site',
      name: 'Financing on this page',
      note: `${financing.apr}% APR · ${months} months`,
      total,
      interest: total - principal,
      monthly: total / months,
      months,
    })
  }

  const cardTotal = financedTotal(principal, TYPICAL_CARD_APR, DEFAULT_TERM_MONTHS)
  options.push({
    id: 'card',
    name: 'Typical credit card',
    note: `${TYPICAL_CARD_APR}% APR · paid off in ${DEFAULT_TERM_MONTHS} months`,
    total: cardTotal,
    interest: cardTotal - principal,
    monthly: cardTotal / DEFAULT_TERM_MONTHS,
    months: DEFAULT_TERM_MONTHS,
  })
  return options
}

// ── Helpers ──────────────────────────────────────────────────────────────

function normalize(value: string) {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
}

function mentionsNumber(text: string, value: number) {
  const digits = text.replace(/,/g, '')
  const plain = String(value)
  return digits.includes(plain) || digits.includes(value.toFixed(2)) || digits.includes(String(Math.round(value)))
}

function shorten(value: string, max: number) {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function dedupe(findings: Finding[]) {
  const seen = new Set<string>()
  return findings.filter((item) => {
    const key = `${item.kind}:${item.amount ?? item.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
