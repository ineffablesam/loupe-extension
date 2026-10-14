declare const __LOUPE_DEV__: boolean

type BuildMeta = { buildId: number; shellHash: string }

const POLL_MS = 800

/**
 * Dev-only auto refresh. Unpacked extensions serve files straight from disk,
 * so polling our own build-meta.json sees every rebuild from `npm run dev`.
 */
export function startDevReload() {
  if (!__LOUPE_DEV__ || typeof chrome === 'undefined' || !chrome.runtime?.id) return

  let current: BuildMeta | null = null

  const check = async () => {
    try {
      const res = await fetch(chrome.runtime.getURL('build-meta.json'), { cache: 'no-store' })
      if (!res.ok) return
      const next: BuildMeta = await res.json()
      if (!current) {
        current = next
        return
      }
      if (next.shellHash !== current.shellHash) {
        chrome.runtime.reload()
      } else if (next.buildId !== current.buildId) {
        window.location.reload()
      }
    } catch {
      // Mid-rebuild the file can be briefly missing or partial — try again next tick.
    }
  }

  check()
  window.setInterval(check, POLL_MS)
  console.info('[loupe] dev auto-reload active')
}
