import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { pairing, type PairSession } from '../lib/pairing'
import { LaptopIcon } from './icons'

type SheetState =
  | { kind: 'loading' }
  | { kind: 'confirm'; session: PairSession }
  | { kind: 'approving'; session: PairSession }
  | { kind: 'approved' }
  | { kind: 'error'; message: string }

interface ApproveSheetProps {
  code: string
  onClose: () => void
}

const SHEET_SPRING = { type: 'spring', stiffness: 380, damping: 38 } as const

export default function ApproveSheet({ code, onClose }: ApproveSheetProps) {
  const [state, setState] = useState<SheetState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    pairing
      .scan(code)
      .then((session) => !cancelled && setState({ kind: 'confirm', session }))
      .catch((e: Error) => !cancelled && setState({ kind: 'error', message: e.message }))
    return () => {
      cancelled = true
    }
  }, [code])

  useEffect(() => {
    if (state.kind !== 'approved') return
    const t = window.setTimeout(onClose, 1800)
    return () => window.clearTimeout(t)
  }, [state.kind, onClose])

  async function approve(session: PairSession) {
    setState({ kind: 'approving', session })
    try {
      await pairing.approve(code)
      navigator.vibrate?.([20, 40, 20])
      setState({ kind: 'approved' })
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message })
    }
  }

  async function decline() {
    await pairing.decline(code).catch(() => {})
    onClose()
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-[#0b1a2b]/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={state.kind === 'confirm' ? decline : undefined}
      />
      <motion.div
        className="pb-safe fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-white"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={SHEET_SPRING}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#d5dce3]" />
        <div className="px-6 pb-8 pt-6">
          {state.kind === 'loading' && <Loading />}
          {(state.kind === 'confirm' || state.kind === 'approving') && (
            <Confirm
              session={state.session}
              busy={state.kind === 'approving'}
              onApprove={() => approve(state.session)}
              onDecline={decline}
            />
          )}
          {state.kind === 'approved' && <Approved />}
          {state.kind === 'error' && <ErrorView message={state.message} onClose={onClose} />}
        </div>
      </motion.div>
    </>
  )
}

function Loading() {
  return (
    <div className="flex h-[260px] items-center justify-center">
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
    </div>
  )
}

function Confirm({
  session,
  busy,
  onApprove,
  onDecline,
}: {
  session: PairSession
  busy: boolean
  onApprove: () => void
  onDecline: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-3">
        <img src="/images/loupe-logo.png" alt="" className="h-14 w-14 rounded-[15px] shadow-[0_8px_20px_-8px_rgb(31_92_255/0.6)]" />
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary"
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
        <span className="flex h-14 w-14 items-center justify-center rounded-[15px] border border-[#e3e9ef] bg-white">
          <img src="/images/perpay-logo.svg" alt="" className="h-[13px] w-auto" />
        </span>
      </div>

      <h2 className="mt-5 text-[21px] font-semibold tracking-[-0.01em] text-navy">Sign in to Loupe?</h2>
      <p className="mt-1.5 max-w-[280px] text-[14.5px] leading-snug text-navy-soft">
        Loupe will see your spending limit and purchases to help you shop smarter.
      </p>

      <div className="mt-5 flex w-full items-center gap-3 rounded-[14px] bg-page px-4 py-3 text-left">
        <LaptopIcon className="h-6 w-6 shrink-0 text-navy" />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-medium text-navy">Loupe for Chrome</p>
          <p className="truncate text-[12.5px] text-mute">{session.device} · Code {session.code}</p>
        </div>
        <span className="rounded-full bg-mint px-2 py-0.5 text-[11.5px] font-medium text-mint-ink">Nearby</span>
      </div>

      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        className="mt-6 flex h-[50px] w-full items-center justify-center rounded-[10px] bg-primary text-[16px] font-semibold text-white active:bg-primary-deep disabled:opacity-80"
      >
        {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : 'Approve'}
      </button>
      <button type="button" onClick={onDecline} disabled={busy} className="mt-2 h-11 w-full text-[15px] font-medium text-navy-soft">
        Not now
      </button>
    </div>
  )
}

function Approved() {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center text-center">
      <motion.div
        className="flex h-20 w-20 items-center justify-center rounded-full bg-primary"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      >
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="white" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M5 12.5 10 17.5 19 7"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.2, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>
      <h2 className="mt-5 text-[21px] font-semibold text-navy">You’re connected</h2>
      <p className="mt-1.5 text-[14.5px] text-navy-soft">Head back to Chrome — Loupe is ready.</p>
    </div>
  )
}

function ErrorView({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <h2 className="text-[19px] font-semibold text-navy">Couldn’t connect</h2>
      <p className="mt-1.5 text-[14.5px] text-navy-soft">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 h-[48px] w-full rounded-[10px] bg-primary text-[16px] font-semibold text-white"
      >
        OK
      </button>
    </div>
  )
}
