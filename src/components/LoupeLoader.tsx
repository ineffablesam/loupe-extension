import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'

interface LoupeLoaderProps {
  /** Small caption under the wordmark. */
  caption: string
  onDone: () => void
}

/** 5×7 dot-matrix glyphs, matching Ndot57Caps. */
const GLYPHS: Record<string, string[]> = {
  L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
}
const WORD = 'LOUPE'
const PITCH = 7.5
const LETTER_GAP = 1.6
const DOT_R = 2.7
const RING_R = 60

const ORBIT_MS = 1400
const MORPH_MS = 900
const MORPH_STAGGER_MS = 380
const HOLD_MS = 1300
const TOTAL_MS = ORBIT_MS + MORPH_STAGGER_MS + MORPH_MS + HOLD_MS

const INK = [11, 18, 32]
const BRAND = [31, 92, 255]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)

interface Dot {
  tx: number
  ty: number
  /** 0 at the left of the word, 1 at the right. */
  u: number
  angle: number
}

function buildDots(): { dots: Dot[]; width: number; height: number } {
  const cols = WORD.length * 5 + (WORD.length - 1) * LETTER_GAP
  const width = (cols - 1) * PITCH
  const height = 6 * PITCH
  const raw: { x: number; y: number }[] = []
  ;[...WORD].forEach((ch, li) => {
    GLYPHS[ch].forEach((row, r) => {
      ;[...row].forEach((cell, c) => {
        if (cell === 'X') raw.push({ x: (li * (5 + LETTER_GAP) + c) * PITCH - width / 2, y: r * PITCH - height / 2 })
      })
    })
  })
  // Ring slots ordered by the target's angle around the centre, so dots fly outward without crossing much.
  const order = raw.map((p, i) => ({ i, a: Math.atan2(p.y, p.x) })).sort((a, b) => a.a - b.a)
  const dots: Dot[] = new Array(raw.length)
  order.forEach(({ i }, slot) => {
    dots[i] = {
      tx: raw[i].x,
      ty: raw[i].y,
      u: (raw[i].x + width / 2) / width,
      angle: (slot / raw.length) * Math.PI * 2,
    }
  })
  return { dots, width, height }
}

export default function LoupeLoader({ caption, onDone }: LoupeLoaderProps) {
  const { dots, width } = useMemo(buildDots, [])
  const refs = useRef<(SVGCircleElement | null)[]>([])
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    let raf = 0

    const frame = (now: number) => {
      const t = reduceMotion ? ORBIT_MS + MORPH_STAGGER_MS + MORPH_MS : now - start
      // The ring keeps spinning (and slowing) until each dot lifts off.
      const spin = (k: number) => {
        const s = Math.min(k, ORBIT_MS + MORPH_STAGGER_MS) / 1000
        return s * 4.2 - s * s * 0.6
      }

      dots.forEach((d, i) => {
        const el = refs.current[i]
        if (!el) return
        const delay = ORBIT_MS + d.u * MORPH_STAGGER_MS
        const p = easeInOutCubic(clamp01((t - delay) / MORPH_MS))
        const a = d.angle + spin(Math.min(t, delay))

        // Orbit: a breathing ring with a bright comet head chasing around it.
        const breathe = 1 + 0.06 * Math.sin(t / 180)
        const rx = Math.cos(a) * RING_R * breathe
        const ry = Math.sin(a) * RING_R * breathe
        const TAU = Math.PI * 2
        const behind = (((t / 230 - a) % TAU) + TAU) % TAU
        const comet = Math.exp(-behind * 1.1)

        // Morph: curve out along a swirl on the way to the glyph slot.
        const swirl = Math.sin(Math.PI * p) * 18
        const mx = rx + (d.tx - rx) * p - Math.sin(a) * swirl
        const my = ry + (d.ty - ry) * p + Math.cos(a) * swirl

        // Hold: a brand shimmer sweeps across the formed word.
        const holdT = t - (ORBIT_MS + MORPH_STAGGER_MS + MORPH_MS)
        const sweep = holdT > 0 ? -0.2 + (holdT / 900) * 1.4 : -9
        const shine = Math.exp(-(((d.u - sweep) / 0.12) ** 2))

        const ringMix = (1 - p) * (0.35 + 0.65 * comet)
        const mix = Math.max(ringMix, shine * 0.9)
        const color = INK.map((c, k) => Math.round(c + (BRAND[k] - c) * mix))
        const ringR = DOT_R * (0.55 + 0.45 * comet)
        el.setAttribute('cx', mx.toFixed(2))
        el.setAttribute('cy', my.toFixed(2))
        el.setAttribute('r', (ringR + (DOT_R - ringR) * p + shine * 0.5).toFixed(2))
        el.setAttribute('fill', `rgb(${color[0]},${color[1]},${color[2]})`)
        el.setAttribute('opacity', (p > 0 ? 1 : 0.45 + 0.55 * comet).toFixed(3))
      })

      if (t >= TOTAL_MS) {
        onDoneRef.current()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [dots])

  const box = Math.max(width, RING_R * 2) + 40

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/55 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      role="status"
      aria-label="Loading Loupe"
    >
      <svg width={box} height={box * 0.62} viewBox={`${-box / 2} ${-box * 0.31} ${box} ${box * 0.62}`} className="overflow-visible">
        {dots.map((_, i) => (
          <circle key={i} ref={(el) => void (refs.current[i] = el)} r={DOT_R} cx={0} cy={0} opacity={0} />
        ))}
      </svg>
      <motion.p
        className="mt-3 text-[13px] font-medium text-ink-soft"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: (ORBIT_MS + MORPH_STAGGER_MS) / 1000, duration: 0.5 }}
      >
        {caption}
      </motion.p>
    </motion.div>
  )
}
