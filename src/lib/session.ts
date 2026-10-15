import type { Paycheck } from './paycheck'

/** Something the shopper is already paying off on Perpay. */
export interface ActivePlan {
  name: string
  perPay: number
  pays: number
  /** Payments already made. */
  paid: number
}

export interface LoupeSession {
  token: string
  user: {
    name: string
    email: string
    spendingLimit: number
    /** Missing on sessions paired before pay details were shared. */
    paycheck?: Paycheck
    plans?: ActivePlan[]
  }
  pairedAt: number
}

const KEY = 'loupe-session'
const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local

export async function loadSession(): Promise<LoupeSession | null> {
  if (hasChromeStorage) {
    const stored = await chrome.storage.local.get(KEY)
    return (stored[KEY] as LoupeSession | undefined) ?? null
  }
  const raw = localStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as LoupeSession) : null
}

export async function saveSession(session: LoupeSession) {
  if (hasChromeStorage) await chrome.storage.local.set({ [KEY]: session })
  else localStorage.setItem(KEY, JSON.stringify(session))
}

export async function clearSession() {
  if (hasChromeStorage) await chrome.storage.local.remove(KEY)
  else localStorage.removeItem(KEY)
}
