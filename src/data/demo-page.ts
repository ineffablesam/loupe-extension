import type { PageSnapshot } from '../lib/page-reader'

/** Stands in for a real tab when the panel runs outside Chrome (npm run dev:web). */
export const DEMO_PAGE: PageSnapshot = {
  url: 'https://www.amazon.com/dp/B0DGJ7HYG1',
  host: 'amazon.com',
  title: 'Apple AirPods Max Wireless Over-Ear Headphones, Active Noise Cancelling, USB-C Charging, Midnight',
  image: null,
  price: 549,
  isProduct: true,
  isCheckout: false,
  order: null,
  selected: ['AppleCare+ for AirPods Max (2 Years) $59.00'],
  snippets: [
    'FREE delivery Saturday, October 17',
    'Pay $45.75/month for 12 months (plus S&H, tax) with 0% interest equivalent financing',
    'Or pay over time with Affirm: as low as $50/mo at 10–36% APR for 12 months',
    'Add a Protection Plan: AppleCare+ for AirPods Max (2 Years) $59.00',
    'Try Prime free for 30 days, then $14.99/month. Cancel anytime.',
    'Returns: 30-day refund/replacement. Opened items may be subject to a 15% restocking fee.',
  ],
}
