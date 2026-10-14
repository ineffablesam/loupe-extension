![Loupe — the intelligence layer behind every purchase. A Perpay concept.](docs/banner.jpg)

# Loupe

Loupe is a product concept for [Perpay](https://perpay.com): a Chrome side panel that sits alongside the shopping you already do and connects it to your Perpay account.

> This is a concept project. It is not an official Perpay product and uses demo data only.

## What's here

- **Chrome extension** (Manifest V3 side panel)
  - Animated splash screen
  - Passwordless sign-in: the panel shows a QR code that builds itself from a 3D "skyline" of modules, then settles into a scannable code
  - Dot-matrix Loupe loader on successful sign-in
- **Perpay mobile web app** (installable PWA)
  - Replica of the Perpay home screen
  - In-app camera scanner with a manual code fallback
  - Approve / decline sheet for the sign-in request
- **Pairing service**
  - Short-lived pairing sessions with live status over Server-Sent Events (`pending → scanned → approved`)

## Tech

React 19 · TypeScript · Vite · Tailwind CSS 4 · Framer Motion · Canvas 2D · `qr-scanner`

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

The phone camera requires HTTPS, so `start.sh` serves the app over HTTPS on your local network using a [mkcert](https://github.com/FiloSottile/mkcert) certificate (`brew install mkcert && mkcert -install`).

On each phone, once: open `http://<your-mac-ip>:5177` to install and trust the development certificate. Then open the phone app URL printed by `start.sh` and, optionally, add it to the Home Screen.

Alternatively, `./start.sh --tunnel` exposes the phone app through a Cloudflare quick tunnel (requires `cloudflared`).

### Sign in

Open the Loupe side panel, then in the phone app tap the scan icon in the top bar and point it at the QR code. Approve the request on the phone and the panel signs in.

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
extension/   MV3 manifest and background service worker
src/         Side panel UI (splash, sign-in, QR renderer, loader)
mobile/      Perpay phone app (home, scanner, approval)
server/      Pairing service (mounted into the phone app's dev server)
scripts/     Wi-Fi HTTPS proxy and terminal QR helper
start.sh     Development launcher
```
