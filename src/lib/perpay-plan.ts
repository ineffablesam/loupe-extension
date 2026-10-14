import { MARKETPLACE_PAYS, type MarketplaceItem } from '../data/marketplace'

export interface PerpayPlan {
  item: MarketplaceItem
  total: number
  perPay: number
  pays: number
  withinLimit: boolean
  overLimitBy: number
}

export function perpayPlan(item: MarketplaceItem, spendingLimit: number): PerpayPlan {
  const total = item.price + item.shipping
  return {
    item,
    total,
    perPay: Math.round((total / MARKETPLACE_PAYS) * 100) / 100,
    pays: MARKETPLACE_PAYS,
    withinLimit: total <= spendingLimit,
    overLimitBy: Math.max(0, total - spendingLimit),
  }
}

export function usd(value: number, cents: 'auto' | 'always' = 'auto') {
  const showCents = cents === 'always' || Math.round(value * 100) % 100 !== 0
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  })
}
