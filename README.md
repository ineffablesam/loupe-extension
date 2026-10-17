![Loupe — the intelligence layer behind every purchase. A Perpay concept.](docs/banner.jpg)

# Loupe

The intelligence layer behind every purchase. Loupe is a Chrome extension concept that brings [Perpay](https://perpay.com) to all your shopping.

On Amazon, Walmart, Best Buy and other stores, it reads the product page and tells you what the price really means for you: how many hours of work it is, what it looks like per paycheck, whether it went up since you last looked, and anything in the fine print you'd want to know. If the same item is on the Perpay Marketplace, it shows up right there, already planned around your paycheck.

> This is a concept project. It is not an official Perpay product and uses demo data only.

[![Watch Loupe in action](docs/demo.png)](https://youtu.be/eFXTPHeqPCM)

![The Loupe card on Amazon, Walmart and Best Buy](docs/stores.jpg)

## What it does

- A Loupe card under the price on any product page: full price, hours of work, price changes, fine print and the Perpay option
- A Perpay price on matching search results, and one last Perpay option at checkout
- A side panel with the full report and your Perpay account: upcoming paychecks, spending limit and credit builder
- Reminders before a return window or trial ends
- QR sign-in with your phone

The fine print is read by Gemini Nano, the model built into Chrome, so nothing you browse leaves your computer. Simple rules handle prices and fees, and anything the model says is checked against the page before it's shown.

The phone side is a mock of the Perpay app, built only for this demo.

## How it works

![How Loupe works](docs/architecture.png)

## Tech

React · TypeScript · Vite · Tailwind CSS · Framer Motion · Gemini Nano (Chrome Prompt API)

## Getting started

Requires Node.js 20+.

```bash
./start.sh
```

This installs dependencies when needed, then runs:

| Service | Address |
| --- | --- |
| Extension build (watch mode) | `dist/extension/` |
| Pairing API | `http://localhost:5175/api` |
| Phone app (same Wi-Fi, HTTPS) | `https://<your-mac-ip>:5176` |

### Load the extension

1. Open `chrome://extensions` and enable **Developer mode**
2. **Load unpacked** → select `dist/extension`
3. Click the Loupe toolbar icon to open the side panel

The panel reloads itself whenever a source file changes.

### Open the phone app

> The phone app is a mock of the Perpay app, built only for this demo. It is not the real Perpay app and holds demo data only.

The phone camera requires HTTPS, so `start.sh` serves the app over HTTPS on your local network using a [mkcert](https://github.com/FiloSottile/mkcert) certificate (`brew install mkcert && mkcert -install`).

On each phone, once: open `http://<your-mac-ip>:5177` to install and trust the development certificate. Then open the phone app URL printed by `start.sh` and, optionally, add it to the Home Screen.

Alternatively, `./start.sh --tunnel` exposes the phone app through a Cloudflare quick tunnel (requires `cloudflared`).

### Sign in

Open the Loupe side panel, then in the phone app tap the scan icon in the top bar and point it at the QR code. Approve the request on the phone and the panel signs in.

### Gemini Nano

On a supported version of Chrome, the side panel offers a one-time model download. Without it, Loupe still works using the rules alone.

## Scripts

```bash
npm run dev          # extension watch build
npm run dev:web      # extension UI in the browser (no chrome.* APIs)
npm run dev:mobile   # phone app + pairing API on :5175
npm run build        # production extension build
npm run build:mobile # production phone app build
npm run typecheck
```

## Structure

```
extension/   Manifest and background worker
src/         Side panel, store page script, page reader and fine-print rules
mobile/      Mock Perpay phone app for the demo
server/      Pairing service
public/      Icons, fonts and the Marketplace catalogue
scripts/     Dev helpers and catalogue builder
docs/        README images
```

## Links

- **Demo video:** [youtu.be/eFXTPHeqPCM](https://youtu.be/eFXTPHeqPCM)
- **Case study:** [heysam.dev/works/loupe](https://heysam.dev/works/loupe)
