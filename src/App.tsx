import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import SplashScreen from './components/SplashScreen'
import AuthScreen from './components/AuthScreen'
import { clearSession, loadSession, type LoupeSession } from './lib/session'

export default function App() {
  const [splashOpen, setSplashOpen] = useState(true)
  const [session, setSession] = useState<LoupeSession | null | undefined>(undefined)
  const closeSplash = useCallback(() => setSplashOpen(false), [])

  useEffect(() => {
    loadSession().then(setSession)
  }, [])

  async function signOut() {
    await clearSession()
    setSession(null)
  }

  const ready = !splashOpen && session !== undefined

  return (
    <>
      <AnimatePresence>{splashOpen && <SplashScreen key="splash" onDone={closeSplash} />}</AnimatePresence>

      <AnimatePresence mode="wait">
        {ready && !session && <AuthScreen key="auth" onAuthenticated={setSession} />}
        {ready && session && <Home key="home" session={session} onSignOut={signOut} onReplaySplash={() => setSplashOpen(true)} />}
      </AnimatePresence>
    </>
  )
}

function Home({
  session,
  onSignOut,
  onReplaySplash,
}: {
  session: LoupeSession
  onSignOut: () => void
  onReplaySplash: () => void
}) {
  const firstName = session.user.name.split(' ')[0]

  return (
    <motion.main
      className="flex h-full flex-col"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <img src="./images/loupe-logo.png" alt="" className="h-8 w-8 rounded-[10px]" draggable={false} />
          <span className="font-dot text-[20px] leading-none tracking-[0.06em] text-ink">LOUPE</span>
        </div>
        <img src="./images/perpay-logo.svg" alt="Perpay" className="h-[13px] w-auto opacity-80" draggable={false} />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-5">
        <div className="glass-card w-full max-w-sm p-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Connected</p>
          <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">Hi {firstName}</h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            Spending limit{' '}
            <span className="font-semibold text-ink">${session.user.spendingLimit.toLocaleString()}</span>
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={onReplaySplash}
              className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_-6px_rgb(31_92_255/0.6)] transition hover:bg-brand-deep"
            >
              Replay splash
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-full border border-line bg-white px-5 py-2 text-sm font-semibold text-ink-soft transition hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </section>
    </motion.main>
  )
}
