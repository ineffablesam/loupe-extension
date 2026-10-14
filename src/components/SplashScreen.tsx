import { useEffect, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'

const WORDMARK = 'LOUPE'
const EASE_OUT = [0.16, 1, 0.3, 1] as const

const REVEAL_AT_MS = 1900
const SIGNATURE_PLAY_DELAY_MS = 600
const HOLD_AFTER_SIGNATURE_MS = 500
const MAX_SPLASH_MS = 7000

type Phase = 'intro' | 'reveal'

const letterVariants: Variants = {
  hidden: { opacity: 0, scale: 1.6, filter: 'blur(22px)', rotateY: 0 },
  intro: (i: number) => ({
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 1.1, delay: 0.25 + i * 0.09, ease: EASE_OUT },
  }),
  // Each letter spins a full turn as it climbs and fades — together they trace a helix out of frame.
  reveal: (i: number) => ({
    opacity: 0,
    scale: 0.9,
    y: -70,
    filter: 'blur(8px)',
    rotateY: 360,
    transition: {
      default: { duration: 0.9, delay: i * 0.06, ease: [0.65, 0, 0.35, 1] },
      opacity: { duration: 0.5, delay: 0.35 + i * 0.06, ease: 'easeIn' },
      filter: { duration: 0.5, delay: 0.35 + i * 0.06, ease: 'easeIn' },
    },
  }),
}

interface SplashScreenProps {
  onDone: () => void
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const reveal = window.setTimeout(() => setPhase('reveal'), REVEAL_AT_MS)
    const fallback = window.setTimeout(onDone, MAX_SPLASH_MS)
    return () => {
      window.clearTimeout(reveal)
      window.clearTimeout(fallback)
    }
  }, [onDone])

  const revealed = phase === 'reveal'

  useEffect(() => {
    if (!revealed) return
    const t = window.setTimeout(() => videoRef.current?.play().catch(() => {}), SIGNATURE_PLAY_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [revealed])

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(12px)' }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
    >
      <motion.img
        src="./images/splash-bg.jpg"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        initial={{ scale: 1.12, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: EASE_OUT }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <motion.h1
          aria-label="Loupe"
          className="splash-wordmark flex font-dot text-[64px] leading-[0.8] tracking-[0.08em] text-white"
        >
          {WORDMARK.split('').map((letter, i) => (
            <motion.span
              key={i}
              aria-hidden
              custom={i}
              variants={letterVariants}
              initial="hidden"
              animate={phase}
              style={{ display: 'inline-block', transformPerspective: 600 }}
            >
              {letter}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p
          className="mt-3 text-[15px] font-normal tracking-wide text-white/65"
          initial={{ opacity: 0, y: 8, filter: 'blur(10px)' }}
          animate={
            revealed
              ? { opacity: 0, y: -40, filter: 'blur(8px)', transition: { duration: 0.6, ease: EASE_OUT } }
              : { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 1, delay: 0.85, ease: EASE_OUT } }
          }
        >
          The intelligence layer behind every purchase.
        </motion.p>
      </div>

      {/* Signature takes the stage once the wordmark has spiralled away */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.video
          ref={videoRef}
          src="./videos/made-by-sam.webm"
          aria-label="made by sam"
          muted
          playsInline
          preload="auto"
          className="h-[75px] w-[300px]"
          initial={{ opacity: 0, y: 140 }}
          animate={revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 140 }}
          transition={{ type: 'spring', stiffness: 140, damping: 20, mass: 0.9, delay: revealed ? 0.55 : 0 }}
          onEnded={() => window.setTimeout(onDone, HOLD_AFTER_SIGNATURE_MS)}
        />
      </div>

      {/* Footer — progress + Perpay credit */}
      <motion.div
        className="absolute inset-x-0 bottom-9 flex flex-col items-center gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.1, ease: EASE_OUT }}
      >
        <div className="splash-progress w-40" />
        <div className="flex items-baseline gap-[7px] text-[11px] font-medium uppercase tracking-[0.22em] text-white/75">
          <span className="-mr-[0.22em]">A</span>
          <img
            src="./images/perpay-logo.svg"
            alt="Perpay"
            draggable={false}
            // The p/y descenders are the bottom 29% of the logo; sink them below the text baseline.
            className="h-[12px] translate-y-[3.4px] w-auto brightness-0 invert"
          />
          <span className="-mr-[0.22em]">concept</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
