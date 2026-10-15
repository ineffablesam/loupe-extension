import { MARKETPLACE_PAYS, capturedOn, catalogSize, findOnMarketplace, loadCatalog, marketplaceImage, marketplaceUrl, type MarketplaceItem } from '../data/marketplace'
import { COST_KINDS, extrasInCart, findWithRules, mergeFindings, type Finding } from '../lib/fine-print'
import { collectPage, type OrderSummary, type PageSnapshot } from '../lib/page-reader'
import { perpayPlan, usd, type PerpayPlan } from '../lib/perpay-plan'
import { hoursText, paydays, shortDate, weekday, workHours, type Paycheck } from '../lib/paycheck'
import type { LoupeSession } from '../lib/session'
import { BANNER_CSS, PAGE_CSS } from './styles'

const BANNER_ID = 'loupe-banner'
const PAGE_STYLE_ID = 'loupe-page-style'
const NOTE = 'loupe-note'
const MARK = 'loupe-mark'
const CHIP = 'loupe-chip'
const SESSION_KEY = 'loupe-session'
const RECENT_KEY = 'loupe-recent'
const PENDING_KEY = 'loupe-pending'
const REMINDERS_KEY = 'loupe-reminders'

/** Inline spots under the price on stores we know; anywhere else Loupe floats in the corner. */
const ANCHORS = [
  // Amazon
  '#corePriceDisplay_desktop_feature_div',
  '#corePrice_feature_div',
  '#apex_desktop',
  '#price',
  // Walmart
  '[data-testid="price-wrap"]',
  '[data-seo-id="hero-price"]',
]

interface Report {
  page: PageSnapshot
  findings: Finding[]
  match: MarketplaceItem | null
  /** What Loupe remembers about this product from earlier visits. */
  seen: Viewed | null
}

interface PriceChange {
  from: number
  to: number
  at: number
}

interface Deadline {
  id: string
  date: number
  label: string
  body: string
}

interface Annotation {
  finding: Finding
  el: Element
  note: HTMLElement
}

/** Products you looked at, so checkout (which rarely names items clearly) still knows the Perpay listing, the price you saw, and the return window. */
interface Viewed {
  title: string
  /** The store, so the side panel can line up prices across stores. */
  host?: string
  price: number
  item: MarketplaceItem | null
  /** When you first saw it at this price. */
  at: number
  /** The price before it last changed. */
  was?: { price: number; at: number }
  returnDays?: number
}

let catalogRequested = false

/** Loupe only shows up on pages once you've signed in with Perpay. */
let signedIn = false
let spendingLimit: number | null = null
let paycheck: Paycheck | null = null
let remindersSet = new Set<string>()
/** Deadlines from the last checkout, offered again once the order is placed. */
let pending: Deadline[] = []
let aiFindings: { url: string; findings: Finding[] } | null = null
let viewed: Viewed[] = []
let lastSignature = ''
let dismissedOn: string | null = null
let annotations: Annotation[] = []

// ── Analysis ─────────────────────────────────────────────────────────────

function analyze(): Report | null {
  // Our own notes are page text too; hide them while reading so Loupe never reads itself.
  document.documentElement.classList.add('loupe-reading')
  const page = collectPage()
  document.documentElement.classList.remove('loupe-reading')
  if (!page.price) return null
  const rules = findWithRules(page)
  const ai = aiFindings?.url === page.url ? aiFindings.findings : []
  const findings = mergeFindings(rules, ai)

  ensureCatalog()
  if (page.order) {
    const seen = findInOrder()
    return { page, findings, match: seen?.item ?? null, seen }
  }
  // Search and category pages mix many products, so only a pre-ticked charge is worth a banner there.
  if (!page.isProduct) return findings.some(isCost) ? { page, findings, match: null, seen: null } : null

  const match = findOnMarketplace(page.title, page.price)
  const seen = remember(page, match, findings)
  if (findings.length === 0 && !match && !priceChange({ page, findings, match, seen })) return null
  return { page, findings, match, seen }
}

/** The catalogue is only parsed on shopping pages. */
function ensureCatalog() {
  if (catalogRequested) return
  catalogRequested = true
  loadCatalog().then(() => {
    lastSignature = ''
    refresh()
  }, () => {})
}

const viewKey = (title: string) => squash(title).slice(0, 60)

function remember(page: PageSnapshot, item: MarketplaceItem | null, findings: Finding[]) {
  const price = page.price!
  const host = location.hostname.replace(/^www\./, '')
  const previous = viewed.find((v) => viewKey(v.title) === viewKey(page.title) && (!v.host || v.host === host))
  const changed = !!previous && Math.abs(previous.price - price) >= 0.01
  const entry: Viewed = {
    title: page.title,
    host,
    price,
    item: item ?? previous?.item ?? null,
    at: previous && !changed ? previous.at : Date.now(),
    was: changed ? { price: previous.price, at: previous.at } : previous?.was,
    returnDays: findings.find((f) => f.kind === 'returns' && f.days)?.days ?? previous?.returnDays,
  }
  if (previous && viewed[0] === previous && JSON.stringify(previous) === JSON.stringify(entry)) return previous
  viewed = [entry, ...viewed.filter((v) => v !== previous)].slice(0, 12)
  chrome.storage.local.set({ [RECENT_KEY]: viewed }).catch(() => {})
  return entry
}

/** The most recent product you viewed that this order contains, by name, or by price for Perpay matches. */
function findInOrder() {
  const text = squash(document.body.innerText)
  return viewed.find((v) => text.includes(squash(v.title).slice(0, 28)) || (v.item && text.includes(usd(v.price, 'always')))) ?? null
}

/** The first price after the product's name on the page, which is its line in the order. */
function linePrice(seen: Viewed) {
  const text = squash(document.body.innerText)
  const at = text.indexOf(squash(seen.title).slice(0, 28))
  if (at === -1) return null
  const found = text.slice(at, at + 400).match(/\$\s?([\d,]+\.\d{2})/)
  return found ? Number(found[1].replace(/,/g, '')) : null
}

const RECENT_CHANGE_MS = 30 * 864e5

function priceChange({ page, seen }: Report): PriceChange | null {
  if (!seen) return null
  if (page.order) {
    const now = linePrice(seen)
    return now && Math.abs(now - seen.price) >= 1 ? { from: seen.price, to: now, at: seen.at } : null
  }
  const was = seen.was
  return was && Date.now() - was.at < RECENT_CHANGE_MS && Math.abs(was.price - page.price!) >= 1 ? { from: was.price, to: page.price!, at: was.at } : null
}

/** Return windows and trials on this order, as dates. */
function deadlines({ page, findings, seen }: Report): Deadline[] {
  const list: Deadline[] = []
  const today = new Date()
  const start = page.order?.arrives ? new Date(`${page.order.arrives}T12:00:00`) : today
  const returnDays = findings.find((f) => f.kind === 'returns' && f.days)?.days ?? seen?.returnDays
  if (returnDays) {
    const date = addDays(start, returnDays)
    const name = shortName(seen?.title ?? page.title)
    list.push({
      id: `return:${viewKey(name)}:${dayKey(date)}`,
      date: date.getTime(),
      label: `Last day to return ${esc(name)}`,
      body: `Your ${returnDays}-day return window for ${name} closes ${shortDate(date)}.`,
    })
  }
  for (const trial of findings.filter((f) => f.kind === 'subscription' && f.days)) {
    const date = addDays(today, trial.days!)
    const name = trial.label.replace(/ ends after.*/, '')
    list.push({
      id: `trial:${viewKey(name)}:${dayKey(date)}`,
      date: date.getTime(),
      label: `${esc(name)} ends${trial.amount ? `, then ${usd(trial.amount, 'always')}` : ' and starts charging'}`,
      body: `${name} ends ${shortDate(date)}. Cancel before then if you don't want to pay for it.`,
    })
  }
  return list.sort((a, b) => a.date - b.date)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10)

function shortName(title: string) {
  const short = title.split(/\s[-–—|,(]\s?|\s(?=Wireless|with)\b/)[0].trim()
  return short.length > 40 ? `${short.slice(0, 39).trimEnd()}…` : short
}

function refresh() {
  if (!extensionAlive() || !signedIn) return teardown()
  if (dismissedOn === location.href) return
  const results = listingResults()
  if (results.length >= 2) {
    if (document.getElementById(BANNER_ID)) teardown()
    lastSignature = 'listing'
    ensureCatalog()
    decorateListing(results)
    return
  }
  if (isConfirmation()) {
    const signature = JSON.stringify(['placed', pending, [...remindersSet]])
    if (signature === lastSignature && document.getElementById(BANNER_ID)) return
    lastSignature = signature
    return pending.length ? renderPlaced(pending, !document.getElementById(BANNER_ID)) : teardown()
  }
  const report = analyze()
  const signature = report
    ? JSON.stringify([
        report.page.price,
        report.page.title,
        report.page.order,
        report.match?.id,
        report.findings.map((f) => [f.kind, f.amount, f.inCart, f.label]),
        priceChange(report),
        [...remindersSet],
        !!paycheck,
      ])
    : ''
  if (signature === lastSignature && document.getElementById(BANNER_ID)) {
    // Stores re-render parts of the page; put back any notes that got swept away.
    if (report && annotations.some((a) => !a.note.isConnected || !a.el.isConnected)) annotate(annotatable(report))
    return
  }
  lastSignature = signature
  if (!report) return teardown()
  const animate = !document.getElementById(BANNER_ID)
  if (report.page.order) renderCheckout(report, report.page.order, animate)
  else render(report, animate)
}

// ── Search results ───────────────────────────────────────────────────────

/** Where each store keeps a result's name and price on its search and category pages. */
const LISTINGS = [
  {
    // Amazon
    path: /^\/s(\/|$)/,
    card: '[data-component-type="s-search-result"]',
    title: ['[data-cy="title-recipe"]', 'h2'],
    price: ['.a-price:not(.a-text-price) .a-offscreen'],
    spot: ['[data-cy="price-recipe"]', '.a-price:not(.a-text-price)'],
  },
  {
    // Walmart
    path: /^\/(search|browse|cp|shop)\b/,
    card: '[data-item-id]',
    title: ['[data-automation-id="product-title"]'],
    price: ['[data-testid="unified-global-product-price-a11y-text"]', '[data-automation-id="product-price"]'],
    spot: ['[data-testid="unified-global-product-price"]', '[data-automation-id="product-price"]'],
  },
  {
    // Best Buy
    path: /searchpage|\.c$|pcmcat/,
    card: 'li.product-list-item',
    title: ['h3.product-title', '.sku-title'],
    price: ['[data-testid="price-block-customer-price"]'],
    spot: ['.pricing', '[data-testid="price-block"]'],
  },
]

function listingResults() {
  for (const store of LISTINGS) {
    if (!store.path.test(location.pathname)) continue
    const cards = [...document.querySelectorAll(store.card)]
    if (cards.length >= 2) return cards.map((card) => ({ card, store }))
  }
  return []
}

const first = (card: Element, selectors: string[]) =>
  selectors.map((selector) => card.querySelector<HTMLElement>(selector)).find((el) => el && (el.innerText || el.textContent)) ?? null

/** A result's own price, skipping "Save $54", "Comp. Value", and monthly-payment lines. */
function cardPrice(card: Element, selectors: string[]) {
  // The store's own price text may go on to the old price ("Now $429.00 Was $549.99"); keep what comes first.
  const own = (first(card, selectors)?.textContent ?? '').split(/\b(?:was|list|reg|comp)/i)[0]
  const lines = [own, ...((card as HTMLElement).innerText ?? '').split('\n')]
  for (const line of lines) {
    if (!line.includes('$') || /save|comp\.?\s*value|was|list|reg\.|open-?box|options from|\/mo|month|paycheck/i.test(line)) continue
    const found = line.replace(/\s/g, '').match(/\$([\d,]+)(\.\d{2})?/)
    if (!found) continue
    const [, whole, cents] = found
    // "$495" with superscript cents reads as "$49500"; real four-digit prices carry a comma.
    if (!cents && !whole.includes(',') && whole.length >= 4) return Number(whole) / 100
    return Number(whole.replace(/,/g, '') + (cents ?? ''))
  }
  return null
}

/** Puts the Perpay price under each result that the Marketplace also sells. */
function decorateListing(results: ReturnType<typeof listingResults>) {
  injectPageStyle()
  checkMatchCache()
  let learned = false
  for (const { card, store } of results) {
    const title = squash(first(card, store.title)?.innerText ?? '').replace(/^sponsored\s*/i, '')
    const price = cardPrice(card, store.price)
    const spot = (store.spot.length ? first(card, store.spot) : null) ?? (price ? heroPrice(price, card, Infinity) : null)
    const key = `${title}|${price}`
    if (!title || !price || !spot || card.getAttribute('data-loupe') === key) continue

    if (!(key in matchCache) && catalogSize()) {
      matchCache[key] = findOnMarketplace(title, price)
      learned = true
    }
    const existing = card.querySelector(`.${CHIP}`)
    if (!(key in matchCache)) {
      // Still loading the catalogue: hold the spot the way the store does.
      if (!existing) noteSpot(spot).after(Object.assign(document.createElement('span'), { className: `${CHIP} ${CHIP}--loading` }))
      continue
    }
    card.setAttribute('data-loupe', key)
    existing?.remove()
    const item = matchCache[key]
    if (!item) continue

    const plan = perpayPlan(item, spendingLimit ?? Infinity)
    const chip = document.createElement('a')
    chip.className = CHIP
    chip.href = marketplaceUrl(item)
    chip.target = '_blank'
    chip.rel = 'noopener'
    chip.title = `${item.name} on the Perpay Marketplace: ${usd(plan.total, 'always')} with shipping, over ${plan.pays} paychecks at 0% interest. Price as of ${capturedOn()}.`
    chip.innerHTML = `<span class="${CHIP}-brand"><img src="${chrome.runtime.getURL('images/perpay-logo.svg')}" alt="Perpay" /></span><span class="${CHIP}-price"><b>${usd(plan.perPay)}</b>/paycheck</span>`
    chip.addEventListener('click', (event) => event.stopPropagation())
    noteSpot(spot).after(chip)
  }
  if (learned) saveMatches()
}

/** Results already matched on earlier visits, so their Perpay price shows before the catalogue loads. */
let matchCache: Record<string, MarketplaceItem | null> = {}
/** The catalogue snapshot the cached matches came from. */
let matchCacheOn = ''
const MATCHES_KEY = 'loupe-matches'
const saveMatches = debounce(() => {
  const keys = Object.keys(matchCache)
  for (const key of keys.slice(0, Math.max(0, keys.length - 600))) delete matchCache[key]
  chrome.storage.local.set({ [MATCHES_KEY]: { on: matchCacheOn, items: matchCache } }).catch(() => {})
}, 1500)

function checkMatchCache() {
  if (!catalogSize() || matchCacheOn === capturedOn()) return
  matchCache = {}
  matchCacheOn = capturedOn()
}

function clearChips() {
  document.querySelectorAll(`.${CHIP}`).forEach((chip) => chip.remove())
  document.querySelectorAll('[data-loupe]').forEach((card) => card.removeAttribute('data-loupe'))
}

/** The "order placed" page, where the checkout's deadlines are now real. */
function isConfirmation() {
  return /\b(thank ?you|thankyou|confirmation)\b/i.test(location.pathname) ||
    /order placed|thanks? (you )?for your order|your order (has been|is) (placed|confirmed)/i.test(document.body.innerText.slice(0, 4000))
}

function ordered(findings: Finding[]) {
  const costs = findings.filter(isCost)
  return [...costs, ...findings.filter((item) => !costs.includes(item))]
}

/** Checkout already itemises its costs, so only the watch-outs get notes there. */
function annotatable(report: Report) {
  return report.page.order ? report.findings.filter((item) => !isCost(item)) : ordered(report.findings)
}

const isCost = (item: Finding) => item.inCart && COST_KINDS.includes(item.kind) && !!item.amount

// ── Banner ───────────────────────────────────────────────────────────────

function bannerHost(anchor: Element | null) {
  let host = document.getElementById(BANNER_ID)
  const mode = anchor ? 'inline' : 'floating'
  if (host && host.dataset.mode !== mode) {
    host.remove()
    host = null
  }
  if (!host) {
    host = document.createElement('div')
    host.id = BANNER_ID
    host.dataset.mode = mode
    host.attachShadow({ mode: 'open' })
    if (anchor) anchor.after(host)
    else document.body.append(host)
  } else if (anchor && host.previousElementSibling !== anchor) {
    anchor.after(host)
  }
  return host
}

/** Matches a price as stores print it: "$495", "$495.00", or "$495" with superscript cents ("$49500" as text). */
function pricePattern(price: number) {
  const whole = Math.floor(price).toLocaleString('en-US').replace(/,/g, ',?')
  return new RegExp(String.raw`\$\s?${whole}(?:\.\d{2}|\d{2})?(?![\d,])`)
}

/** Any store's main price: the largest text showing this price near the top of the page. */
function heroPrice(price: number, scope: Element = document.body, maxTop = 1400): Element | null {
  const digits = String(Math.floor(price))
  const pattern = pricePattern(price)
  let best: { el: Element; size: number; top: number } | null = null
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.replace(/,/g, '').includes(digits)) continue
    const parent = node.parentElement
    if (!parent || parent.closest(`#${BANNER_ID}, .${NOTE}, .${CHIP}, script, style, noscript, s, del`)) continue
    const rect = parent.getBoundingClientRect()
    const top = rect.top + scrollY
    if (rect.width === 0 || rect.height === 0 || top > maxTop) continue
    // The price block is the nearest ancestor that holds the whole "$495.00".
    let el: Element | null = parent
    for (let depth = 0; el && depth < 4 && !pattern.test(squash((el as HTMLElement).innerText ?? '').replace(/\s/g, '')); depth++) el = el.parentElement
    if (!el || !pattern.test(squash((el as HTMLElement).innerText ?? '').replace(/\s/g, ''))) continue
    const size = parseFloat(getComputedStyle(parent).fontSize)
    if (!best || size > best.size + 0.5 || (Math.abs(size - best.size) <= 0.5 && top < best.top)) best = { el, size, top }
  }
  return best?.el ?? null
}

/** The order summary box on checkout: the widest narrow column around the "Order total" line. */
function orderSummaryBox() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!/^\s*(order total|estimated total)\b/i.test(node.textContent ?? '')) continue
    let box: Element | null = node.parentElement
    if (!box || box.closest(`#${BANNER_ID}`)) continue
    for (let el = box.parentElement, depth = 0; el && el !== document.body && depth < 8; el = el.parentElement, depth++) {
      if (el.getBoundingClientRect().width > 480) break
      // Stop at the column itself, so Loupe goes inside it rather than becoming a new column beside it.
      const parent = el.parentElement && getComputedStyle(el.parentElement)
      if (parent && parent.display.includes('flex') && !parent.flexDirection.startsWith('column')) break
      box = el
    }
    if (box.getBoundingClientRect().width > 0) return box
  }
  return null
}

function render(report: Report, animate: boolean) {
  injectPageStyle()
  const { page, findings, match } = report
  const price = page.price!
  const anchor = ANCHORS.map((selector) => document.querySelector(selector)).find((el) => el && el.getBoundingClientRect().width > 0) ?? heroPrice(price)
  const host = bannerHost(anchor ? cardSpot(anchor) : null)
  const root = host.shadowRoot!
  const extras = extrasInCart(findings)
  const total = price + extras
  const items = ordered(findings)
  const costs = items.filter(isCost)
  const risks = items.filter((item) => !isCost(item))
  const plan = match ? perpayPlan(match, spendingLimit ?? Infinity) : null

  const headline =
    extras > 0
      ? `You’ll pay <span class="total" data-count="${total}">${usd(total)}</span><span class="was">, not ${usd(price)}</span>`
      : risks.length > 0
        ? `${usd(price)} is the full price. Worth knowing:`
        : `${usd(price)} is the full price. Nothing hidden.`

  root.innerHTML = `
    <style>${BANNER_CSS}</style>
    <div class="card ${host.dataset.mode}${animate ? ' enter' : ''}">
      ${topBar(host, 'Loupe checked this page')}
      <p class="headline">${headline}</p>
      ${workLine(total)}
      ${changeLine(priceChange(report))}
      ${
        items.length
          ? `<ul>${costs
              .map(
                (item, index) => `<li>
                  <span class="text">${esc(costLine(item))} <span class="amt">+${usd(item.amount!)}</span></span>
                  ${item.kind === 'addon' ? `<button class="link" data-remove="${index}">Remove</button>` : ''}
                </li>`,
              )
              .join('')}${riskRows(risks, costs.length)}</ul>`
          : ''
      }
      ${plan ? perpayOffer(plan, { lead: `Get it for`, cta: 'View on Perpay' }) : ''}
    </div>`

  wire(root, items)
  root.querySelectorAll<HTMLElement>('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => untick(costs[Number(button.dataset.remove)]))
  })
  if (animate) countUp(root.querySelector<HTMLElement>('[data-count]'))
  annotate(items)
}

function renderCheckout(report: Report, order: OrderSummary, animate: boolean) {
  injectPageStyle()
  const { findings, match } = report
  const host = bannerHost(orderSummaryBox())
  const root = host.shadowRoot!
  const risks = findings.filter((item) => !isCost(item) && !item.days)
  const dates = deadlines(report)
  const plan = match ? perpayPlan(match, spendingLimit ?? Infinity) : null
  if (JSON.stringify(dates) !== JSON.stringify(pending)) {
    pending = dates
    chrome.storage.local.set({ [PENDING_KEY]: dates }).catch(() => {})
  }
  const added = [
    order.shipping ? `<li><span class="text">Shipping &amp; handling <span class="amt">+${usd(order.shipping, 'always')}</span></span></li>` : '',
    order.tax ? `<li><span class="text">Estimated tax <span class="amt">+${usd(order.tax, 'always')}</span></span></li>` : '',
  ].join('')

  root.innerHTML = `
    <style>${BANNER_CSS}</style>
    <div class="card ${host.dataset.mode}${animate ? ' enter' : ''}">
      ${topBar(host, 'Loupe checked your order')}
      <p class="headline">Order total <span class="total" data-count="${order.total}">${usd(order.total, 'always')}</span></p>
      ${workLine(order.total)}
      ${order.items ? `<p class="sub">${usd(order.items, 'always')} in items, plus</p>` : ''}
      ${added || risks.length ? `<ul>${added}${riskRows(risks, 0)}</ul>` : ''}
      ${changeLine(priceChange(report))}
      ${datesBox(dates)}
      ${plan ? checkoutPromo(plan, order.total) : ''}
    </div>`

  wire(root, risks)
  wireReminders(root, dates)
  annotate(findings.filter((item) => !isCost(item)))
}

/** After the order goes through, offer the reminders again in case they were skipped at checkout. */
function renderPlaced(dates: Deadline[], animate: boolean) {
  const host = bannerHost(null)
  const root = host.shadowRoot!
  root.innerHTML = `
    <style>${BANNER_CSS}</style>
    <div class="card ${host.dataset.mode}${animate ? ' enter' : ''}">
      ${topBar(host, 'Loupe')}
      <p class="headline">Order placed. Don't miss these dates.</p>
      ${datesBox(dates, true)}
    </div>`
  wire(root, [])
  wireReminders(root, dates)
}

function workLine(amount: number) {
  if (!paycheck) return ''
  return `<p class="work">${CLOCK} About <b>${hoursText(workHours(amount, paycheck))}</b> of your work</p>`
}

function changeLine(change: PriceChange | null) {
  if (!change) return ''
  const up = change.to > change.from
  return `<p class="change ${up ? 'up' : 'down'}">
    ${up ? '▲' : '▼'} ${up ? 'Up' : 'Down'} <b>${usd(Math.abs(change.to - change.from), 'always')}</b> since you looked ${when(change.at)}
    <span class="was">(was ${usd(change.from, 'always')})</span>
  </p>`
}

function datesBox(dates: Deadline[], bare = false) {
  if (!dates.length) return ''
  const set = dates.every((d) => remindersSet.has(d.id))
  return `<div class="dates${bare ? ' bare' : ''}">
    ${bare ? '' : '<p class="dates-title">Dates to remember</p>'}
    <ul>${dates.map((d) => `<li><span class="when">${weekday(d.date)}, ${shortDate(d.date)}</span><span class="what">${d.label}</span></li>`).join('')}</ul>
    <button class="remind" data-action="remind" ${set ? 'disabled' : ''}>${set ? '✓ Loupe will remind you' : 'Remind me 2 days before'}</button>
  </div>`
}

function wireReminders(root: ShadowRoot, dates: Deadline[]) {
  root.querySelector<HTMLButtonElement>('[data-action="remind"]')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement
    button.disabled = true
    button.textContent = '✓ Loupe will remind you'
    chrome.runtime
      .sendMessage({ type: 'LOUPE_REMIND', url: location.href, reminders: dates.map(({ id, date, body }) => ({ id, date, body })) })
      .catch(() => {})
  })
}

function when(at: number) {
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(at)) / 864e5)
  if (days <= 0) return 'earlier today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `on ${new Date(at).toLocaleDateString('en-US', { weekday: 'long' })}`
  return `on ${shortDate(at)}`
}

function startOfDay(at: number) {
  const date = new Date(at)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const CLOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'

function topBar(host: HTMLElement, label: string) {
  return `<div class="top">
    <img class="icon" src="${chrome.runtime.getURL('icons/icon32.png')}" alt="" /><span>${label}</span>
    <span class="spacer"></span>
    <button class="link" data-action="open">Details</button>
    ${host.dataset.mode === 'floating' ? '<button class="close" data-action="close" aria-label="Hide">×</button>' : ''}
  </div>`
}

function riskRows(risks: Finding[], offset: number) {
  return risks
    .map(
      (item, index) => `<li>
        <span class="bullet">•</span><span class="text">${esc(item.label)}</span>
        <button class="link" data-show="${offset + index}">Show</button>
      </li>`,
    )
    .join('')
}

function perpayOffer(plan: PerpayPlan, copy: { lead: string; cta: string }) {
  return `<div class="promo">
    <span class="badge">On Perpay</span>
    <div class="row">
      <img class="thumb" src="${marketplaceImage(plan.item)}" alt="" />
      <div class="deal offer">
        <span class="lead">${copy.lead}</span>
        <span class="each"><b>${usd(plan.perPay, 'always')}</b> a paycheck${terms(plan)}</span>
        <small>${[limitNote(plan), '0% interest'].filter(Boolean).join(' · ')}</small>
      </div>
    </div>
    ${timeline(plan)}
    <a class="btn" href="${marketplaceUrl(plan.item)}" target="_blank" rel="noopener">${copy.cta}</a>
  </div>`
}

function checkoutPromo(plan: PerpayPlan, total: number) {
  return `<div class="promo">
    <span class="badge">Pay over time</span>
    <p class="hook">Don't want to pay ${usd(total, 'always')} today?</p>
    <div class="row">
      <img class="thumb" src="${marketplaceImage(plan.item)}" alt="" />
      <div class="deal">
        Take it home for <b>${usd(plan.perPay, 'always')}</b> a paycheck${terms(plan)}
        ${paycheck ? `<small>About ${hoursText(workHours(plan.perPay, paycheck))} of work each payday</small>` : ''}
      </div>
    </div>
    ${timeline(plan)}
    <ul class="perks">
      ${limitNote(plan) ? `<li${plan.withinLimit ? '' : ' class="no"'}>${limitNote(plan)}</li>` : ''}
      <li>0% interest</li>
      <li>Builds your credit</li>
    </ul>
    <a class="btn" href="${marketplaceUrl(plan.item)}" target="_blank" rel="noopener">Get it on Perpay</a>
    <p class="fine">Same ${esc(plan.item.name)}, sold by the Perpay Marketplace.</p>
  </div>`
}

/** Shoppers are already Perpay members, so speak to their own account rather than to sign-up perks. */
function limitNote(plan: PerpayPlan) {
  if (spendingLimit == null) return ''
  return plan.withinLimit ? `Fits your ${usd(spendingLimit)} limit` : `${usd(Math.ceil(plan.overLimitBy))} over your limit`
}

/** The plan on your real paydays, so "10 paychecks" has a finish line. */
function timeline(plan: PerpayPlan) {
  if (!paycheck) return ''
  const days = paydays(paycheck, plan.pays)
  const last = days[days.length - 1]
  return `<div class="timeline">
    <div class="dots">${days.map((d, i) => `<span title="Payment ${i + 1} · ${weekday(d)}, ${shortDate(d)} · ${usd(plan.perPay, 'always')}"></span>`).join('')}</div>
    <div class="ends"><span>First payday ${weekday(days[0])}, ${shortDate(days[0])}</span><span>Paid off ${shortDate(last, true)}</span></div>
  </div>`
}

function terms(plan: PerpayPlan) {
  return `<span class="terms" tabindex="0">*
    <span class="tip" role="tooltip">
      <dl>
        <dt>${esc(plan.item.name)}</dt><dd>${usd(plan.item.price, 'always')}</dd>
        <dt>Shipping</dt><dd>${plan.item.shipping ? usd(plan.item.shipping, 'always') : 'Free'}</dd>
        <dt class="sum">${MARKETPLACE_PAYS} paychecks, 0% interest</dt><dd class="sum">${usd(plan.total, 'always')}</dd>
      </dl>
      <p>${plan.withinLimit ? 'Fits your spending limit.' : `${usd(plan.overLimitBy)} over your spending limit.`}${plan.item.bundle ? ' Sold as a bundle with extras.' : ''} Perpay Marketplace price as of ${esc(capturedOn())}.</p>
    </span></span>`
}

function wire(root: ShadowRoot, items: Finding[]) {
  root.querySelector('[data-action="open"]')?.addEventListener('click', openPanel)
  root.querySelector('[data-action="close"]')?.addEventListener('click', () => {
    dismissedOn = location.href
    teardown()
  })
  root.querySelectorAll<HTMLElement>('[data-show]').forEach((button) => {
    button.addEventListener('click', () => show(items[Number(button.dataset.show)]))
  })
}

function costLine(item: Finding) {
  if (item.kind === 'addon') return `${item.label} is ticked`
  return item.label
}

function countUp(el: HTMLElement | null) {
  if (!el) return
  const target = Number(el.dataset.count)
  const start = performance.now()
  const from = target * 0.85
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 800)
    const eased = 1 - (1 - t) ** 3
    el.textContent = usd(Math.round(from + (target - from) * eased))
    if (t < 1) requestAnimationFrame(tick)
    else el.textContent = usd(target)
  }
  requestAnimationFrame(tick)
}

// ── Notes in the page itself ─────────────────────────────────────────────

function annotate(findings: Finding[]) {
  clearAnnotations()
  for (const finding of findings) {
    const el = locate(finding.quote)
    if (!el || annotations.some((a) => a.el === el)) continue
    const cost = isCost(finding)
    el.classList.add(MARK, `${MARK}--${cost ? 'cost' : 'watch'}`)
    const note = document.createElement('div')
    note.className = `${NOTE} ${NOTE}--${cost ? 'cost' : 'watch'}`
    note.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon32.png')}" alt="Loupe" /><span>${noteText(finding)}</span>`
    noteSpot(el).after(note)
    escapeClipping(note)
    annotations.push({ finding, el, note })
  }
}

/** Some store boxes have a fixed height; a note inside one would spill over the next row, so move it below the box. */
function escapeClipping(note: HTMLElement) {
  for (let ancestor = note.parentElement, depth = 0; ancestor && ancestor !== document.body && depth < 8; ancestor = ancestor.parentElement, depth++) {
    if (ancestor.scrollHeight > ancestor.clientHeight + 1) ancestor.after(note)
  }
}

function noteText(item: Finding) {
  if (item.kind === 'addon' && item.amount) return `Adds <span class="loupe-amt">${usd(item.amount)}</span> to your order. Untick it if you don’t need it.`
  if (isCost(item)) return `<span class="loupe-amt">+${usd(item.amount!)}</span> ${esc(item.detail)}`
  return `<b>${esc(item.label)}.</b> ${esc(item.detail)}`
}

/** Notes go after the nearest block, outside links and labels, so they never become clickable. */
function noteSpot(el: Element) {
  let spot = el.closest('a, label, button') ?? el
  for (let depth = 0; depth < 4 && spot.parentElement; depth++) {
    const display = getComputedStyle(spot).display
    const parent = getComputedStyle(spot.parentElement)
    const inRow = parent.display.includes('flex') && !parent.flexDirection.startsWith('column') && parent.flexWrap === 'nowrap'
    if (!display.startsWith('inline') && !inRow && !['TD', 'TH', 'LI'].includes(spot.tagName)) break
    spot = spot.parentElement
  }
  return spot
}

/** Where the card goes under the price: out of any side-by-side row inside the buy box, so it gets the column's full width. */
function cardSpot(el: Element) {
  let spot = noteSpot(el)
  for (let depth = 0; depth < 6; depth++) {
    const parent = spot.parentElement
    if (!parent || parent === document.body || parent.getBoundingClientRect().width > 520) break
    const style = getComputedStyle(parent)
    const row = (style.display.includes('flex') && !style.flexDirection.startsWith('column')) ||
      (style.display.includes('grid') && style.gridTemplateColumns.trim().split(/\s+/).length > 1)
    if (!row && spot.getBoundingClientRect().width >= 240) break
    spot = parent
  }
  return spot
}

function clearAnnotations() {
  for (const { el, note } of annotations) {
    el.classList.remove(MARK, `${MARK}--cost`, `${MARK}--watch`, 'loupe-flash')
    note.remove()
  }
  document.querySelectorAll(`.${NOTE}`).forEach((note) => note.remove())
  annotations = []
}

function show(finding: Finding) {
  const entry = annotations.find((a) => a.finding === finding)
  if (!entry) return
  entry.el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  entry.el.classList.remove('loupe-flash')
  void (entry.el as HTMLElement).offsetWidth
  entry.el.classList.add('loupe-flash')
}

/** Unticks a pre-selected add-on through the store's own checkbox, so the store updates its total too. */
function untick(finding: Finding) {
  const entry = annotations.find((a) => a.finding === finding)
  let scope: Element | null = entry?.el ?? null
  for (let depth = 0; scope && depth < 4; depth++, scope = scope.parentElement) {
    const box = scope.querySelector<HTMLInputElement>('input[type="checkbox"]:checked')
    if (box) {
      box.click()
      return
    }
  }
  if (entry) show(finding)
}

/** Finds the smallest visible element that contains the quoted text. */
function locate(quote: string): Element | null {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()
  const wanted = normalize(quote)
  // Sites split one visible line across many elements, so start from the longest
  // text node that belongs to the quote and climb until an element holds all of it.
  const candidates: { node: Node; length: number }[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = normalize(node.textContent ?? '')
    if (text.length < 4 || !(wanted.includes(text) || text.includes(wanted))) continue
    if (node.parentElement?.closest(`#${BANNER_ID}, .${NOTE}, .${CHIP}, script, style, noscript`)) continue
    candidates.push({ node, length: text.length })
  }
  candidates.sort((a, b) => b.length - a.length)
  for (const { node } of candidates.slice(0, 16)) {
    let el: Element | null = node.parentElement
    for (let depth = 0; el && depth < 5; depth++, el = el.parentElement) {
      if (!normalize((el as HTMLElement).innerText ?? '').includes(wanted)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && rect.height < 240) return el
      break
    }
  }
  return null
}

// ── Plumbing ─────────────────────────────────────────────────────────────

function injectPageStyle() {
  if (document.getElementById(PAGE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PAGE_STYLE_ID
  style.textContent = `@font-face{font-family:"Loupe Ndot";src:url("${chrome.runtime.getURL('fonts/ndot/Ndot57Caps-Regular.otf')}") format("opentype");font-display:block}${PAGE_CSS}`
  document.head.append(style)
}

function openPanel() {
  chrome.runtime.sendMessage({ type: 'LOUPE_OPEN_PANEL' }).catch(() => {})
}

function teardown() {
  document.getElementById(BANNER_ID)?.remove()
  clearAnnotations()
  clearChips()
  lastSignature = ''
}

/** After a dev reload the old script keeps running in open tabs with no extension behind it. */
function extensionAlive() {
  try {
    return !!chrome.runtime?.id
  } catch {
    return false
  }
}

function squash(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}

const isOurs = (node: Node) =>
  node instanceof Element && (node.id === BANNER_ID || node.classList.contains(NOTE) || node.classList.contains(CHIP) || !!node.closest(`#${BANNER_ID}, .${NOTE}, .${CHIP}`))

function start() {
  if (window.top !== window || document.getElementById(BANNER_ID)) return

  const soon = debounce(refresh, 250)
  const later = debounce(refresh, 900)

  const applySession = (session: LoupeSession | undefined) => {
    signedIn = !!session?.user
    spendingLimit = session?.user?.spendingLimit ?? null
    paycheck = session?.user?.paycheck ?? null
    lastSignature = ''
    refresh()
  }
  const reminderIds = (value: unknown) => new Set(((value as { id: string }[] | undefined) ?? []).map((r) => r.id))
  chrome.storage.local.get([SESSION_KEY, RECENT_KEY, PENDING_KEY, REMINDERS_KEY, MATCHES_KEY]).then((stored) => {
    viewed = (stored[RECENT_KEY] as Viewed[] | undefined) ?? []
    const matches = stored[MATCHES_KEY] as { on: string; items: typeof matchCache } | undefined
    matchCache = matches?.items ?? {}
    matchCacheOn = matches?.on ?? ''
    pending = (stored[PENDING_KEY] as Deadline[] | undefined) ?? []
    remindersSet = reminderIds(stored[REMINDERS_KEY])
    applySession(stored[SESSION_KEY] as LoupeSession | undefined)
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (RECENT_KEY in changes) viewed = (changes[RECENT_KEY].newValue as Viewed[] | undefined) ?? []
    if (PENDING_KEY in changes) pending = (changes[PENDING_KEY].newValue as Deadline[] | undefined) ?? []
    if (REMINDERS_KEY in changes) {
      remindersSet = reminderIds(changes[REMINDERS_KEY].newValue)
      refresh()
    }
    if (SESSION_KEY in changes) applySession(changes[SESSION_KEY].newValue as LoupeSession | undefined)
  })

  chrome.runtime.onMessage.addListener((message: { type?: string; url?: string; findings?: Finding[] }) => {
    if (message?.type !== 'LOUPE_FINDINGS' || !message.url || !message.findings) return
    aiFindings = { url: message.url, findings: message.findings }
    refresh()
  })

  new MutationObserver((mutations) => {
    const ours = mutations.every(
      (m) => {
        const nodes = [...m.addedNodes, ...m.removedNodes]
        return isOurs(m.target) || (nodes.length > 0 && nodes.every(isOurs)) || m.target === document.head
      },
    )
    if (!ours) later()
  }).observe(document.body, { childList: true, subtree: true, characterData: true })

  document.addEventListener('change', soon, true)

  let href = location.href
  setInterval(() => {
    if (location.href === href) return
    href = location.href
    aiFindings = null
    later()
  }, 1000)
}

start()
