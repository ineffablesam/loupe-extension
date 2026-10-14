// node scripts/build-catalog.mjs <perpay-marketplace-raw.json> [captured-on]
// Folds colour/size variants into one listing (the most ordered one) and writes
// the compact catalogue the extension matches against, entirely on-device.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [input, capturedOn = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })] = process.argv.slice(2)
if (!input) throw new Error('Usage: node scripts/build-catalog.mjs <raw.json> [captured-on]')

const raw = JSON.parse(readFileSync(input, 'utf8'))
const groups = new Map()
for (const row of raw) {
  const [id, , , , price, , , , , , group, ordered] = row
  const key = group || id
  const best = groups.get(key)
  if (!best || ordered > best[11] || (ordered === best[11] && price < best[4])) groups.set(key, row)
}

const round = (value) => Math.round(value * 100) / 100
const items = [...groups.values()]
  .filter(([, , name, slug, price]) => name && slug && price > 0)
  .sort((a, b) => b[11] - a[11])
  .map(([id, brand, name, slug, price, shipping, protection, image, bundle]) => [id, brand.trim(), name.trim(), slug, round(price), round(shipping), round(protection), image, bundle])

const out = join(import.meta.dirname, '..', 'public', 'catalog.json')
writeFileSync(out, JSON.stringify({ capturedOn, fields: ['id', 'brand', 'name', 'slug', 'price', 'shipping', 'protection', 'image', 'bundle'], items }))
console.log(`${items.length} listings → ${out}`)
