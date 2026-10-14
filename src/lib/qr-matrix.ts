import QRCode from 'qrcode'

export const FINDER = 7

export interface QrModule {
  r: number
  c: number
  /** Part of a finder or alignment pattern — drawn as a solid rounded shape, never a dot. */
  landmark: boolean
  /** 0 at the center of the code, 1 at the far corner. */
  dist: number
}

export interface QrMatrix {
  count: number
  modules: QrModule[]
  finders: [number, number][]
  alignments: [number, number][]
  logoSpan: number
}

/** Centers of the 5×5 alignment patterns (ISO 18004 Annex E), minus the finder corners. */
function alignmentCenters(version: number): [number, number][] {
  if (version === 1) return []
  const size = version * 4 + 17
  const count = Math.floor(version / 7) + 2
  const step = size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2
  const coords = [size - 7]
  for (let i = 1; i < count - 1; i++) coords[i] = coords[i - 1] - step
  coords.push(6)
  coords.reverse()
  const last = coords.length - 1
  const centers: [number, number][] = []
  coords.forEach((r, i) =>
    coords.forEach((c, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
      centers.push([r, c])
    }),
  )
  return centers
}

export function buildQrMatrix(value: string): QrMatrix {
  const { modules: bits, version } = QRCode.create(value, { errorCorrectionLevel: 'H' })
  const count = bits.size
  // Level H survives ~30% damage; the logo hole stays well under that.
  const logoSpan = Math.round(count * 0.24) | 1
  const logoStart = (count - logoSpan) / 2
  const center = (count - 1) / 2
  const maxDist = Math.hypot(center, center)

  const inLogo = (r: number, c: number) =>
    r >= logoStart && r < logoStart + logoSpan && c >= logoStart && c < logoStart + logoSpan
  const finders: [number, number][] = [
    [0, 0],
    [0, count - FINDER],
    [count - FINDER, 0],
  ]
  const inFinder = (r: number, c: number) => finders.some(([fr, fc]) => r >= fr && r < fr + FINDER && c >= fc && c < fc + FINDER)
  const alignments = alignmentCenters(version).filter(([r, c]) => !inLogo(r, c))
  const inAlignment = (r: number, c: number) => alignments.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2)

  const modules: QrModule[] = []
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!bits.get(r, c) || inLogo(r, c)) continue
      modules.push({
        r,
        c,
        landmark: inFinder(r, c) || inAlignment(r, c),
        dist: Math.hypot(r - center, c - center) / maxDist,
      })
    }
  }
  return { count, modules, finders, alignments, logoSpan }
}
