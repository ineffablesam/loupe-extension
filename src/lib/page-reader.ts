export interface PageSnapshot {
  url: string
  host: string
  title: string
  image: string | null
  price: number | null
  /** A single product's page, as opposed to search results, categories or home pages. */
  isProduct: boolean
  isCheckout: boolean
  /** Lines of visible text that mention money, terms, or policies. */
  snippets: string[]
  /** Labels of checkboxes and radios that are already selected. */
  selected: string[]
  /** The order summary on cart and checkout pages. */
  order: OrderSummary | null
}

export interface OrderSummary {
  items: number | null
  shipping: number | null
  tax: number | null
  total: number
  /** Expected delivery day as YYYY-MM-DD, when the page says. */
  arrives: string | null
}

export interface ActiveTab {
  id: number
  url: string
  favIconUrl?: string
}

export async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return null
  return { id: tab.id, url: tab.url, favIconUrl: tab.favIconUrl }
}

export function isReadableUrl(url: string) {
  return /^https?:\/\//.test(url) && !/^https?:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/.test(url)
}

export async function readPage(tabId: number): Promise<PageSnapshot> {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: collectPage })
  if (!injection?.result) throw new Error('Could not read this page')
  return injection.result
}

/**
 * Runs inside the shopping tab, so it must stay self-contained:
 * no imports and no references to anything outside this function.
 */
export function collectPage(): PageSnapshot {
  const squash = (value: string) => value.replace(/\s+/g, ' ').trim()
  const toNumber = (value: unknown) => {
    const match = String(value ?? '').replace(/,/g, '').match(/\d+(\.\d{1,2})?/)
    return match ? Number(match[0]) : null
  }
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function jsonLdProduct(): { name?: string; brand?: string; image?: string; price?: number | null } | null {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const queue: unknown[] = [JSON.parse(script.textContent ?? '')]
        while (queue.length) {
          const node = queue.shift() as Record<string, unknown> | null
          if (!node || typeof node !== 'object') continue
          if (Array.isArray(node)) {
            queue.push(...node)
            continue
          }
          if (node['@graph']) queue.push(node['@graph'])
          const type = node['@type']
          if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
            const offers = (Array.isArray(node.offers) ? node.offers[0] : node.offers) as Record<string, unknown> | undefined
            const image = Array.isArray(node.image) ? node.image[0] : node.image
            return {
              name: typeof node.name === 'string' ? node.name : undefined,
              brand: typeof node.brand === 'string' ? node.brand : typeof (node.brand as { name?: unknown })?.name === 'string' ? (node.brand as { name: string }).name : undefined,
              image: typeof image === 'string' ? image : undefined,
              price: toNumber(offers?.price ?? offers?.lowPrice),
            }
          }
        }
      } catch {
        // Malformed JSON-LD is common; skip it.
      }
    }
    return null
  }

  function findPrice(): number | null {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[property="product:price:amount"], meta[property="og:price:amount"], meta[itemprop="price"]',
    )
    if (meta?.content) return toNumber(meta.content)
    const selectors = [
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '#apex_desktop .a-offscreen',
      '[itemprop="price"]',
      '[data-testid="customer-price"] span',
      '.priceView-customer-price span',
      '[data-seo-id="hero-price"]',
      '[data-testid*="price" i]',
      '[class*="price" i]',
    ]
    for (const selector of selectors) {
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        const text = el.getAttribute('content') ?? el.textContent ?? ''
        if (!/\$\s?\d/.test(text) && !el.getAttribute('content')) continue
        if (!el.classList.contains('a-offscreen') && !visible(el)) continue
        const value = toNumber(text)
        if (value && value > 0) return value
      }
    }
    return null
  }

  function labelFor(input: HTMLInputElement) {
    const label =
      (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) ||
      input.closest('label') ||
      input.parentElement
    return squash(label?.textContent ?? input.getAttribute('aria-label') ?? '')
  }

  const product = jsonLdProduct()
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content
  const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content
  // Amazon's shopping assistant puts its own <h1> ("Chat history") above the product's.
  const firstText = (selectors: string[]) =>
    selectors.map((selector) => document.querySelector(selector)?.textContent?.trim()).find(Boolean)
  const productTitle = firstText(['#productTitle', '[data-testid="product-title"]', 'h1#main-title', 'h1[itemprop="name"]', 'h1.sku-title'])
  const ogProduct = /product/i.test(document.querySelector<HTMLMetaElement>('meta[property="og:type"]')?.content ?? '')
  // A product page has one "Add to cart"; results pages have one per product.
  const addToCart = [...document.querySelectorAll<HTMLElement>('button, input[type="submit"], a[role="button"]')].filter(
    (el) => /^\s*add to (cart|bag|basket)\s*$/i.test(el.textContent || (el as HTMLInputElement).value || '') && visible(el),
  ).length
  const heading = firstText(['main h1', 'h1'])
  // Some stores print the brand as a separate link above the name ("Apple" / "AirPods Max 2 - Midnight").
  const brand = squash(product?.brand || firstText(['[data-seo-id="brand-name"]', 'a[link-identifier="brandName"]', '#bylineInfo', '[itemprop="brand"]']) || '')
    .replace(/^(visit the|brand:)\s*/i, '')
    .replace(/\s*store$/i, '')
  const withBrand = (title: string) => (brand && brand.length < 40 && !title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${title}` : title)

  const terms =
    /(\bapr\b|interest|financ|per month|\/mo\b|monthly|pay in \d|installment|affirm|klarna|afterpay|sezzle|late fee|restocking|return|refund|subscription|auto-?renew|renews|\btrial\b|membership|protection|warranty|applecare|insurance|shipping|delivery|handling|\bfees?\b|deposit|cancel anytime|non-?refundable|non-?returnable|final sale)/i
  // A term alone is usually navigation or marketing; keep lines that also carry a number.
  const specific = /\$\s?\d|\d\s?%|\d+[- ]day|non-?refundable|non-?returnable|final sale|no returns/i
  const seen = new Set<string>()
  const snippets: string[] = []
  for (const raw of document.body.innerText.split('\n')) {
    const line = squash(raw)
    if (line.length < 8 || line.length > 280 || seen.has(line) || !terms.test(line) || !specific.test(line)) continue
    seen.add(line)
    snippets.push(line)
    if (snippets.length >= 60) break
  }

  const selected: string[] = []
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked, input[type="radio"]:checked')) {
    const label = labelFor(input)
    if (label && label.length < 200 && /\$\s?\d|plan|protect|warrant|insur|membership|subscri|trial|tip|donat/i.test(label)) {
      selected.push(label)
    }
  }

  const path = location.pathname.toLowerCase()
  const bodyText = document.body.innerText.slice(0, 20000)

  // Summary rows read "Items: $429.00", sometimes with the amount on the next line.
  function readOrder() {
    const lines = document.body.innerText.split('\n').map(squash).filter(Boolean)
    const amountFor = (label: RegExp) => {
      for (let i = 0; i < lines.length; i++) {
        if (!label.test(lines[i])) continue
        const amount = lines[i].match(/\$\s?([\d,]+\.\d{2})/) ?? lines[i + 1]?.match(/^\$\s?([\d,]+\.\d{2})$/)
        if (amount) return Number(amount[1].replace(/,/g, ''))
      }
      return null
    }
    const total = amountFor(/^(order total|estimated total|total)\b:?/i)
    if (total == null) return null
    return {
      items: amountFor(/^(items?|subtotal|item\(s\) subtotal)\b/i),
      shipping: amountFor(/^(shipping( & handling)?|delivery)\b:?/i),
      tax: amountFor(/^(estimated )?(sales )?tax(es)?\b|^estimated tax to be collected/i),
      total,
      arrives: arrivalDate(lines),
    }
  }

  // "Arriving by Oct 17, 2026", "Arriving Oct 19", "Delivery: Thursday, Oct 15".
  function arrivalDate(lines: string[]) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    for (const line of lines) {
      const found = line.match(/\b(?:arriving|arrives|delivery|get it)\b\D{0,24}?\b([A-Z][a-z]{2})[a-z]*\.? (\d{1,2})(?:, (\d{4}))?/i)
      const month = found ? months.indexOf(found[1].toLowerCase()) : -1
      if (!found || month === -1) continue
      const now = new Date()
      let year = found[3] ? Number(found[3]) : now.getFullYear()
      if (!found[3] && new Date(year, month, Number(found[2])).getTime() < now.getTime() - 60 * 864e5) year++
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(found[2]).padStart(2, '0')}`
    }
    return null
  }
  const isCheckout = /cart|checkout|basket|bag/.test(path) || /order summary|place (your )?order/i.test(bodyText)
  const order = isCheckout ? readOrder() : null

  return {
    url: location.href,
    host: location.hostname.replace(/^www\./, ''),
    title: withBrand(squash(product?.name || productTitle || ogTitle || heading || document.title)).slice(0, 160),
    image: product?.image ?? ogImage ?? null,
    price: product?.price ?? (order ? (order.items ?? order.total) : findPrice()),
    isProduct: !order && !!(product?.name || productTitle || ogProduct || (heading && addToCart >= 1 && addToCart <= 3)),
    isCheckout,
    snippets,
    selected: [...new Set(selected)].slice(0, 12),
    order,
  }
}
