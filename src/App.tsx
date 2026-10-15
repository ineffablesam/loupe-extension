import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import SplashScreen from './components/SplashScreen'
import AuthScreen from './components/AuthScreen'
import Lens from './components/Lens'
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

  // Signed-in shoppers go straight to the page; the splash is only for first launch and sign-in.
  const showSplash = splashOpen && session === null
  const ready = session !== undefined && !showSplash

  return (
    <>
      <AnimatePresence>{showSplash && <SplashScreen key="splash" onDone={closeSplash} />}</AnimatePresence>

      <AnimatePresence mode="wait">
        {ready && !session && <AuthScreen key="auth" onAuthenticated={setSession} />}
        {ready && session && <Home key="home" session={session} onSignOut={signOut} />}
      </AnimatePresence>
    </>
  )
}

function Home({ session, onSignOut }: { session: LoupeSession; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = session.user.name.charAt(0).toUpperCase()

  return (
    <motion.main
      className="flex h-full flex-col"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="relative flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-dot text-[19px] leading-none tracking-[0.06em] text-ink">LOUPE</span>
          <span className="text-[11px] text-ink-faint">by</span>
          <img src="./images/perpay-logo.svg" alt="Perpay" className="h-[12px] w-auto" draggable={false} />
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-wash px-2.5 py-1 text-[11.5px] font-semibold text-brand">
            ${session.user.spendingLimit.toLocaleString()} limit
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Account"
            className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white"
          >
            {initial}
          </button>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="glass-card absolute right-4 top-12 z-20 w-48 p-1.5"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              <p className="truncate px-2.5 pb-1.5 pt-1 text-[12px] text-ink-soft">{session.user.email}</p>
              <button
                type="button"
                onClick={onSignOut}
                className="w-full rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold text-ink transition hover:bg-canvas"
              >
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <Lens user={session.user} />
    </motion.main>
  )
}
