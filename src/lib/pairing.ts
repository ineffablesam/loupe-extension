import type { LoupeSession } from './session'

/** The pairing API runs inside the mobile app's dev server (see mobile/vite.config.ts). */
export const PAIRING_API = 'http://localhost:5175'

export type PairStatus = 'pending' | 'scanned' | 'approved' | 'declined' | 'expired'

export interface PairState {
  code: string
  status: PairStatus
  expiresAt: number
  user?: LoupeSession['user']
  token?: string
}

export interface NewPair extends PairState {
  qr: string
  appUrl: string
}

function describeBrowser() {
  const platform = /Mac/.test(navigator.userAgent) ? 'macOS' : /Win/.test(navigator.userAgent) ? 'Windows' : 'Desktop'
  return `Chrome on ${platform}`
}

export async function createPair(): Promise<NewPair> {
  const res = await fetch(`${PAIRING_API}/api/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: describeBrowser() }),
  })
  if (!res.ok) throw new Error(`Pairing server responded ${res.status}`)
  return res.json()
}

export function watchPair(code: string, onState: (state: PairState) => void) {
  const source = new EventSource(`${PAIRING_API}/api/pair/${code}/events`)
  source.onmessage = (event) => onState(JSON.parse(event.data))
  return () => source.close()
}
