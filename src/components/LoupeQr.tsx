import { useEffect, useMemo, useRef, useState } from 'react'
import { buildQrMatrix, type QrMatrix, type QrModule } from '../lib/qr-matrix'

interface LoupeQrProps {
  value: string
  size: number
  /** 'live' builds the skyline and settles into the code; 'success' lifts it back up and away. */
  mode?: 'live' | 'success'
  blurred?: boolean
  /** True while towers rise past the code's bounds, false once they've sunk back inside. */
  onSkyline?: (rising: boolean) => void
}

/** Extra canvas around the code so towers can rise past its edges. */
const PAD = 64
const BUILD_MS = 2700
const SUCCESS_MS = 1000
const SWEEP_EVERY_MS = 4200
const SWEEP_MS = 1500
/** Build progress at which the towers are low enough to sit inside the card. */
const SURFACE_AT = 0.72
/** Card padding around the code; the success lift-off is clipped to it. */
const CARD_INSET = 20
/** Core height relative to its ring; level roofs keep the finder pattern legible from above. */
const CORE_RATIO = 1

const DOT_R = 0.42
const TILT = (56 * Math.PI) / 180
const YAW_START = (-36 * Math.PI) / 180
const YAW_MID = (-20 * Math.PI) / 180

type RGB = [number, number, number]
const INK: RGB = [11, 18, 32]
const BRAND: RGB = [31, 92, 255]
const SKY: RGB = [150, 190, 255]
const DEEP: RGB = [6, 28, 96]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

function hash(r: number, c: number) {
  const s = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** Skyline height in module units: the core is downtown. */
function towerHeight(m: QrModule) {
  return 0.7 + 4 * (1 - m.dist) ** 1.4 + hash(m.r, m.c) * 1.8
}

interface Camera {
  tilt: number
  yaw: number
  zoom: number
}

type Pt = [number, number]

/** A finder/alignment pattern extruded as a rounded ring building around a shorter core. */
interface Landmark {
  outer: Pt[]
  hole: Pt[]
  core: Pt[]
  x: number
  z: number
  dist: number
  h: number
}

/** Rounded-rect outline in module space, matching `CanvasRenderingContext2D.roundRect`. */
function roundedRect(x0: number, z0: number, w: number, d: number, rad: number, steps = 8): Pt[] {
  const pts: Pt[] = []
  const corners: [number, number, number][] = [
    [x0 + w - rad, z0 + d - rad, 0],
    [x0 + rad, z0 + d - rad, Math.PI / 2],
    [x0 + rad, z0 + rad, Math.PI],
    [x0 + w - rad, z0 + rad, (3 * Math.PI) / 2],
  ]
  for (const [cx, cz, a0] of corners) {
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (k / steps) * (Math.PI / 2)
      pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad])
    }
  }
  return pts
}

function buildLandmarks(m: QrMatrix): Landmark[] {
  const half = m.count / 2
  const maxDist = Math.hypot(half, half)
  const add = (outer: Pt[], hole: Pt[], core: Pt[], cx: number, cz: number, h: number): Landmark => ({
    outer,
    hole,
    core,
    x: cx - half,
    z: cz - half,
    dist: Math.hypot(cx - half, cz - half) / maxDist,
    h,
  })
  return [
    ...m.finders.map(([r, c]) =>
      add(
        roundedRect(c, r, 7, 7, 2.4),
        roundedRect(c + 1, r + 1, 5, 5, 1.4),
        roundedRect(c + 2, r + 2, 3, 3, 0.95),
        c + 3.5,
        r + 3.5,
        6.2 + hash(r, c) * 0.5,
      ),
    ),
    ...m.alignments.map(([r, c]) =>
      add(
        roundedRect(c - 2, r - 2, 5, 5, 1.7),
        roundedRect(c - 1, r - 1, 3, 3, 0.7),
        roundedRect(c, r, 1, 1, 0.3),
        c + 0.5,
        r + 0.5,
        4.6,
      ),
    ),
  ]
}

export default function LoupeQr({ value, size, mode = 'live', blurred = false, onSkyline }: LoupeQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const matrix = useMemo(() => buildQrMatrix(value), [value])
  const heights = useMemo(() => matrix.modules.map(towerHeight), [matrix])
  const [settled, setSettled] = useState(false)
  const onSkylineRef = useRef(onSkyline)
  onSkylineRef.current = onSkyline

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const full = size + PAD * 2
    canvas.width = full * dpr
    canvas.height = full * dpr
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const painter = new QrPainter(ctx, matrix, heights, size)
    const start = performance.now()
    let raf = 0
    let timer = 0
    let didSettle = false
    let rising = mode === 'live' && !reduceMotion
    if (mode === 'live') setSettled(false)
    onSkylineRef.current?.(rising)

    const frame = (now: number) => {
      const t = now - start
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, full, full)

      if (mode === 'success') {
        const q = clamp01(t / SUCCESS_MS)
        painter.drawSuccess(q)
        if (q < 1) raf = requestAnimationFrame(frame)
        return
      }

      const p = reduceMotion ? 1 : clamp01(t / BUILD_MS)
      if (rising && p >= SURFACE_AT) {
        rising = false
        onSkylineRef.current?.(false)
      }
      if (p < 1) {
        painter.drawBuild(p)
        raf = requestAnimationFrame(frame)
        return
      }

      if (!didSettle) {
        didSettle = true
        setSettled(true)
      }
      const idle = t - BUILD_MS
      const phase = idle % SWEEP_EVERY_MS
      if (!reduceMotion && phase < SWEEP_MS) {
        painter.drawFlat(-0.25 + (1.5 * phase) / SWEEP_MS)
        raf = requestAnimationFrame(frame)
      } else {
        painter.drawFlat(null)
        timer = window.setTimeout(() => (raf = requestAnimationFrame(frame)), reduceMotion ? 1e9 : SWEEP_EVERY_MS - phase)
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [matrix, heights, size, mode])

  const logoPx = (matrix.logoSpan / matrix.count) * size * 0.86

  return (
    <div className={`relative${blurred ? ' dot-qr--blurred' : ''} dot-qr`} style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        aria-label="Loupe sign-in QR code"
        role="img"
        className="pointer-events-none absolute"
        style={{
          left: -PAD,
          top: -PAD,
          width: size + PAD * 2,
          height: size + PAD * 2,
          clipPath: mode === 'success' ? `inset(${PAD - CARD_INSET}px round 20px)` : undefined,
        }}
      />
      <img
        src="./images/loupe-logo.png"
        alt=""
        draggable={false}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[22%] transition-[opacity,scale] duration-500 ease-out"
        style={{
          width: logoPx,
          height: logoPx,
          opacity: settled && mode === 'live' ? 1 : 0,
          scale: settled && mode === 'live' ? '1' : '0.4',
        }}
      />
    </div>
  )
}

/**
 * Draws the code as a 3D city of module "towers" with a tiny perspective camera.
 * At rest (tilt 0, height 0, zoom 1) the projection is the identity, so the final
 * frame is exactly the flat, scannable code.
 */
class QrPainter {
  private ctx: CanvasRenderingContext2D
  private m: QrMatrix
  private heights: number[]
  private size: number
  private cell: number
  private half: number
  private landmarks: Landmark[]

  constructor(ctx: CanvasRenderingContext2D, m: QrMatrix, heights: number[], size: number) {
    this.ctx = ctx
    this.m = m
    this.heights = heights
    this.size = size
    this.cell = size / m.count
    this.half = m.count / 2
    this.landmarks = buildLandmarks(m)
  }

  drawBuild(p: number) {
    const collapse = easeInOutCubic(clamp01((p - 0.48) / 0.52))
    const yaw = (YAW_START + (YAW_MID - YAW_START) * easeOutCubic(clamp01(p / 0.48))) * (1 - collapse)
    const cam: Camera = { tilt: TILT * (1 - collapse), yaw, zoom: 0.8 + 0.2 * collapse }

    this.drawTowers(cam, (dist, h) => {
      const rise = easeOutCubic(clamp01((p - 0.24 * dist) / 0.3))
      return {
        h: h * rise * (1 - collapse),
        alpha: clamp01(rise * 3),
        tint: 1 - collapse,
        round: 0.12 + (DOT_R - 0.12) * collapse,
      }
    })
  }

  drawSuccess(q: number) {
    const lift = easeInOutCubic(q)
    const cam: Camera = { tilt: TILT * lift, yaw: YAW_MID * lift, zoom: 1 + 0.12 * lift }
    const fade = 1 - clamp01((q - 0.25) / 0.75)
    this.drawTowers(cam, (dist, h) => ({
      h: h * lift * (0.6 + 0.4 * (1 - dist)),
      alpha: fade,
      tint: Math.min(1, lift * 1.6),
      round: DOT_R - (DOT_R - 0.12) * lift,
    }))
  }

  /** `sweep` is the position (0…1 along the diagonal) of the idle light band, or null. */
  drawFlat(sweep: number | null) {
    const { ctx, cell } = this
    const span = 2 * (this.m.count - 1)
    for (const mod of this.m.modules) {
      if (mod.landmark) continue
      let color = INK
      if (sweep !== null) {
        const u = (mod.r + mod.c) / span
        color = mix(INK, BRAND, 0.9 * Math.exp(-(((u - sweep) / 0.07) ** 2)))
      }
      ctx.fillStyle = rgba(color)
      ctx.beginPath()
      ctx.arc(PAD + (mod.c + 0.5) * cell, PAD + (mod.r + 0.5) * cell, DOT_R * cell, 0, Math.PI * 2)
      ctx.fill()
    }
    this.drawLandmarks(INK, 1)
  }

  private drawLandmarks(color: RGB, alpha: number) {
    const { ctx, cell } = this
    const at = (v: number) => PAD + v * cell
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = rgba(color)
    ctx.strokeStyle = rgba(color)
    ctx.lineWidth = cell
    for (const [r, c] of this.m.finders) {
      ctx.beginPath()
      ctx.roundRect(at(c + 0.5), at(r + 0.5), 6 * cell, 6 * cell, 1.9 * cell)
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(at(c + 2), at(r + 2), 3 * cell, 3 * cell, 0.95 * cell)
      ctx.fill()
    }
    for (const [r, c] of this.m.alignments) {
      ctx.beginPath()
      ctx.roundRect(at(c - 1.5), at(r - 1.5), 4 * cell, 4 * cell, 1.2 * cell)
      ctx.stroke()
      ctx.beginPath()
      ctx.roundRect(at(c), at(r), cell, cell, 0.3 * cell)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawTowers(
    cam: Camera,
    state: (dist: number, h: number) => { h: number; alpha: number; tint: number; round: number },
  ) {
    const { ctx } = this
    const cy = Math.cos(cam.yaw)
    const sy = Math.sin(cam.yaw)
    const ct = Math.cos(cam.tilt)
    const st = Math.sin(cam.tilt)
    const depthOf = (y: number, x: number, z: number) => y * ct + (x * sy + z * cy) * st
    const focal = this.m.count * 1.7
    const origin = PAD + this.size / 2

    const project = (x: number, y: number, z: number): Pt => {
      const x1 = x * cy - z * sy
      const z1 = x * sy + z * cy
      const f = (focal / (focal - (y * ct + z1 * st))) * this.cell * cam.zoom
      return [origin + x1 * f, origin + (z1 * ct - y * st) * f]
    }

    // Unit vector toward the camera; a side face is visible when its normal points at it.
    const viewX = sy * st
    const viewZ = cy * st
    const showWalls = cam.tilt > 0.001
    const light = (nx: number, nz: number) => 0.68 + 0.18 * nx + 0.06 * nz

    type Item = { x: number; z: number; h: number; alpha: number; tint: number; round: number; depth: number; mark?: Landmark }
    const items: Item[] = []
    this.m.modules.forEach((mod, i) => {
      if (mod.landmark) return
      const s = state(mod.dist, this.heights[i])
      const x = mod.c + 0.5 - this.half
      const z = mod.r + 0.5 - this.half
      items.push({ x, z, ...s, depth: depthOf(s.h / 2, x, z) })
    })
    for (const mark of this.landmarks) {
      const s = state(mark.dist, mark.h)
      items.push({ x: mark.x, z: mark.z, ...s, depth: depthOf(s.h / 2, mark.x, mark.z), mark })
    }
    items.sort((a, b) => a.depth - b.depth)

    const quad = (a: Pt, b: Pt, c: Pt, d: Pt) => {
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.lineTo(c[0], c[1])
      ctx.lineTo(d[0], d[1])
      ctx.closePath()
      ctx.fill()
    }

    for (const t of items) {
      if (t.alpha <= 0.01) continue
      const glow = clamp01(t.h / 6)
      const top = mix(INK, mix(BRAND, SKY, 0.45 + 0.55 * glow), t.tint)
      const wall = mix(INK, mix(DEEP, BRAND, glow * 0.8), t.tint)
      const wallStyle = (nx: number, nz: number) => {
        const k = light(nx, nz)
        return rgba(shade(wall, k + (1 - k) * (1 - t.tint)))
      }
      ctx.globalAlpha = t.alpha

      if (t.mark) {
        const { outer, hole, core } = t.mark
        const coreH = t.h * CORE_RATIO
        // Back to front: far inner wall of the ring, the core, then the ring's outside and roof.
        this.extrudeWalls(hole, true, t.h, wallStyle, project, depthOf, viewX, viewZ, showWalls)
        this.extrudeWalls(core, false, coreH, wallStyle, project, depthOf, viewX, viewZ, showWalls)
        this.roof([core], coreH, top, project)
        this.extrudeWalls(outer, false, t.h, wallStyle, project, depthOf, viewX, viewZ, showWalls)
        this.roof([outer, hole], t.h, top, project)
        continue
      }

      const hw = DOT_R
      if (t.h > 0.02 && showWalls) {
        for (const [nx, nz] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          if (nx * viewX + nz * viewZ <= 0.02) continue
          // Edge endpoints run along the face, perpendicular to its normal.
          const ax = t.x + (nx - nz) * hw
          const az = t.z + (nz + nx) * hw
          const bx = t.x + (nx + nz) * hw
          const bz = t.z + (nz - nx) * hw
          ctx.fillStyle = wallStyle(nx, nz)
          quad(project(ax, 0, az), project(bx, 0, bz), project(bx, t.h, bz), project(ax, t.h, az))
        }
      }

      // Rooftop: a rounded square that becomes the final dot as `round` reaches DOT_R.
      const rr = Math.min(t.round, hw)
      const inner = hw - rr
      ctx.fillStyle = rgba(top)
      ctx.beginPath()
      const corners: [number, number, number][] = [
        [inner, inner, 0],
        [-inner, inner, Math.PI / 2],
        [-inner, -inner, Math.PI],
        [inner, -inner, (3 * Math.PI) / 2],
      ]
      corners.forEach(([ox, oz, a0], ci) => {
        for (let k = 0; k <= 4; k++) {
          const a = a0 + (k / 4) * (Math.PI / 2)
          const [px, py] = project(t.x + ox + Math.cos(a) * rr, t.h, t.z + oz + Math.sin(a) * rr)
          if (ci === 0 && k === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
      })
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private extrudeWalls(
    pts: Pt[],
    inward: boolean,
    h: number,
    style: (nx: number, nz: number) => string,
    project: (x: number, y: number, z: number) => Pt,
    depthOf: (y: number, x: number, z: number) => number,
    viewX: number,
    viewZ: number,
    show: boolean,
  ) {
    if (!show || h <= 0.02 || pts.length < 3) return
    const { ctx, half } = this
    let cx = 0
    let cz = 0
    for (const [px, pz] of pts) {
      cx += px
      cz += pz
    }
    cx /= pts.length
    cz /= pts.length
    const walls: { a: Pt; b: Pt; nx: number; nz: number; depth: number }[] = []
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]
      const b = pts[(k + 1) % pts.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 1e-6) continue
      let nx = (b[1] - a[1]) / len
      let nz = -(b[0] - a[0]) / len
      const mx = (a[0] + b[0]) / 2
      const mz = (a[1] + b[1]) / 2
      if (((mx - cx) * nx + (mz - cz) * nz < 0) !== inward) {
        nx = -nx
        nz = -nz
      }
      if (nx * viewX + nz * viewZ <= 0.02) continue
      walls.push({ a, b, nx, nz, depth: depthOf(h / 2, mx - half, mz - half) })
    }
    walls.sort((u, v) => u.depth - v.depth)
    for (const w of walls) {
      const ax = w.a[0] - half
      const az = w.a[1] - half
      const bx = w.b[0] - half
      const bz = w.b[1] - half
      const p1 = project(ax, 0, az)
      const p2 = project(bx, 0, bz)
      const p3 = project(bx, h, bz)
      const p4 = project(ax, h, az)
      ctx.fillStyle = style(w.nx, w.nz)
      ctx.beginPath()
      ctx.moveTo(p1[0], p1[1])
      ctx.lineTo(p2[0], p2[1])
      ctx.lineTo(p3[0], p3[1])
      ctx.lineTo(p4[0], p4[1])
      ctx.closePath()
      ctx.fill()
    }
  }

  private roof(contours: Pt[][], h: number, color: RGB, project: (x: number, y: number, z: number) => Pt) {
    const { ctx, half } = this
    ctx.fillStyle = rgba(color)
    ctx.beginPath()
    for (const pts of contours) {
      pts.forEach(([px, pz], k) => {
        const [sx, sz] = project(px - half, h, pz - half)
        if (k === 0) ctx.moveTo(sx, sz)
        else ctx.lineTo(sx, sz)
      })
      ctx.closePath()
    }
    ctx.fill('evenodd')
  }
}
