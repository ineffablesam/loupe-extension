/** Matches the store's own type so the card reads as part of the page (Amazon Ember on Amazon). */
const SANS = `"Amazon Ember", Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

const INK = '#0F1111'
const MUTED = '#565959'
const LINK = '#007185'
const PRICE = '#B12704'
const LINE = '#D5D9D9'
const PERPAY = '#1F5CFF'

export const BANNER_CSS = `
:host { all: initial; display: block; container-type: inline-size; }
:host([data-mode="inline"]) { margin: 10px 0 14px; width: 100%; min-width: 260px; flex: 1 0 100%; grid-column: 1 / -1; }
:host([data-mode="floating"]) { position: fixed; right: 20px; bottom: 20px; width: 360px; z-index: 2147483646; }
* { box-sizing: border-box; }

.card {
  border: 1px solid ${LINE};
  border-radius: 8px;
  background: #fff;
  padding: 12px 14px;
  color: ${INK};
  font: 400 14px/20px ${SANS};
}
.card.floating { box-shadow: 0 8px 24px rgb(15 17 17 / 0.18); }
.card.enter { animation: rise 0.35s ease-out; }
@keyframes rise { from { opacity: 0; } }

.top { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; color: ${MUTED}; }
.top .icon { width: 16px; height: 16px; border-radius: 4px; }
.top .spacer { flex: 1; }

button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.link { color: ${LINK}; font-size: 13px; }
.link:hover { color: #C7511F; text-decoration: underline; }
.close { color: ${MUTED}; font-size: 18px; line-height: 1; }

.headline { margin: 6px 0 0; font-size: 16px; line-height: 22px; font-weight: 700; }
.headline .total { color: ${PRICE}; font-variant-numeric: tabular-nums; }
.headline .was { color: ${MUTED}; font-weight: 400; }

ul { list-style: none; margin: 4px 0 0; padding: 0; }
li { display: flex; align-items: baseline; gap: 6px; font-size: 13px; line-height: 19px; }
li .text { min-width: 0; }
li .amt { color: ${PRICE}; }
li .bullet { color: ${MUTED}; }

.sub { margin: 2px 0 0; font-size: 13px; color: ${MUTED}; }

.work { display: flex; align-items: center; gap: 5px; margin: 2px 0 0; font-size: 13px; line-height: 18px; color: ${MUTED}; }
.work svg { width: 13px; height: 13px; flex-shrink: 0; }
.work b { color: ${INK}; }

.change { margin: 4px 0 0; font-size: 13px; line-height: 18px; }
.change.up { color: ${PRICE}; }
.change.down { color: #067D62; }
.change .was { color: ${MUTED}; }

.dates { margin-top: 10px; padding: 10px 12px; border: 1px solid ${LINE}; border-radius: 6px; background: #FCFCFC; }
.dates.bare { margin-top: 8px; }
.dates-title { margin: 0 0 4px; font-size: 13px; font-weight: 700; }
.dates ul { margin: 0; }
.dates li { display: grid; grid-template-columns: 82px 1fr; gap: 8px; font-size: 13px; line-height: 18px; padding: 2px 0; }
.dates .when { font-weight: 700; white-space: nowrap; }
.remind {
  width: 100%; margin-top: 8px; padding: 6px 12px; border-radius: 100px; border: 1px solid #888C8C;
  background: #fff; font-size: 13px; color: ${INK}; box-shadow: 0 2px 5px rgb(213 217 217 / 0.5);
}
.remind:hover:not(:disabled) { background: #F7FAFA; }
.remind:disabled { border-color: transparent; box-shadow: none; background: none; color: #067D62; font-weight: 700; cursor: default; }


.promo {
  position: relative; margin-top: 12px; padding: 18px 12px 12px;
  border: 1px dashed ${PERPAY}; border-radius: 6px; background: #EEF3FF;
}
.promo .badge {
  position: absolute; top: -1px; left: -1px; padding: 2px 8px; border-radius: 6px 0 6px 0;
  background: ${PERPAY}; color: #fff; font-size: 11px; font-weight: 700; line-height: 16px;
}
.promo .hook { margin: 4px 0 0; font-size: 14px; line-height: 19px; font-weight: 700; }
.promo .row { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.promo .thumb { width: 48px; height: 48px; flex-shrink: 0; object-fit: contain; border-radius: 6px; background: #fff; padding: 3px; }
.promo .deal { margin: 0; font-size: 14px; line-height: 20px; }
.promo .deal b { display: block; color: ${PERPAY}; font-size: 22px; line-height: 26px; font-variant-numeric: tabular-nums; }
.promo .deal .terms { vertical-align: 8px; }
.promo .offer .lead { display: block; font-size: 13px; line-height: 18px; }
.promo .offer .each { display: block; white-space: nowrap; }
.promo .offer b { display: inline; }
@container (max-width: 300px) { .promo .thumb { width: 40px; height: 40px; } .promo .row { gap: 8px; } }
.promo .deal small { display: block; color: ${MUTED}; font-size: 12px; line-height: 16px; }
.timeline { margin-top: 10px; }
.timeline .dots { display: flex; gap: 4px; }
.timeline .dots span { flex: 1; height: 6px; border-radius: 3px; background: ${PERPAY}; opacity: 0.25; }
.timeline .dots span:first-child { opacity: 1; }
.timeline .dots span:last-child { opacity: 0.6; }
.timeline .ends { display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; line-height: 15px; color: ${MUTED}; }
.promo .perks { display: flex; flex-wrap: wrap; gap: 2px 10px; margin: 8px 0 0; }
.promo .perks li { font-size: 12px; line-height: 16px; gap: 4px; }
.promo .perks li::before { content: "✓"; color: #067D62; font-weight: 700; }
.promo .perks li.no { color: ${PRICE}; }
.promo .perks li.no::before { content: "!"; color: ${PRICE}; }
.promo .btn {
  display: block; margin-top: 10px; padding: 8px 14px; border-radius: 100px; text-align: center;
  background: ${PERPAY}; color: #fff; font-size: 13px; font-weight: 700; text-decoration: none;
  box-shadow: 0 0 0 0 rgb(31 92 255 / 0.45); animation: nudge 2.4s ease-out 0.6s 2;
}
.promo .btn:hover { background: #1849D6; }
.promo .fine { margin: 6px 0 0; color: ${MUTED}; font-size: 11px; line-height: 15px; text-align: center; }
.promo .tip { left: auto; right: -12px; transform: none; }
@keyframes nudge { 0% { box-shadow: 0 0 0 0 rgb(31 92 255 / 0.45); } 70%, 100% { box-shadow: 0 0 0 8px rgb(31 92 255 / 0); } }

.terms { position: relative; color: ${MUTED}; font-size: 13px; vertical-align: 1px; cursor: help; }
.terms .tip {
  visibility: hidden; opacity: 0; transition: opacity 0.15s ease;
  position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translateX(-50%); z-index: 2;
  width: 250px; padding: 10px 12px; border-radius: 8px; border: 1px solid ${LINE};
  background: #fff; box-shadow: 0 4px 14px rgb(15 17 17 / 0.15);
  color: ${INK}; font-size: 12px; line-height: 17px; text-align: left; white-space: normal;
}
.terms:hover .tip, .terms:focus .tip { visibility: visible; opacity: 1; }
.tip dl { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; margin: 0; }
.tip dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.tip .sum { font-weight: 700; padding-top: 4px; border-top: 1px solid #E7E7E7; margin-top: 2px; }
.tip p { margin: 6px 0 0; color: ${MUTED}; }

@media (prefers-reduced-motion: reduce) { .card.enter, .promo .btn { animation: none; } }
`

/**
 * Lives in the page itself (not a shadow root) so marks and notes sit in the
 * store's layout and scroll with it. Every rule is namespaced to loupe-.
 */
export const PAGE_CSS = `
.loupe-mark {
  text-decoration: underline dotted ${PERPAY} !important;
  text-decoration-thickness: 1.5px !important;
  text-underline-offset: 3px !important;
}
.loupe-mark.loupe-flash { animation: loupe-flash 1.6s ease-out; }
@keyframes loupe-flash { 0%, 30% { background-color: #FFF3C4; } 100% { background-color: transparent; } }

.loupe-note {
  display: flex !important; align-items: flex-start !important; gap: 6px !important;
  flex-basis: 100% !important; width: auto !important; float: none !important;
  margin: 3px 0 8px !important; padding: 0 !important;
  font: 400 12px/16px ${SANS} !important; color: ${MUTED} !important; text-align: left !important;
}
.loupe-note img { width: 14px !important; height: 14px !important; flex-shrink: 0 !important; margin: 1px 0 0 !important; border-radius: 3px !important; }
.loupe-note b { font-weight: 700 !important; color: ${INK} !important; }
.loupe-note .loupe-amt { color: ${PRICE} !important; font-weight: 700 !important; }
.loupe-reading .loupe-note, .loupe-reading .loupe-chip { display: none !important; }

/* A split pill under the store's price: Perpay's mark, then the per-paycheck price. */
.loupe-chip {
  display: flex; align-items: stretch; box-sizing: border-box; width: fit-content; max-width: 100%; height: 24px; margin: 6px 0; padding: 0;
  border: 1px solid ${PERPAY}; border-radius: 999px; overflow: hidden; background: ${PERPAY};
  font: 400 12px/22px ${SANS}; white-space: nowrap; text-decoration: none !important;
  box-shadow: 0 1px 3px rgb(31 92 255 / 0.25); transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.loupe-chip:hover { transform: translateY(-1px); box-shadow: 0 3px 8px rgb(31 92 255 / 0.3); }
.loupe-chip-brand { display: flex; align-items: center; padding: 0 8px 0 10px; background: #fff; border-radius: 999px 0 0 999px; }
/* The wordmark's descenders (p, y) make it read high when box-centred. */
.loupe-chip-brand img { display: block; height: 12px !important; width: auto !important; max-width: none !important; margin: 0 !important; transform: translateY(1.5px); }
.loupe-chip-price { display: block; padding: 0 10px 0 8px; color: #fff !important; font-size: 12px; line-height: 22px; }
.loupe-chip-price b { font-weight: 700; font-size: 13px; line-height: inherit; margin-right: 1px; vertical-align: baseline; }
.loupe-chip-price::after { content: "›"; margin-left: 5px; font-size: 15px; line-height: 0; vertical-align: baseline; }
.loupe-chip--loading {
  width: 150px; height: 24px; border: 0; box-shadow: none;
  background: linear-gradient(90deg, #EAEDED 0%, #F7F8F8 40%, #EAEDED 80%) 0 0 / 300% 100%;
  animation: loupe-shimmer 1.2s ease-in-out infinite;
}
.loupe-chip--loading:hover { transform: none; box-shadow: none; }
@keyframes loupe-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .loupe-chip--loading { animation: none; } }
`
