import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import QrScanner from 'qr-scanner'
import { extractPairCode } from '../lib/pairing'
import { CloseIcon, LaptopIcon } from './icons'

interface ScannerProps {
  onCode: (code: string) => void
  onClose: () => void
}

interface Box {
  x: number
  y: number
  size: number
}

const LOCK_HOLD_MS = 650
const CODE_LENGTH = 6
const CODE_ALPHABET = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g

function restingBox(): Box {
  const w = window.innerWidth
  const h = window.innerHeight
  const size = Math.min(w * 0.7, 290)
  return { x: (w - size) / 2, y: h * 0.45 - size / 2, size }
}

/** Maps QR corner points from video pixels to screen pixels (video is object-cover). */
function lockBox(video: HTMLVideoElement, points: { x: number; y: number }[]): Box | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || points.length < 4) return null
  const rect = video.getBoundingClientRect()
  const scale = Math.max(rect.width / vw, rect.height / vh)
  const ox = rect.left + (rect.width - vw * scale) / 2
  const oy = rect.top + (rect.height - vh * scale) / 2
  const xs = points.map((p) => ox + p.x * scale)
  const ys = points.map((p) => oy + p.y * scale)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) * 1.18
  const cx = (minX + Math.max(...xs)) / 2
  const cy = (minY + Math.max(...ys)) / 2
  return { x: cx - size / 2, y: cy - size / 2, size }
}

export default function Scanner({ onCode, onClose }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [box, setBox] = useState<Box>(restingBox)
  const [locked, setLocked] = useState(false)
  const [entering, setEntering] = useState(false)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    const onResize = () => setBox((b) => (locked ? b : restingBox()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [locked])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2400)
    return () => clearTimeout(t)
  }, [hint])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!window.isSecureContext) {
      setError('The camera needs HTTPS. Open the tunnel URL printed by start.sh.')
      return
    }

    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const scanner = new QrScanner(
      video,
      (result) => {
        if (done) return
        const code = extractPairCode(result.data)
        if (!code) {
          setHint('That QR code isn’t from Loupe')
          return
        }
        done = true
        navigator.vibrate?.([18, 40, 26])
        const target = lockBox(video, result.cornerPoints)
        if (target) setBox(target)
        setLocked(true)
        scanner.stop()
        timer = setTimeout(() => onCodeRef.current(code), LOCK_HOLD_MS)
      },
      { preferredCamera: 'environment', maxScansPerSecond: 12, returnDetailedScanResult: true },
    )

    scanner.start().catch(() => setError('Camera access was blocked. Allow it in Settings → Safari → Camera.'))
    return () => {
      clearTimeout(timer)
      scanner.destroy()
    }
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-[#050c22] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />

      <motion.div
        className="scan-frame absolute"
        initial={{ left: box.x, top: box.y, width: box.size, height: box.size, scale: 1.25, opacity: 0 }}
        animate={{ left: box.x, top: box.y, width: box.size, height: box.size, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      >
        {!error && !locked && (
          <>
            <div className="scan-dots" />
            <div className="scan-beam" />
          </>
        )}
        <Brackets locked={locked} />
        <AnimatePresence>{locked && <LockMark />}</AnimatePresence>
      </motion.div>

      <div className="scan-glow pointer-events-none absolute inset-0" />

      <header className="pt-safe absolute inset-x-0 top-0">
        <div className="relative flex h-[64px] items-center justify-center px-4">
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <img src="/images/perpay-logo.svg" alt="perpay" className="h-[19px] brightness-0 invert" />
            <span className="font-dot mt-1.5 text-[10px] tracking-[0.34em] text-[#9fc0ff]">LOUPE</span>
          </motion.div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="glass-dark absolute right-4 flex h-10 w-10 items-center justify-center rounded-full"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <motion.div
        className="pointer-events-none absolute inset-x-0 text-center"
        style={{ top: box.y - 64 }}
        animate={{ opacity: locked ? 0 : 1 }}
      >
        <p className="font-dot text-[12px] tracking-[0.28em] text-[#9fc0ff]">
          {error ? 'CAMERA OFF' : 'SCAN TO CONNECT'}
        </p>
      </motion.div>

      <footer className="pb-safe absolute inset-x-0 bottom-0 px-6 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={locked ? 'locked' : error ?? hint ?? 'idle'}
            className="glass-dark mx-auto flex max-w-[340px] items-center gap-3 rounded-[20px] px-4 py-3.5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#1f5cff]/30 text-[#bcd3ff]">
              <LaptopIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-[14.5px] font-semibold leading-snug">
                {locked ? 'Loupe found' : error ? 'Can’t use the camera' : hint ?? 'Point at the code in Loupe'}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-white/60">
                {locked
                  ? 'Connecting to your browser…'
                  : error ?? 'Open the Loupe extension in Chrome on your computer.'}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {!locked && (
          <button
            type="button"
            onClick={() => setEntering(true)}
            className="mx-auto mt-4 block rounded-full px-4 py-2 text-[14px] font-semibold text-[#bcd3ff] active:bg-white/10"
          >
            Enter code instead
          </button>
        )}
      </footer>

      <AnimatePresence>
        {entering && (
          <CodeEntry
            onCancel={() => setEntering(false)}
            onSubmit={(code) => {
              setEntering(false)
              onCodeRef.current(code)
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Brackets({ locked }: { locked: boolean }) {
  const corner = 'M2 22 V12 A10 10 0 0 1 12 2 H22'
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="absolute inset-0 h-full w-full overflow-visible"
      animate={locked ? { scale: 1 } : { scale: [1, 1.025, 1] }}
      transition={locked ? { duration: 0.3 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        <linearGradient id="loupe-bracket" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#7fb0ff" />
        </linearGradient>
      </defs>
      {[0, 90, 180, 270].map((deg) => (
        <path
          key={deg}
          d={corner}
          transform={`rotate(${deg} 50 50)`}
          fill="none"
          stroke={locked ? '#7fb0ff' : 'url(#loupe-bracket)'}
          strokeWidth={locked ? 5 : 4}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: 'drop-shadow(0 0 6px rgb(58 128 255 / 0.85))', transition: 'stroke 200ms' }}
        />
      ))}
    </motion.svg>
  )
}

function LockMark() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#3a80ff] to-[#00369e] shadow-[0_10px_30px_rgb(31_92_255/0.6)]"
        initial={{ scale: 0.3 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="white" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.12, duration: 0.35, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>
    </motion.div>
  )
}

function CodeEntry({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (code: string) => void }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const complete = value.length === CODE_LENGTH

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div className="absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-[#050c22]/60 backdrop-blur-sm" />
      <motion.form
        className="pb-safe absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-white/10 bg-[#0d1838]/95 px-6 pt-6 pb-8 backdrop-blur-xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (complete) onSubmit(value)
        }}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />
        <p className="text-center text-[17px] font-semibold">Enter the code from Loupe</p>
        <p className="mt-1 text-center text-[13px] text-white/55">It’s shown under the QR code in Loupe.</p>

        <label className="relative mt-6 flex justify-center gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase().replace(CODE_ALPHABET, '').slice(0, CODE_LENGTH))}
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            spellCheck={false}
            className="absolute inset-0 caret-transparent opacity-0 outline-none"
            aria-label="Pairing code"
          />
          {Array.from({ length: CODE_LENGTH }, (_, i) => {
            const active = i === value.length || (complete && i === CODE_LENGTH - 1)
            return (
              <div
                key={i}
                className={`font-dot flex h-14 w-11 items-center justify-center rounded-[14px] border text-[24px] transition-colors ${
                  active ? 'border-[#5b95ff] bg-[#1f5cff]/20 shadow-[0_0_18px_rgb(58_128_255/0.45)]' : 'border-white/12 bg-white/5'
                }`}
              >
                <AnimatePresence mode="popLayout">
                  {value[i] && (
                    <motion.span
                      key={value[i] + i}
                      initial={{ y: 10, opacity: 0, filter: 'blur(4px)' }}
                      animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0 }}
                    >
                      {value[i]}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </label>

        <button
          type="submit"
          disabled={!complete}
          className="mt-7 h-[52px] w-full rounded-full bg-gradient-to-r from-[#3a80ff] to-[#1f5cff] text-[16px] font-semibold shadow-[0_10px_28px_rgb(31_92_255/0.45)] transition-opacity disabled:opacity-35"
        >
          Connect
        </button>
      </motion.form>
    </motion.div>
  )
}
