#!/usr/bin/env bash
# Loupe dev launcher
# ==================
#
# Usage:
#   ./start.sh           extension watcher + Perpay phone app over HTTPS on your Wi-Fi
#   ./start.sh --tunnel  same, but the phone app is reached through a Cloudflare quick tunnel
#   Ctrl+C               stops everything cleanly
#
# One-time Chrome setup: chrome://extensions → Developer mode → Load unpacked →
# select dist/extension. After that the side panel reloads itself on every save.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MOBILE_PORT=5175
LAN_HTTPS_PORT=5176
LAN_SETUP_PORT=5177
TUNNEL=0
for arg in "$@"; do
  case "$arg" in
    --tunnel) TUNNEL=1 ;;
    --no-tunnel) TUNNEL=0 ;;
  esac
done

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; CYAN=""; RESET=""
fi
info() { echo "${CYAN}•${RESET} $1"; }
ok()   { echo "${GREEN}✓${RESET} $1"; }
warn() { echo "${YELLOW}⚠${RESET} $1"; }
err()  { echo "${RED}✗${RESET} $1"; }

echo "${BOLD}LOUPE — a Perpay concept${RESET}"
echo "------------------------"

# --------------------------------------------------------------------------- #
#  1. Node + dependencies (reinstall only when package.json changes)
# --------------------------------------------------------------------------- #
if ! command -v npm >/dev/null 2>&1; then
  err "npm not found on PATH. Install Node.js 20+ (https://nodejs.org) first."
  exit 1
fi

DEPS_HASH_FILE="$ROOT/.loupe-deps.sha1"
DEPS_HASH="$(shasum "$ROOT/package.json" | awk '{print $1}')"
if [ ! -d "$ROOT/node_modules" ] || [ "$(cat "$DEPS_HASH_FILE" 2>/dev/null)" != "$DEPS_HASH" ]; then
  info "Installing packages (first run, or package.json changed)..."
  if ! npm install; then
    err "npm install failed."
    exit 1
  fi
  echo "$DEPS_HASH" > "$DEPS_HASH_FILE"
  ok "Packages installed."
fi

for port in "$MOBILE_PORT" "$LAN_HTTPS_PORT" "$LAN_SETUP_PORT"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    err "Port $port is already in use — is another ./start.sh running?"
    exit 1
  fi
done

# --------------------------------------------------------------------------- #
#  1b. Wi-Fi HTTPS certificate (the iPhone camera only works on HTTPS)
# --------------------------------------------------------------------------- #
LAN_IP=""
CERT_DIR="$ROOT/.certs"
if [ "$TUNNEL" = 0 ]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  if [ -z "$LAN_IP" ]; then
    warn "Not on Wi-Fi — the phone app will only be on localhost."
  elif ! command -v mkcert >/dev/null 2>&1; then
    warn "mkcert not found — install with: brew install mkcert && mkcert -install (or use ./start.sh --tunnel)"
    LAN_IP=""
  else
    mkdir -p "$CERT_DIR"
    LOCAL_NAME="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"
    if [ "$(cat "$CERT_DIR/hosts" 2>/dev/null)" != "$LAN_IP $LOCAL_NAME" ] || [ ! -f "$CERT_DIR/lan.pem" ]; then
      info "Creating a Wi-Fi HTTPS certificate for $LAN_IP…"
      if mkcert -cert-file "$CERT_DIR/lan.pem" -key-file "$CERT_DIR/lan-key.pem" \
          "$LAN_IP" "$LOCAL_NAME" localhost 127.0.0.1 >/dev/null 2>&1; then
        echo "$LAN_IP $LOCAL_NAME" > "$CERT_DIR/hosts"
      else
        warn "mkcert failed — the phone app will only be on localhost."
        LAN_IP=""
      fi
    fi
  fi
fi

# --------------------------------------------------------------------------- #
#  2. Processes
# --------------------------------------------------------------------------- #
PIDS=()
PHONE_URL=""
TUNNEL_LOG="$ROOT/.tunnel.log"
rm -f "$ROOT/.tunnel-url" "$TUNNEL_LOG"

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "${DIM}Stopping Loupe…${RESET}"
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null; done
  wait 2>/dev/null
  rm -f "$ROOT/.tunnel-url"
  exit 0
}
trap cleanup INT TERM EXIT

rm -rf "$ROOT/dist/extension"
npm run --silent dev &
PIDS+=($!)

npm run --silent dev:mobile -- --clearScreen false &
PIDS+=($!)

if [ "$TUNNEL" = 1 ]; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    warn "cloudflared not found — install with: brew install cloudflared (continuing without a tunnel)"
    TUNNEL=0
  else
    # --config /dev/null: a ~/.cloudflared/config.yml from another project would otherwise
    # apply its ingress rules (and catch-all 404) to this quick tunnel.
    cloudflared tunnel --no-autoupdate --config /dev/null --url "http://localhost:$MOBILE_PORT" >"$TUNNEL_LOG" 2>&1 &
    PIDS+=($!)
  fi
fi

if [ -n "$LAN_IP" ]; then
  node "$ROOT/scripts/lan-https.mjs" "$CERT_DIR/lan.pem" "$CERT_DIR/lan-key.pem" "$(mkcert -CAROOT)/rootCA.pem" \
    "$LAN_HTTPS_PORT" "$LAN_SETUP_PORT" "$MOBILE_PORT" &
  PIDS+=($!)
  PHONE_URL="https://$LAN_IP:$LAN_HTTPS_PORT"
  echo "$PHONE_URL" > "$ROOT/.tunnel-url"
fi

# --------------------------------------------------------------------------- #
#  3. Wait for the tunnel URL and tell the user where everything lives
# --------------------------------------------------------------------------- #
if [ "$TUNNEL" = 1 ]; then
  PHONE_URL=""
  for _ in $(seq 1 60); do
    PHONE_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -n 1)"
    [ -n "$PHONE_URL" ] && break
    sleep 0.5
  done
  if [ -n "$PHONE_URL" ]; then
    echo "$PHONE_URL" > "$ROOT/.tunnel-url"
  else
    warn "Tunnel didn't come up within 30s — see .tunnel.log. The extension still works locally."
  fi
fi

sleep 1
echo ""
echo "${BOLD}Extension${RESET}   load ${BOLD}dist/extension${RESET} once in chrome://extensions — it auto-reloads after that"
echo "${BOLD}Pairing API${RESET} http://localhost:$MOBILE_PORT/api"
if [ -n "$PHONE_URL" ]; then
  echo "${BOLD}Phone app${RESET}   ${GREEN}$PHONE_URL${RESET}"
  echo ""
  echo "${DIM}Scan with your iPhone camera to open the Perpay app (then Share → Add to Home Screen):${RESET}"
  node "$ROOT/scripts/print-qr.mjs" "$PHONE_URL"
  if [ "$TUNNEL" = 1 ]; then
    echo "${DIM}The tunnel URL changes every run — re-open it on your phone after restarting.${RESET}"
  else
    echo "${DIM}Same Wi-Fi only. First time on a phone? Open ${RESET}${BOLD}http://$LAN_IP:$LAN_SETUP_PORT${RESET}${DIM} to trust the certificate.${RESET}"
  fi
else
  echo "${BOLD}Phone app${RESET}   http://localhost:$MOBILE_PORT ${DIM}(local only — the camera needs HTTPS)${RESET}"
fi
echo "${DIM}Press Ctrl+C to stop.${RESET}"
echo ""

# If any process dies, take the rest down rather than leaving a half-running setup.
while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      err "A Loupe process exited unexpectedly — stopping the rest."
      cleanup
    fi
  done
  sleep 1
done
