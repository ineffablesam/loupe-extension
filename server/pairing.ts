import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'

export type PairStatus = 'pending' | 'scanned' | 'approved' | 'declined' | 'expired'

export interface PairedUser {
  name: string
  email: string
  spendingLimit: number
  paycheck: { net: number; hours: number; everyDays: number; anchor: string }
  plans: { name: string; perPay: number; pays: number; paid: number }[]
}

interface PairSession {
  code: string
  status: PairStatus
  expiresAt: number
  device: string
  user?: PairedUser
  token?: string
  listeners: Set<ServerResponse>
}

const SESSION_TTL_MS = 2 * 60 * 1000
// No 0/O/1/I so the code is readable if typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const sessions = new Map<string, PairSession>()

const DEMO_USER: PairedUser = {
  name: 'Samuel Philip',
  email: 'sam@perpay.demo',
  spendingLimit: 1000,
  // Paid every other Friday.
  paycheck: { net: 1240, hours: 80, everyDays: 14, anchor: '2026-10-16' },
  plans: [{ name: 'Dyson V8 Cordless Vacuum', perPay: 31.5, pays: 10, paid: 6 }],
}

function newCode() {
  const bytes = randomBytes(6)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/** The phone-facing URL (Wi-Fi HTTPS or tunnel) is written by start.sh. */
function publicUrl(root: string, req: IncomingMessage) {
  const file = join(root, '.tunnel-url')
  if (existsSync(file)) {
    const url = readFileSync(file, 'utf8').trim()
    if (url) return url
  }
  return `http://${req.headers.host ?? 'localhost'}`
}

function snapshot(s: PairSession) {
  return {
    code: s.code,
    status: s.status,
    expiresAt: s.expiresAt,
    device: s.device,
    user: s.status === 'approved' ? s.user : undefined,
    token: s.status === 'approved' ? s.token : undefined,
  }
}

function broadcast(s: PairSession) {
  const data = `data: ${JSON.stringify(snapshot(s))}\n\n`
  for (const res of s.listeners) res.write(data)
}

function setStatus(s: PairSession, status: PairStatus) {
  s.status = status
  broadcast(s)
}

function getLive(code: string) {
  const s = sessions.get(code.toUpperCase())
  if (!s) return null
  if (s.status !== 'approved' && Date.now() > s.expiresAt && s.status !== 'expired') setStatus(s, 'expired')
  return s
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Connect-style middleware for the pairing handshake:
 *   extension  POST /api/pair                 → new code + QR payload
 *   extension  GET  /api/pair/:code/events    → SSE status stream
 *   phone      GET  /api/pair/:code           → session details
 *   phone      POST /api/pair/:code/scan      → "scanned, waiting for approval"
 *   phone      POST /api/pair/:code/approve   → approved with the demo user
 *   phone      POST /api/pair/:code/decline
 */
export function pairingMiddleware(root: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://local')
    if (!url.pathname.startsWith('/api/')) return next()

    // The extension calls from a chrome-extension:// origin.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') return send(res, 204, null)

    if (url.pathname === '/api/health') return send(res, 200, { ok: true })

    if (url.pathname === '/api/pair' && req.method === 'POST') {
      const body = await readJson(req)
      const code = newCode()
      const session: PairSession = {
        code,
        status: 'pending',
        expiresAt: Date.now() + SESSION_TTL_MS,
        device: typeof body.device === 'string' ? body.device : 'Chrome',
        listeners: new Set(),
      }
      sessions.set(code, session)
      const appUrl = publicUrl(root, req)
      return send(res, 200, { ...snapshot(session), appUrl, qr: `${appUrl}/pair/${code}` })
    }

    const match = url.pathname.match(/^\/api\/pair\/([A-Za-z0-9]+)(?:\/(events|scan|approve|decline))?$/)
    if (!match) return send(res, 404, { error: 'Not found' })

    const session = getLive(match[1])
    if (!session) return send(res, 404, { error: 'This code is no longer valid' })
    const action = match[2]

    if (!action && req.method === 'GET') return send(res, 200, snapshot(session))

    if (action === 'events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write(`data: ${JSON.stringify(snapshot(session))}\n\n`)
      session.listeners.add(res)
      const ping = setInterval(() => res.write(': ping\n\n'), 15000)
      req.on('close', () => {
        clearInterval(ping)
        session.listeners.delete(res)
      })
      return
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })

    if (session.status === 'expired') return send(res, 410, { error: 'This code expired — refresh it in Loupe' })
    if (session.status === 'approved') return send(res, 409, { error: 'Already approved' })

    if (action === 'scan') setStatus(session, 'scanned')
    if (action === 'decline') setStatus(session, 'declined')
    if (action === 'approve') {
      session.user = DEMO_USER
      session.token = randomUUID()
      setStatus(session, 'approved')
    }
    return send(res, 200, snapshot(session))
  }
}
