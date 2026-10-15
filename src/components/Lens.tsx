import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { DEMO_PAGE } from '../data/demo-page'
import { findOnMarketplace, loadCatalog } from '../data/marketplace'
import { findWithRules, mergeFindings, type Finding } from '../lib/fine-print'
import { checkEngine, findWithAi, startEngine, type EngineState } from '../lib/on-device-ai'
import { getActiveTab, isReadableUrl, readPage, type PageSnapshot } from '../lib/page-reader'
import { perpayPlan, usd } from '../lib/perpay-plan'
import type { LoupeSession } from '../lib/session'
import { CreditBuilder, LimitPlanner, PaycheckRunway, PerpayStrip, PricePassport, owed, useRecent, type Viewed } from './Insights'

const inExtension = typeof chrome !== 'undefined' && !!chrome.tabs

type Scan =
  | { status: 'idle' }
  | { status: 'blocked'; url: string }
  | { status: 'reading' }
  | { status: 'done'; page: PageSnapshot; findings: Finding[]; ai: 'running' | 'done' | 'skipped' | 'failed' }
  | { status: 'error'; message: string }

type User = LoupeSession['user']

export default function Lens({ user }: { user: User }) {
  const [engine, setEngine] = useState<EngineState>({ status: 'checking' })
  const [scan, setScan] = useState<Scan>({ status: 'idle' })
  const recent = useRecent()
  const scanId = useRef(0)
  const engineRef = useRef(engine)
  engineRef.current = engine

  const run = useCallback(async () => {
    const id = ++scanId.current
    const stale = () => id !== scanId.current

    let page: PageSnapshot
    let tabId: number | null = null
    if (inExtension) {
      const tab = await getActiveTab()
      if (!tab) return setScan({ status: 'idle' })
      if (!isReadableUrl(tab.url)) return setScan({ status: 'blocked', url: tab.url })
      tabId = tab.id
      setScan({ status: 'reading' })
      try {
        page = await readPage(tab.id)
      } catch (error) {
        if (!stale()) setScan({ status: 'error', message: (error as Error).message })
        return
      }
    } else {
      setScan({ status: 'reading' })
      page = DEMO_PAGE
    }
    if (page.price) await loadCatalog().catch(() => {})
    if (stale()) return

    const rules = findWithRules(page)
    const useAi = engineRef.current.status === 'ready'
    setScan({ status: 'done', page, findings: rules, ai: useAi ? 'running' : 'skipped' })
    if (!useAi) return

    // The on-page card shows what the on-device model finds; the panel stays on the bigger picture.
    try {
      const ai = await findWithAi(page, () => {})
      if (stale()) return
      setScan({ status: 'done', page, findings: mergeFindings(rules, ai), ai: 'done' })
      if (tabId !== null) chrome.tabs.sendMessage(tabId, { type: 'LOUPE_FINDINGS', url: page.url, findings: ai }).catch(() => {})
    } catch {
      if (!stale()) setScan({ status: 'done', page, findings: rules, ai: 'failed' })
    }
  }, [])

  useEffect(() => {
    checkEngine().then(setEngine)
  }, [])

  const engineChecked = engine.status !== 'checking'
  const engineReady = engine.status === 'ready'

  useEffect(() => {
    if (!engineChecked) return
    run()
    if (!inExtension) return
    let timer: ReturnType<typeof setTimeout>
    const rescan = () => {
      clearTimeout(timer)
      timer = setTimeout(run, 700)
    }
    const onMessage = (message: { type?: string }) => {
      if (message?.type === 'TAB_URL_CHANGED') rescan()
    }
    chrome.runtime.onMessage.addListener(onMessage)
    chrome.tabs.onActivated.addListener(rescan)
    return () => {
      clearTimeout(timer)
      chrome.runtime.onMessage.removeListener(onMessage)
      chrome.tabs.onActivated.removeListener(rescan)
    }
  }, [engineChecked, engineReady, run])

  async function enableAi() {
    setEngine({ status: 'downloading', model: 'Gemini Nano', progress: 0 })
    try {
      await startEngine((progress) => setEngine({ status: 'downloading', model: 'Gemini Nano', progress }))
      setEngine({ status: 'ready', model: 'Gemini Nano' })
    } catch {
      setEngine({ status: 'unavailable' })
    }
  }

  const reading = scan.status === 'reading' || scan.status === 'idle' || !engineChecked

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait">
          {reading ? (
            <DotLoader key="reading" />
          ) : scan.status === 'done' ? (
            <Report key={scan.page.url} page={scan.page} user={user} recent={recent} />
          ) : (
            <motion.div key={scan.status} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EmptyState scan={scan} onRetry={run} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <EngineBar engine={engine} scan={scan} onEnable={enableAi} />
    </div>
  )
}

// ── Loading: the dot wordmark breathes while blurred, then sharpens and dissolves into the report ──

const loaderVariants: Variants = {
  enter: { opacity: 1 },
  exit: { opacity: 0, scale: 1.04, filter: 'blur(4px)', transition: { delay: 0.4, duration: 0.35, ease: 'easeIn' } },
}

const dotVariants: Variants = {
  enter: (i: number) => ({
    filter: ['blur(7px)', 'blur(2.5px)', 'blur(7px)'],
    opacity: [0.3, 0.85, 0.3],
    transition: { duration: 1.5, delay: i * 0.12, repeat: Infinity, ease: 'easeInOut' },
  }),
  exit: { filter: 'blur(0px)', opacity: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

function DotLoader() {
  return (
    <motion.div
      className="flex h-[70vh] flex-col items-center justify-center"
      variants={loaderVariants}
      initial={{ opacity: 0 }}
      animate="enter"
      exit="exit"
    >
      <h2 aria-label="Reading this page" className="flex font-dot text-[46px] leading-none tracking-[0.08em] text-brand">
        {'LOUPE'.split('').map((letter, i) => (
          <motion.span key={i} aria-hidden custom={i} variants={dotVariants} style={{ display: 'inline-block' }}>
            {letter}
          </motion.span>
        ))}
      </h2>
    </motion.div>
  )
}

// ── Report ───────────────────────────────────────────────────────────────

function Report({ page, user, recent }: { page: PageSnapshot; user: User; recent: Viewed[] }) {
  const plans = user.plans ?? []
  const match = page.price ? findOnMarketplace(page.title, page.price) : null
  const plan = match ? perpayPlan(match, user.spendingLimit - owed(plans)) : null
  const open = (url: string) => (inExtension ? chrome.tabs.create({ url }) : window.open(url))

  if (!page.price) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <PageHeader page={page} />
        <EmptyCard title="Nothing to check here" body="Open a product page on any store, and Loupe will line it up against your paycheck." />
      </motion.div>
    )
  }

  return (
    <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
      <PageHeader page={page} />
      <PricePassport page={page} match={match} plan={plan} recent={recent} delay={0} />
      {user.paycheck && <PaycheckRunway paycheck={user.paycheck} plans={plans} plan={plan} delay={0.08} />}
      {plan && <LimitPlanner limit={user.spendingLimit} plans={plans} plan={plan} paycheck={user.paycheck} delay={0.16} />}
      {(plan || plans.length > 0) && <CreditBuilder plans={plans} plan={plan} paycheck={user.paycheck} delay={0.24} />}
      {plan ? (
        <PerpayStrip plan={plan} onOpen={open} delay={0.32} />
      ) : (
        <p className="rounded-[20px] border border-dashed border-line px-4 py-3 text-[12.5px] leading-relaxed text-ink-soft">This item isn’t on the Perpay Marketplace yet.</p>
      )}
      {!user.paycheck && (
        <p className="px-1 text-center text-[11.5px] text-ink-faint">Pair your phone again to see your paycheck runway.</p>
      )}
    </motion.div>
  )
}

// ── Chrome ───────────────────────────────────────────────────────────────

function PageHeader({ page }: { page: PageSnapshot }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <img
        src={`https://www.google.com/s2/favicons?domain=${page.host}&sz=64`}
        alt=""
        className="h-8 w-8 shrink-0 rounded-lg border border-line bg-white p-1"
        draggable={false}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-medium text-ink-faint">{page.host}</p>
        <p className="truncate text-[13.5px] font-semibold text-ink">{page.title}</p>
      </div>
      {page.price && <p className="shrink-0 text-[15px] font-semibold text-ink">{usd(page.price)}</p>}
    </div>
  )
}

function EmptyState({ scan, onRetry }: { scan: Extract<Scan, { status: 'blocked' | 'error' }>; onRetry: () => void }) {
  if (scan.status === 'blocked') {
    return <EmptyCard title="Open a store to start" body="Loupe reads product pages and carts on any shopping site. Chrome pages can’t be read." />
  }
  return (
    <EmptyCard title="Couldn’t read this page" body={scan.message}>
      <button type="button" onClick={onRetry} className="mt-3 rounded-full bg-brand px-4 py-1.5 text-[12.5px] font-semibold text-white">
        Try again
      </button>
    </EmptyCard>
  )
}

function EmptyCard({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="glass-card mt-6 p-5 text-center">
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{body}</p>
      {children}
    </div>
  )
}

function EngineBar({ engine, scan, onEnable }: { engine: EngineState; scan: Scan; onEnable: () => void }) {
  const busy = scan.status === 'done' && scan.ai === 'running'
  if (engine.status === 'ready') return null
  return (
    <footer className="flex items-center gap-2 border-t border-line bg-white/70 px-4 py-2.5 text-[11.5px] text-ink-soft backdrop-blur">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      {engine.status === 'downloadable' && (
        <>
          <span className="flex-1">Private on-device AI is off</span>
          <button type="button" onClick={onEnable} className="rounded-full bg-brand px-3 py-1 font-semibold text-white">
            Turn on
          </button>
        </>
      )}
      {engine.status === 'downloading' && (
        <span className="flex-1">Downloading {engine.model} · {Math.round(engine.progress * 100)}% · one time only</span>
      )}
      {(engine.status === 'unavailable' || engine.status === 'checking') && (
        <span className="flex-1">
          <span className="font-semibold text-ink">On-device</span> · nothing leaves your computer
        </span>
      )}
      {busy && <Spinner />}
    </footer>
  )
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
}
