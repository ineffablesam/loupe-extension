import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { updateBuildMeta } from './scripts/build-meta'

const root = import.meta.dirname
const outDir = join(root, 'dist', 'extension')
const isDev = process.env.LOUPE_DEV === '1'

/** Chrome only reloads content scripts with the extension, so a new hash triggers a full reload in dev. */
function stampContentHash(): Plugin {
  return {
    name: 'loupe-content-hash',
    apply: 'build',
    writeBundle() {
      const contents = readFileSync(join(outDir, 'content.js'))
      updateBuildMeta(outDir, { contentHash: createHash('sha1').update(contents).digest('hex').slice(0, 12) })
    },
  }
}

/** Content scripts can't be ES modules, so the in-page UI ships as one self-contained IIFE. */
export default defineConfig({
  define: {
    __LOUPE_DEV__: JSON.stringify(isDev),
  },
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    minify: !isDev,
    sourcemap: isDev ? 'inline' : false,
    lib: {
      entry: join(root, 'src', 'content', 'index.ts'),
      formats: ['iife'],
      name: 'LoupeContent',
      fileName: () => 'content.js',
    },
  },
  plugins: [stampContentHash()],
})
