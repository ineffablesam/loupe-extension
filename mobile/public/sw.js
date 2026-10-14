// Network-first service worker: makes the app installable without ever serving
// stale code during development.
const CACHE = 'perpay-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (request.mode === 'navigate') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/', copy))
        }
        return response
      })
      .catch(() => caches.match(request.mode === 'navigate' ? '/' : request)),
  )
})
