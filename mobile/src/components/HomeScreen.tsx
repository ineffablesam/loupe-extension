import type { ReactNode } from 'react'
import { BagIcon, CardIcon, ChartIcon, ChevronRight, GiftIcon, HomeIcon, MenuIcon, ScanIcon, StoreIcon, TrendIcon } from './icons'

interface HomeScreenProps {
  onScan: () => void
}

export default function HomeScreen({ onScan }: HomeScreenProps) {
  return (
    <div className="flex h-full flex-col">
      <TopBar onScan={onScan} />

      <main className="no-scrollbar flex-1 overflow-y-auto px-4 pb-32 pt-4">
        <div className="flex flex-col gap-4">
          <MarketplaceCard />
          <CreditCardCard />
          <div className="grid grid-cols-2 gap-4">
            <PerpayPlusCard />
            <DirectDepositCard />
          </div>
        </div>

        <h2 className="mt-7 text-[19px] font-semibold tracking-[-0.01em] text-navy">Learn how perpay works</h2>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4">
          <LearnTile image="/images/learn-shopping.png" title="Shopping at Perpay" />
          <LearnTile image="/images/learn-deposit.png" title="Direct Deposit" />
          <LearnTile image="/images/learn-shipping.png" title="Order Shipping" />
          <LearnTile title="How to Build Credit" />
        </div>
      </main>

      <BottomNav />
    </div>
  )
}

function TopBar({ onScan }: { onScan: () => void }) {
  return (
    <header className="pt-safe sticky top-0 z-20 bg-white shadow-[0_1px_0_rgb(28_63_97/0.06)]">
      <div className="flex h-[60px] items-center justify-between px-4">
        <img src="/images/perpay-logo.svg" alt="perpay" className="h-[25px] w-auto" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onScan}
            aria-label="Scan QR code"
            className="flex h-11 w-11 items-center justify-center rounded-full text-navy active:bg-page"
          >
            <ScanIcon className="h-[26px] w-[26px]" />
          </button>
          <button type="button" aria-label="Menu" className="flex h-11 w-11 items-center justify-center rounded-full text-navy active:bg-page">
            <MenuIcon className="h-[26px] w-[26px]" />
          </button>
        </div>
      </div>
    </header>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-[14px] bg-white shadow-[0_1px_2px_rgb(28_63_97/0.05)] ${className}`}>{children}</section>
}

function MarketplaceCard() {
  return (
    <Card>
      <div className="flex items-center gap-2 bg-mint px-4 py-2.5 text-[13.5px] font-medium text-mint-ink">
        <GiftIcon className="h-[18px] w-[18px]" />
        Shop early to avoid holiday delays
      </div>
      <div className="relative h-[150px]">
        <div className="relative z-10 px-4 pt-4">
          <h3 className="text-[19px] font-semibold tracking-[-0.01em] text-navy">Marketplace</h3>
          <p className="mt-4 text-[14px] text-mute">Estimated Spending Limit</p>
          <p className="mt-0.5 text-[38px] font-semibold leading-tight tracking-[-0.02em] text-[#a7b1ba]">$1,000</p>
        </div>
        <img src="/images/headphones.png" alt="" className="absolute bottom-0 right-0 w-[215px]" />
      </div>
      <div className="flex items-center gap-3 border-t border-page px-4 py-4">
        <p className="flex-1 text-[14px] leading-snug text-navy">Shop and pay over time with no interest or fees!</p>
        <button type="button" className="shrink-0 rounded-[6px] bg-primary px-5 py-2.5 text-[15px] font-medium text-white active:bg-primary-deep">
          Start Shopping
        </button>
      </div>
    </Card>
  )
}

function CreditCardCard() {
  return (
    <Card>
      <div className="relative h-[205px] overflow-hidden bg-gradient-to-b from-white to-[#eef1f4]">
        <h3 className="relative z-10 px-4 pt-4 text-[19px] font-semibold tracking-[-0.01em] text-navy">Credit Card</h3>
        <div className="absolute left-[38px] top-[58px] h-[176px] w-[300px] rotate-[-22deg] rounded-[18px] bg-gradient-to-br from-[#3a3a3c] via-[#1d1d1f] to-[#0c0c0d] shadow-[0_18px_30px_-12px_rgb(0_0_0/0.45),0_0_0_1px_rgb(77_140_255/0.25),0_6px_18px_-6px_rgb(77_140_255/0.6)]">
          <div className="absolute left-[34px] top-[40px] h-[30px] w-[38px] rounded-[6px] bg-gradient-to-br from-[#e8e8e8] to-[#a9a9a9] p-[5px]">
            <div className="h-full w-full rounded-[3px] border border-[#8c8c8c]/60" />
          </div>
          <span className="absolute left-[120px] top-[78px] rotate-[0deg] text-[34px] font-semibold tracking-[-0.03em] text-white/75">perpay</span>
          <div className="absolute bottom-[26px] right-[30px] flex">
            <span className="h-[26px] w-[26px] rounded-full bg-[#eb001b]" />
            <span className="-ml-[10px] h-[26px] w-[26px] rounded-full bg-[#f79e1b]/90 mix-blend-screen" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-4">
        <p className="flex-1 text-[14px] leading-snug text-navy">Access up to a $1,000 credit limit and earn 2% rewards!</p>
        <button type="button" className="shrink-0 rounded-[6px] bg-ink-btn px-5 py-2.5 text-[15px] font-medium text-white active:bg-black">
          Apply now
        </button>
      </div>
    </Card>
  )
}

function PerpayPlusCard() {
  return (
    <Card className="flex flex-col">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-navy">
            Perpay<span className="text-primary">+</span>
          </h3>
          <ChevronRight className="h-4 w-4 text-navy-soft" />
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-navy-soft">Build your credit with just $5/month</p>
      </div>
      <div className="relative mx-2 mb-2 mt-3 h-[72px] overflow-hidden rounded-[10px] bg-[#ebeffa]">
        <svg viewBox="0 0 160 84" className="absolute -bottom-[10px] left-1/2 h-[88px] -translate-x-1/2">
          <path d="M18 82a62 62 0 0 1 124 0" fill="none" stroke="#c9dbf8" strokeWidth="13" strokeLinecap="round" />
          <path d="M18 82a62 62 0 0 1 106.6-43" fill="none" stroke="#6ea1f2" strokeWidth="13" strokeLinecap="round" />
          <circle cx="124.6" cy="39" r="7.5" fill="white" stroke="#2c73eb" strokeWidth="3" />
        </svg>
        <span className="absolute right-3 top-2 flex items-center gap-1 rounded-[6px] bg-white px-1.5 py-0.5 text-[13px] font-semibold text-growth shadow-sm">
          <TrendIcon className="h-3.5 w-3.5" />
          32
        </span>
      </div>
    </Card>
  )
}

function DirectDepositCard() {
  return (
    <Card className="px-4 pt-4">
      <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-navy">Direct Deposit</h3>
      <p className="mt-4 text-[13px] text-navy-soft">Total required amount</p>
      <p className="mt-1 text-[22px] font-semibold tracking-[-0.01em] text-navy">$0/pay</p>
    </Card>
  )
}

function LearnTile({ image, title }: { image?: string; title: string }) {
  return (
    <div className="relative w-[112px] shrink-0 overflow-hidden rounded-[12px] bg-white">
      <div className="h-[38px] bg-tile" />
      {/* Crops straddle the gray/white seam 38px down, so they sit "on" the tile edge like the app's art. */}
      {image && <img src={image} alt="" className="absolute left-1/2 top-0 h-[50px] w-auto -translate-x-1/2" />}
      <p className="px-3 pb-4 pt-[18px] text-[14px] font-medium leading-snug text-navy">{title}</p>
    </div>
  )
}

function BottomNav() {
  const tab = 'flex flex-1 flex-col items-center gap-1 pt-3 text-[11.5px]'
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 bg-white shadow-[0_-1px_0_rgb(28_63_97/0.06)]">
      <div className="relative flex h-[66px] items-start">
        <a className={`${tab} text-primary`}>
          <HomeIcon className="h-6 w-6" />
          Home
        </a>
        <a className={`${tab} text-navy`}>
          <CardIcon className="h-6 w-6" />
          Card
        </a>
        <a className={`${tab} text-navy`}>
          <span className="-mt-[38px] mb-[2px] flex h-[62px] w-[62px] items-center justify-center rounded-full bg-primary text-white ring-[6px] ring-white">
            <BagIcon className="h-7 w-7" />
          </span>
          Shop
        </a>
        <a className={`${tab} text-navy`}>
          <StoreIcon className="h-6 w-6" />
          Marketplace
        </a>
        <a className={`${tab} text-navy`}>
          <ChartIcon className="h-6 w-6" />
          Perpay+
        </a>
      </div>
    </nav>
  )
}
