import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
} as const

export const ScanIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <rect x="8" y="8" width="3" height="3" rx="0.6" />
    <rect x="13" y="8" width="3" height="3" rx="0.6" />
    <rect x="8" y="13" width="3" height="3" rx="0.6" />
    <path d="M13 13h1.5v1.5M16 16h-1.5" />
  </svg>
)

export const MenuIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
)

export const HomeIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </svg>
)

export const CardIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18M6.5 15h4" />
  </svg>
)

export const BagIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6 8h12l-1 12H7z" />
    <path d="M9 10V7a3 3 0 0 1 6 0v3" />
  </svg>
)

export const StoreIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 9.5 5.5 5h13L20 9.5" />
    <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
    <path d="M5.5 12v7.5h13V12M10 19.5v-4h4v4" />
  </svg>
)

export const ChartIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 4v16h16" />
    <path d="m7 15 4-4 3 3 5-6" />
  </svg>
)

export const ChevronRight = (p: IconProps) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const GiftIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4" y="9" width="16" height="11" rx="1" />
    <path d="M3 9h18M12 9v11M12 9S10.5 4.5 8 5.2C6 5.8 7 9 12 9zM12 9s1.5-4.5 4-3.8c2 .6 1 3.8-4 3.8z" />
  </svg>
)

export const TrendIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={2.2} {...p}>
    <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />
  </svg>
)

export const CloseIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={2.2} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const LaptopIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="5" width="15" height="10.5" rx="1.5" />
    <path d="M2.5 19h19" />
  </svg>
)
