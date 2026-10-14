import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = import.meta.dirname
const outDir = join(root, 'dist', 'extension')
const isDev = process.env.LOUPE_DEV === '1'

const SHELL_FILES = ['manifest.json', 'background.js']

/**
 * Packages the MV3 shell (manifest + service worker) next to the Vite output
 * and stamps build-meta.json. In dev, the side panel polls build-meta.json:
 * a new buildId reloads the panel, a new shellHash (manifest, worker, icons)
 * reloads the whole extension.
 */
function chromeExtension(): Plugin {
  return {
    name: 'loupe-chrome-extension',
    apply: 'build',
    buildStart() {
      for (const file of SHELL_FILES) this.addWatchFile(join(root, 'extension', file))
    },
    writeBundle() {
      const hash = createHash('sha1')
      for (const file of SHELL_FILES) {
        const contents = readFileSync(join(root, 'extension', file))
        hash.update(contents)
        writeFileSync(join(outDir, file), contents)
      }
      // Chrome caches toolbar icons until the extension itself reloads.
      const iconsDir = join(root, 'public', 'icons')
      for (const icon of readdirSync(iconsDir).sort()) hash.update(readFileSync(join(iconsDir, icon)))
      const meta = { buildId: Date.now(), shellHash: hash.digest('hex').slice(0, 12) }
      writeFileSync(join(outDir, 'build-meta.json'), JSON.stringify(meta))
      if (isDev) {
        const time = new Date().toLocaleTimeString()
        console.log(`\n\x1b[32m✓\x1b[0m Loupe rebuilt at ${time} — side panel reloads automatically\n`)
      }
    },
  }
}

export default defineConfig({
  base: './',
  define: {
    __LOUPE_DEV__: JSON.stringify(isDev),
  },
  build: {
    outDir,
    // Dev keeps stable filenames and never wipes the folder, so Chrome never
    // sees a missing manifest mid-rebuild.
    emptyOutDir: !isDev,
    assetsInlineLimit: 0,
    sourcemap: isDev ? 'inline' : false,
    minify: !isDev,
    rollupOptions: {
      output: isDev
        ? {
            entryFileNames: 'assets/[name].js',
            chunkFileNames: 'assets/[name].js',
            assetFileNames: 'assets/[name][extname]',
          }
        : {},
    },
  },
  plugins: [react(), tailwindcss(), chromeExtension()],
})
