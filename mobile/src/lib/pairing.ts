export type PairStatus = 'pending' | 'scanned' | 'approved' | 'declined' | 'expired'

export interface PairSession {
  code: string
  status: PairStatus
  expiresAt: number
  device: string
}

/** Accepts the full QR URL (…/pair/ABC123) or a bare code. */
export function extractPairCode(text: string): string | null {
  const fromUrl = text.match(/\/pair\/([A-Z0-9]{6})\b/i)
  if (fromUrl) return fromUrl[1].toUpperCase()
  const bare = text.trim().match(/^[A-Z0-9]{6}$/i)
  return bare ? bare[0].toUpperCase() : null
}

async function call(path: string, method: 'GET' | 'POST' = 'GET'): Promise<PairSession> {
  const res = await fetch(`/api/pair/${path}`, { method })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong')
  return body as PairSession
}

export const pairing = {
  get: (code: string) => call(code),
  scan: (code: string) => call(`${code}/scan`, 'POST'),
  approve: (code: string) => call(`${code}/approve`, 'POST'),
  decline: (code: string) => call(`${code}/decline`, 'POST'),
}
