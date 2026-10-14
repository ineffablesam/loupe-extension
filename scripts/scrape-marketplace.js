// Paste into the DevTools console on app.perpay.com/shop (signed in). It reads the
// public Marketplace search index the shop already uses and downloads the raw rows
// that scripts/build-catalog.mjs turns into public/catalog.json.
;(async () => {
  const endpoint = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('algolia'))
  if (!endpoint) throw new Error('Search the shop once so the Marketplace index loads, then run this again.')
  const filters = 'in_stock:true AND published:true'
  const attributesToRetrieve = ['name', 'brand', 'slug', 'price', 'ship_price', 'product_secure_amount', 'images', 'is_bundle', 'category', 'parent_sku', 'deduplication_sku', 'quantity_ordered']
  const search = async (params) => {
    const body = JSON.stringify({ requests: [{ indexName: 'production_products', query: '', filters, ...params }] })
    return (await (await fetch(endpoint, { method: 'POST', body })).json()).results[0]
  }
  const rows = new Map()
  // The index returns at most 1,000 hits per query, so split by price until each slice fits.
  const slice = async (lo, hi) => {
    const numericFilters = [`price>=${lo}`, `price<${hi}`]
    const { nbHits } = await search({ hitsPerPage: 0, numericFilters })
    if (nbHits === 0) return
    if (nbHits > 1000 && hi - lo > 0.02) {
      const mid = Math.round(((lo + hi) / 2) * 100) / 100
      await slice(lo, mid)
      await slice(mid, hi)
      return
    }
    const { hits } = await search({ hitsPerPage: 1000, numericFilters, attributesToRetrieve })
    for (const h of hits) {
      rows.set(h.objectID, [Number(h.objectID), h.brand ?? '', h.name, h.slug, h.price, h.ship_price ?? 0, h.product_secure_amount ?? 0, h.images?.[0] ?? '', h.is_bundle ? 1 : 0, h.category ?? '', h.parent_sku ?? h.deduplication_sku ?? '', h.quantity_ordered ?? 0])
    }
  }
  await slice(0, 100000)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify([...rows.values()])], { type: 'application/json' }))
  link.download = 'perpay-marketplace-raw.json'
  link.click()
  console.log(`Saved ${rows.size} rows`)
})()
