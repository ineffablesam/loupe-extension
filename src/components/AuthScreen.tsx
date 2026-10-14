import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LoupeLoader from './LoupeLoader'
import LoupeQr from './LoupeQr'
import { createPair, watchPair, type NewPair, type PairState } from '../lib/pairing'
import { saveSession, type LoupeSession } from '../lib/session'

const EASE_OUT = [0.16, 1, 0.3, 1] as const
const QR_SIZE = 212
/** How long the success check shows before the loading overlay takes over. */
const SUCCESS_MARK_MS = 1100

type View =
  | { kind: 'connecting' }
  | { kind: 'offline' }
  | { kind: 'waiting'; pair: NewPair; status: PairState['status'] }
  | { kind: 'success'; pair: NewPair; session: LoupeSession }

interface AuthScreenProps {
  onAuthenticated: (session: LoupeSession) => void
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [view, setView] = useState<View>({ kind: 'connecting' })
  const [notice, setNotice] = useState<string | null>(null)
  const [skyline, setSkyline] = useState(false)
  const [loading, setLoading] = useState(false)
  const generation = useRef(0)

  const startPair = useCallback(async () => {
    const id = ++generation.current
    try {
      const pair = await createPair()
      if (id !== generation.current) return
      setView({ kind: 'waiting', pair, status: pair.status })
    } catch {
      if (id === generation.current) setView({ kind: 'offline' })
    }
  }, [])

  useEffect(() => {
    startPair()
  }, [startPair])

  const pair = view.kind === 'waiting' || view.kind === 'success' ? view.pair : null
  const waitingPair = view.kind === 'waiting' ? view.pair : null

  useEffect(() => {
    if (!waitingPair) return
    const pair = waitingPair
    return watchPair(pair.code, (state) => {
      if (state.status === 'approved' && state.token && state.user) {
        const session: LoupeSession = { token: state.token, user: state.user, pairedAt: Date.now() }
        saveSession(session)
        setView({ kind: 'success', pair, session })
        return
      }
      if (state.status === 'declined') {
        setNotice('Sign-in was declined on your phone')
        startPair()
        return
      }
      if (state.status === 'expired') {
        startPair()
        return
      }
      setView((v) => (v.kind === 'waiting' && v.pair.code === pair.code ? { ...v, status: state.status } : v))
    })
  }, [waitingPair, startPair])

  useEffect(() => {
    if (!waitingPair) return
    const t = window.setTimeout(startPair, Math.max(0, waitingPair.expiresAt - Date.now()))
    return () => window.clearTimeout(t)
  }, [waitingPair, startPair])

  useEffect(() => {
    if (view.kind !== 'success') return
    const t = window.setTimeout(() => setLoading(true), SUCCESS_MARK_MS)
    return () => window.clearTimeout(t)
  }, [view])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(t)
  }, [notice])

  const scanned = view.kind === 'waiting' && view.status === 'scanned'
  const success = view.kind === 'success'

  return (
    <motion.main
      className="relative flex h-full flex-col"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <header className="flex items-center gap-2.5 px-5 pt-5">
        <img src="./images/loupe-logo.png" alt="" className="h-8 w-8 rounded-[10px]" draggable={false} />
        <span className="font-dot text-[20px] leading-none tracking-[0.06em] text-ink">LOUPE</span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-5 pb-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={success ? 'success-copy' : scanned ? 'scanned-copy' : 'idle-copy'}
            className="text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">
              {success ? `Welcome, ${view.session.user.name.split(' ')[0]}` : scanned ? 'Check your phone' : 'Connect Perpay'}
            </h1>
            <p className="mx-auto mt-1.5 max-w-[270px] text-[14px] leading-snug text-ink-soft">
              {success
                ? 'Your Perpay account is linked to Loupe.'
                : scanned
                  ? 'Approve the sign-in in the Perpay app to finish.'
                  : 'Scan with the Perpay app to sign in. No password needed.'}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="relative mt-6">
          <motion.div
            className="relative flex items-center justify-center p-5"
            animate={success ? { scale: 0.92 } : { scale: 1 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            <motion.div
              aria-hidden
              className="glass-card absolute inset-0"
              initial={false}
              animate={{ opacity: skyline && pair ? 0 : 1 }}
              transition={{ duration: skyline ? 0.2 : 0.8, ease: 'easeOut' }}
            />
            {pair ? (
              <LoupeQr
                value={pair.qr}
                size={QR_SIZE}
                blurred={scanned}
                mode={success ? 'success' : 'live'}
                onSkyline={setSkyline}
              />
            ) : (
              <QrPlaceholder offline={view.kind === 'offline'} onRetry={startPair} />
            )}

            <AnimatePresence>{scanned && <ScannedBadge key="scanned" />}</AnimatePresence>
            <AnimatePresence>{success && <SuccessMark key="success" />}</AnimatePresence>
          </motion.div>
        </div>

        <motion.div className="mt-5 h-[22px]" animate={{ opacity: success ? 0 : 1 }}>
          {view.kind === 'waiting' && <Countdown key={view.pair.code} code={view.pair.code} expiresAt={view.pair.expiresAt} />}
        </motion.div>

        <motion.ol
          className="mt-4 w-full max-w-[300px] space-y-2.5"
          animate={{ opacity: success ? 0 : scanned ? 0.45 : 1, y: success ? 8 : 0 }}
          transition={{ duration: 0.4 }}
        >
          {['Open the Perpay app on your phone', 'Tap the scan icon in the top bar', 'Approve Loupe on your phone'].map((step, i) => (
            <li key={step} className="flex items-center gap-3 text-[13.5px] text-ink-soft">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-wash text-[12px] font-semibold text-brand">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </motion.ol>
      </section>

      <footer className="px-5 pb-5 text-center text-[11.5px] text-ink-faint">
        {pair ? (
          <>
            Phone app: <span className="font-medium text-ink-soft">{pair.appUrl.replace(/^https?:\/\//, '')}</span>
          </>
        ) : (
          'Demo pairing · a Perpay concept'
        )}
      </footer>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="absolute inset-x-5 top-16 rounded-full bg-ink px-4 py-2.5 text-center text-[13px] font-medium text-white shadow-lg"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loading && view.kind === 'success' && (
          <LoupeLoader
            key="loader"
            caption={`Setting up Loupe for ${view.session.user.name.split(' ')[0]}…`}
            onDone={() => onAuthenticated(view.session)}
          />
        )}
      </AnimatePresence>
    </motion.main>
  )
}

function QrPlaceholder({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ width: QR_SIZE, height: QR_SIZE }}>
      {offline ? (
        <>
          <p className="text-[14px] font-semibold text-ink">Pairing server is offline</p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">
            Run <code className="rounded bg-brand-wash px-1 py-0.5 text-[11.5px] text-brand-deep">./start.sh</code> and try again.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-full bg-brand px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-deep"
          >
            Retry
          </button>
        </>
      ) : (
        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" />
      )}
    </div>
  )
}

function ScannedBadge() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div className="relative flex h-16 w-16 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full bg-brand/20"
          animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
        />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white shadow-[0_8px_22px_-8px_rgb(31_92_255/0.8)]">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
            <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
            <path d="M11 18.5h2" />
          </svg>
        </span>
      </div>
      <p className="mt-3 text-[13px] font-semibold text-ink">Scanned</p>
    </motion.div>
  )
}

function SuccessMark() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute h-24 w-24 rounded-full border-2 border-brand/40"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 2.1], opacity: [0.8, 0] }}
          transition={{ duration: 1.1, delay: 0.55 + i * 0.25, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-brand-sky to-brand shadow-[0_14px_34px_-10px_rgb(31_92_255/0.75)]"
        initial={{ scale: 0, rotate: -40 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.45 }}
      >
        <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M5 12.5 10 17.5 19 7"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.75, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>
    </div>
  )
}

function Countdown({ code, expiresAt }: { code: string; expiresAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const secs = Math.max(0, Math.round((expiresAt - now) / 1000))
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
      <span className="font-dot rounded-md bg-brand-wash px-2 py-0.5 text-[13px] tracking-[0.12em] text-brand-deep">{code}</span>
      <span>Refreshes in {label}</span>
    </div>
  )
}
