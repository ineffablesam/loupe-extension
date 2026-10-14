/**
 * The Perpay Marketplace catalogue (every in-stock listing), bundled as
 * public/catalog.json and matched on-device. Refresh it with
 * scripts/scrape-marketplace.js and scripts/build-catalog.mjs.
 */
export interface MarketplaceItem {
  id: number
  brand: string
  name: string
  slug: string
  price: number
  shipping: number
  /** ProductSecure two-year protection, when offered. */
  protection: number | null
  image: string
  /** Sold with extras (games, vouchers, accessories), so prices aren't like for like. */
  bundle: boolean
}

export const MARKETPLACE_PAYS = 10
const IMAGE_BASE = 'https://dy9fjybvjj7s7.cloudfront.net/product_images'

export function marketplaceUrl(item: MarketplaceItem) {
  return `https://app.perpay.com/shop/product/${item.id}/${item.slug}`
}

export function marketplaceImage(item: MarketplaceItem) {
  return `${IMAGE_BASE}${item.image}?format=auto&width=200`
}

// ── Catalogue ────────────────────────────────────────────────────────────

type Row = [number, string, string, string, number, number, number, string, 0 | 1]

interface Entry {
  item: MarketplaceItem
  brand: string[]
  words: string[]
  models: string[]
}

interface Catalog {
  capturedOn: string
  entries: Entry[]
  byBrand: Map<string, Entry[]>
  /** Entries by their rarest word, for titles that leave out the brand. */
  byRarest: Map<string, Entry[]>
  weight: Map<string, number>
}

let catalog: Catalog | null = null
let loading: Promise<Catalog> | null = null

export const catalogSize = () => catalog?.entries.length ?? 0
export const capturedOn = () => catalog?.capturedOn ?? ''

export function loadCatalog(): Promise<Catalog> {
  loading ??= fetch(catalogUrl())
    .then((response) => response.json() as Promise<{ capturedOn: string; items: Row[] }>)
    .then(({ capturedOn, items }) => (catalog = indexCatalog(capturedOn, items)))
    .catch((error) => {
      loading = null
      throw error
    })
  return loading
}

function catalogUrl() {
  return typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('catalog.json') : '/catalog.json'
}

function indexCatalog(capturedOn: string, rows: Row[]): Catalog {
  const entries: Entry[] = []
  const byBrand = new Map<string, Entry[]>()
  const frequency = new Map<string, number>()
  for (const [id, brand, name, slug, price, shipping, protection, image, bundle] of rows) {
    const brandWords = tokenize(brand)
    const words = [...new Set(tokenize(name))].filter((word) => !brandWords.includes(word) && !FILLER.has(word) && !COLOURS.has(word))
    if (words.length === 0 || brandWords.length === 0) continue
    const entry: Entry = {
      item: { id, brand, name, slug, price, shipping, protection: protection || null, image, bundle: bundle === 1 },
      brand: brandWords,
      words,
      models: words.filter(isVersion),
    }
    entries.push(entry)
    const key = brandWords.join('')
    byBrand.set(key, [...(byBrand.get(key) ?? []), entry])
    for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1)
  }
  const byRarest = new Map<string, Entry[]>()
  for (const entry of entries) {
    const rarest = entry.words.reduce((a, b) => (frequency.get(b)! < frequency.get(a)! ? b : a))
    byRarest.set(rarest, [...(byRarest.get(rarest) ?? []), entry])
  }
  const weight = new Map<string, number>()
  for (const [word, count] of frequency) weight.set(word, Math.log(1 + entries.length / count))
  return { capturedOn, entries, byBrand, byRarest, weight }
}

// ── Matching ─────────────────────────────────────────────────────────────

const FILLER = new Set(['a', 'an', 'and', 'the', 'with', 'for', 'of', 'in', 'on', 'to', 'by', 'from', 'w', 'x', 'new', 'pack', 'set', 'edition', 'version'])
const COLOURS = new Set(['black', 'white', 'silver', 'gray', 'grey', 'blue', 'red', 'green', 'pink', 'purple', 'gold', 'rose', 'midnight', 'starlight', 'navy', 'beige', 'brown', 'orange', 'yellow', 'clear', 'graphite', 'space', 'titanium', 'natural', 'cream', 'ivory', 'tan', 'nickel', 'copper', 'stainless', 'steel', 'matte', 'charcoal', 'sage', 'teal', 'lavender', 'blush', 'champagne'])

/** What kind of thing it is: if the listing says "earbuds" or "case", the title has to as well. */
const KINDS = new Set(['earbud', 'headphone', 'headset', 'speaker', 'soundbar', 'case', 'cover', 'charger', 'cable', 'adapter', 'controller', 'band', 'strap', 'mount', 'protector', 'skin', 'replacement', 'filter', 'attachment', 'brush', 'kit', 'accessory', 'battery', 'remote', 'dock', 'keyboard', 'mouse', 'refill', 'bundle'])

/** How much of a listing's name must appear in the store's title to count as the same product. */
const MIN_COVERAGE = 0.7
/** Marketplace prices run above retail, but far outside this range it's a different product (or an accessory). */
const PRICE_RATIO = [0.6, 2.6] as const

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.replace(/cancell/, 'cancel').replace(/^([a-z]{3,}[^s])s$/, '$1'))
}

/** Generation and size numbers ("2", "M5", "S26", "46mm") must agree; long part codes ("S948U") are just strong hints. */
function isVersion(word: string) {
  return /\d/.test(word) && (/^\d+$/.test(word) || word.length <= 4)
}

function isPartCode(word: string) {
  return /\d/.test(word) && /[a-z]/.test(word) && word.length >= 5
}

/**
 * Finds the Marketplace listing for a store's product title, or null.
 * The brand must appear, every model number on the listing must appear
 * (so "AirPods Pro 2" never matches "AirPods Pro 3"), and most of the
 * listing's distinctive words must be there too.
 */
export function findOnMarketplace(title: string, pagePrice: number | null = null): MarketplaceItem | null {
  if (!catalog) return null
  const tokens = tokenize(title)
  // Joined neighbours let "WH-1000XM5" meet "WH1000XM5" and "512 GB" meet "512GB".
  const present = new Set(tokens)
  for (let i = 0; i < tokens.length; i++) {
    present.add(tokens[i] + (tokens[i + 1] ?? ''))
    present.add(tokens[i] + (tokens[i + 1] ?? '') + (tokens[i + 2] ?? ''))
  }

  const index = catalog
  let best: { entry: Entry; coverage: number; matched: number } | null = null
  const consider = (entry: Entry, minCoverage: number) => {
    if (!entry.models.every((model) => present.has(model))) return
    if (pagePrice && (entry.item.price < pagePrice * PRICE_RATIO[0] || entry.item.price > pagePrice * PRICE_RATIO[1])) return
    let total = 0
    let matched = 0
    let hits = 0
    let wrongKind = false
    for (const word of entry.words) {
      const weight = index.weight.get(word) ?? 1
      const found = present.has(word)
      if (KINDS.has(word) && !found) wrongKind = true
      // Stores rarely print part codes, so a missing one doesn't count against the listing.
      if (found || !isPartCode(word)) total += weight
      if (found) {
        matched += weight
        hits++
      }
    }
    if (wrongKind || total === 0) return
    const coverage = matched / total
    if (coverage < minCoverage || (hits < 2 && entry.models.length === 0)) return
    // Rank by how much of the title a listing explains, so "QuietComfort Ultra Headphones"
    // beats "QuietComfort Ultra Earbuds" on a headphones page.
    // A listing that also matches the title's generation ("Max 2") beats one that ignores it ("Max").
    const versions = entry.models.length
    const bestVersions = best?.entry.models.length ?? -1
    if (
      !best ||
      versions > bestVersions ||
      (versions === bestVersions && (matched > best.matched + 1e-6 || (Math.abs(matched - best.matched) <= 1e-6 && coverage > best.coverage)))
    ) {
      best = { entry, coverage, matched }
    }
  }

  for (const [brand, entries] of index.byBrand) {
    if (!present.has(brand) && !entries[0].brand.every((word) => present.has(word))) continue
    for (const entry of entries) consider(entry, MIN_COVERAGE)
  }

  // Some stores drop the brand on results ("AirPods Max 2 - Midnight"). Then every word of the
  // listing has to be there, and it has to carry a model number, so it can't be a near miss.
  if (!best) {
    for (const word of present) {
      for (const entry of index.byRarest.get(word) ?? []) {
        if (entry.models.length > 0 && entry.words.length >= 2) consider(entry, 1)
      }
    }
  }
  return (best as { entry: Entry } | null)?.entry.item ?? null
}
