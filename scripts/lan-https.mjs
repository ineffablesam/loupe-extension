// HTTPS front door for the Perpay phone app on the local Wi-Fi.
//
//   https://<lan-ip>:<httpsPort>  →  http://localhost:<target>   (pages, /api, SSE, Vite HMR websocket)
//   http://<lan-ip>:<setupPort>   →  one-time page to install the mkcert root CA on an iPhone
//
// Usage: node scripts/lan-https.mjs <cert.pem> <key.pem> <rootCA.pem> <httpsPort> <setupPort> <target>

import { readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const [certFile, keyFile, caFile, httpsPort, setupPort, target] = process.argv.slice(2)
const TARGET_PORT = Number(target)

const server = https.createServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, (req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: TARGET_PORT, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('Perpay app is starting — refresh in a moment.')
  })
  req.pipe(upstream)
})

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(TARGET_PORT, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    up.write(lines.join('\r\n') + '\r\n\r\n')
    if (head?.length) up.write(head)
    up.pipe(socket)
    socket.pipe(up)
  })
  const close = () => {
    up.destroy()
    socket.destroy()
  }
  up.on('error', close)
  socket.on('error', close)
})

server.listen(Number(httpsPort), '0.0.0.0')

const SETUP_PAGE = (host) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Perpay · Loupe setup</title>
<style>
  body{margin:0;font:16px/1.45 -apple-system,system-ui,sans-serif;background:#f1f5f8;color:#1c3f61;padding:28px 22px}
  h1{font-size:22px;margin:0 0 6px} p{margin:0 0 18px;color:#4a6177}
  ol{padding-left:20px;margin:0 0 24px} li{margin-bottom:10px}
  a.btn{display:block;text-align:center;padding:15px;border-radius:999px;background:#2c73eb;color:#fff;font-weight:600;text-decoration:none;margin-bottom:12px}
  a.ghost{background:#222}
</style></head><body>
<h1>One-time iPhone setup</h1>
<p>Lets the Perpay app use HTTPS on your Wi-Fi, so the camera can scan Loupe.</p>
<ol>
  <li>Tap <b>Download certificate</b>, then <b>Allow</b>.</li>
  <li>Settings → <b>Profile Downloaded</b> → Install.</li>
  <li>Settings → General → About → <b>Certificate Trust Settings</b> → turn on the mkcert certificate.</li>
</ol>
<a class="btn" href="/loupe-ca.pem">Download certificate</a>
<a class="btn ghost" href="https://${host}:${httpsPort}/">Open the Perpay app</a>
</body></html>`

http
  .createServer((req, res) => {
    if (req.url === '/loupe-ca.pem') {
      res.writeHead(200, {
        'content-type': 'application/x-x509-ca-cert',
        'content-disposition': 'attachment; filename="loupe-dev-ca.pem"',
      })
      res.end(readFileSync(caFile))
      return
    }
    const host = (req.headers.host ?? 'localhost').split(':')[0]
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(SETUP_PAGE(host))
  })
  .listen(Number(setupPort), '0.0.0.0')
