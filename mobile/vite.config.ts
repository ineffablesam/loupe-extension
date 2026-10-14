import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { pairingMiddleware } from '../server/pairing'

const projectRoot = join(import.meta.dirname, '..')

function pairingApi(): Plugin {
  return {
    name: 'loupe-pairing-api',
    configureServer(server) {
      server.middlewares.use(pairingMiddleware(projectRoot))
    },
    configurePreviewServer(server) {
      server.middlewares.use(pairingMiddleware(projectRoot))
    },
  }
}

export default defineConfig({
  root: import.meta.dirname,
  // Separate from the extension's dev server so one re-optimizing deps can't invalidate the other.
  cacheDir: join(import.meta.dirname, '../node_modules/.vite-mobile'),
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    // Requests arrive via the Wi-Fi HTTPS proxy or a random *.trycloudflare.com tunnel host.
    allowedHosts: true,
  },
  build: {
    outDir: join(projectRoot, 'dist', 'mobile'),
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss(), pairingApi()],
})
