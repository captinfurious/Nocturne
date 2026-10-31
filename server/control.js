import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true })

const APP_ENTRY = path.join(ROOT, 'server', 'index.js')
const APP_PORT = Number(process.env.PORT) || 8787
const CONTROL_PORT = Number(process.env.NOCTURNE_CONTROL_PORT) || APP_PORT + 1
const HOST = '127.0.0.1'
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const CONTROL_URL = `http://127.0.0.1:${CONTROL_PORT}`

let child = null
let starting = null
let restartRequested = false
let lastError = null

function log(message) {
  console.log(`[Nocturne control] ${message}`)
}

async function appHealthy() {
  try {
    const response = await fetch(`${APP_URL}/api/health`, {
      signal: AbortSignal.timeout(1800),
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return false
    const body = await response.json()
    return body?.product === 'Nocturne'
  } catch {
    return false
  }
}

async function waitForApp(timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await appHealthy()) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

function spawnApp() {
  if (child && child.exitCode === null) return child

  lastError = null
  const environment = {
    ...process.env,
    PORT: String(APP_PORT),
    NOCTURNE_CONTROL_PORT: String(CONTROL_PORT),
    NOCTURNE_MANAGED: '1',
  }

  child = spawn(process.execPath, [APP_ENTRY, '--nocturne-installed'], {
    cwd: ROOT,
    env: environment,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })

  child.on('error', (error) => {
    lastError = error.message
    log(`Could not start the app: ${error.message}`)
  })

  child.on('exit', (code, signal) => {
    child = null
    if (restartRequested) {
      restartRequested = false
      log('App stopped for a restart; starting it again.')
      setTimeout(() => {
        startApp().catch((error) => {
          lastError = error.message
          log(`Restart failed: ${error.message}`)
        })
      }, 350)
      return
    }
    if (code && code !== 0) {
      lastError = `The app exited with code ${code}.`
      log(lastError)
    } else {
      log(`App stopped${signal ? ` (${signal})` : ''}.`)
    }
  })

  return child
}

async function startApp() {
  if (await appHealthy()) return true
  if (starting) return starting

  starting = (async () => {
    if (!child || child.exitCode !== null) spawnApp()
    const ready = await waitForApp()
    if (!ready) {
      lastError = lastError || 'The app did not answer after 25 seconds.'
      return false
    }
    log('App is ready.')
    return true
  })()

  try {
    return await starting
  } finally {
    starting = null
  }
}

async function stopApp() {
  if (!child || child.exitCode !== null) {
    return true
  }

  const processToStop = child
  const exited = new Promise((resolve) => {
    processToStop.once('exit', resolve)
  })

  try {
    processToStop.kill('SIGTERM')
  } catch (error) {
    lastError = error.message
    log(`Could not stop the app: ${error.message}`)
    return false
  }

  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 6000))
  const result = await Promise.race([exited, timeout])
  if (result === 'timeout') {
    try {
      processToStop.kill('SIGKILL')
    } catch {
      // It may have exited between the timeout and this call.
    }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1500))])
  }

  return true
}

async function restartApp() {
  restartRequested = true
  const stopped = await stopApp()
  if (!stopped) {
    restartRequested = false
    return false
  }

  // The exit handler starts the replacement. Wait for it so the control page
  // can report a useful result instead of a permanently "restarting" state.
  if (!(await waitForApp(25_000))) {
    restartRequested = false
    lastError = lastError || 'The restarted app did not answer.'
    return false
  }
  return true
}

function status() {
  return {
    product: 'Nocturne Control',
    running: Boolean(child && child.exitCode === null),
    appUrl: APP_URL,
    controlUrl: CONTROL_URL,
    error: lastError,
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  })
  res.end(JSON.stringify(payload))
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "script-src 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  })
  res.end(html)
}

function controlPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Nocturne server</title>
<style>
  :root { color-scheme: dark; --bg: #07060b; --panel: #121019; --line: rgba(255,255,255,.12); --violet: #b58cff; --muted: #a9a2b8; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background:
    radial-gradient(70% 80% at 50% 0%, rgba(101,60,170,.28), transparent 65%), var(--bg);
    color: #f7f4ff; font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: min(100%, 560px); }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 30px; }
  .mark { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid rgba(181,140,255,.42);
    border-radius: 11px; background: rgba(181,140,255,.1); color: var(--violet); font-size: 18px; }
  .brand strong { display: block; letter-spacing: .26em; font-size: 12px; }
  .brand small { display: block; color: var(--muted); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
  .card { padding: clamp(24px, 5vw, 40px); border: 1px solid var(--line); border-radius: 22px;
    background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.018)); box-shadow: 0 28px 80px rgba(0,0,0,.34); }
  .eyebrow { margin: 0 0 10px; color: var(--violet); font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(1.7rem, 6vw, 2.4rem); line-height: 1.05; letter-spacing: -.045em; }
  .lede { margin: 14px 0 26px; color: var(--muted); }
  .status { display: flex; align-items: center; gap: 10px; padding: 13px 15px; border: 1px solid var(--line);
    border-radius: 12px; background: rgba(0,0,0,.22); font-size: 13px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #8d849d; box-shadow: 0 0 0 4px rgba(141,132,157,.12); }
  .dot.on { background: #7ee0b2; box-shadow: 0 0 0 4px rgba(126,224,178,.12); }
  .dot.off { background: #f08f9c; box-shadow: 0 0 0 4px rgba(240,143,156,.12); }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  button, .open { appearance: none; border: 1px solid transparent; border-radius: 999px; padding: 10px 17px;
    font: inherit; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; transition: .16s ease; }
  button:disabled { cursor: wait; opacity: .55; }
  .primary { background: #f5f0ff; color: #130b20; }
  .primary:hover:not(:disabled) { background: #fff; }
  .secondary { border-color: var(--line); background: rgba(255,255,255,.06); color: #f7f4ff; }
  .secondary:hover:not(:disabled) { background: rgba(255,255,255,.12); }
  .danger { border-color: rgba(240,143,156,.34); background: rgba(240,143,156,.08); color: #ffd6dc; }
  .danger:hover:not(:disabled) { background: rgba(240,143,156,.16); }
  .open[aria-disabled="true"] { opacity: .45; pointer-events: none; }
  .note { margin: 22px 0 0; padding-top: 18px; border-top: 1px solid var(--line); color: #8f879e; font-size: 12px; }
  .error { margin: 14px 0 0; color: #ffb3bd; font-size: 12px; }
  .error:empty { display: none; }
  footer { margin-top: 18px; color: #736b80; font-size: 11px; text-align: center; }
</style>
</head>
<body>
<main>
  <div class="brand">
    <span class="mark" aria-hidden="true">✦</span>
    <div><strong>NOCTURNE</strong><small>Local server</small></div>
  </div>
  <section class="card">
    <p class="eyebrow">Behind the curtain</p>
    <h1>Your server,<br>under your control.</h1>
    <p class="lede">Start, stop, or restart the Nocturne server on this PC. This page is private to this computer and is never reachable from your Wi-Fi.</p>
    <div class="status"><span class="dot" id="dot" aria-hidden="true"></span><span id="statusText">Checking server…</span></div>
    <div class="actions">
      <button class="primary" id="start" type="button">Start server</button>
      <button class="secondary" id="restart" type="button">Restart</button>
      <button class="danger" id="stop" type="button">Stop server</button>
      <a class="open secondary" id="open" href="${APP_URL}" aria-disabled="true">Open Nocturne</a>
    </div>
    <p class="error" id="error" role="alert"></p>
    <p class="note">Stopping the server does not touch Plex, your library, or your saved Plex sign-in. Use <strong>Start server</strong> here or open Nocturne again from the Start Menu.</p>
  </section>
  <footer>Nocturne control · only available on this PC</footer>
</main>
<script>
  const dot = document.getElementById('dot')
  const statusText = document.getElementById('statusText')
  const error = document.getElementById('error')
  const startButton = document.getElementById('start')
  const restartButton = document.getElementById('restart')
  const stopButton = document.getElementById('stop')
  const openLink = document.getElementById('open')
  let busy = false
  let timer = null

  function setBusy(value, label) {
    busy = value
    for (const button of [startButton, restartButton, stopButton]) button.disabled = value
    if (label) statusText.textContent = label
  }

  function render(data) {
    const running = Boolean(data.running)
    dot.className = 'dot ' + (running ? 'on' : 'off')
    statusText.textContent = running ? 'Server is running' : 'Server is stopped'
    startButton.style.display = running ? 'none' : ''
    restartButton.style.display = running ? '' : 'none'
    stopButton.style.display = running ? '' : 'none'
    openLink.setAttribute('aria-disabled', running ? 'false' : 'true')
    error.textContent = data.error || ''
  }

  async function refresh() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' })
      if (!response.ok) throw new Error('The control server did not answer.')
      render(await response.json())
    } catch (failure) {
      error.textContent = failure.message
      dot.className = 'dot off'
      statusText.textContent = 'Control server is not reachable'
    }
  }

  async function act(action, label) {
    if (busy) return
    error.textContent = ''
    setBusy(true, label)
    try {
      const response = await fetch('/api/' + action, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Nocturne-Control': '1' },
        body: '{}',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The server action failed.')
      await refresh()
    } catch (failure) {
      error.textContent = failure.message
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  startButton.addEventListener('click', () => act('start', 'Starting server…'))
  restartButton.addEventListener('click', () => act('restart', 'Restarting server…'))
  stopButton.addEventListener('click', () => act('stop', 'Stopping server…'))
  refresh()
  timer = setInterval(() => { if (!busy) refresh() }, 3000)
  window.addEventListener('pagehide', () => clearInterval(timer))
</script>
</body>
</html>`
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', CONTROL_URL)
  const origin = req.headers.origin

  if (origin) {
    const allowed = new Set([CONTROL_URL, `http://localhost:${CONTROL_PORT}`])
    if (!allowed.has(origin)) {
      sendJson(res, 403, { error: 'This control page only accepts requests from itself.' })
      return
    }
  }

  if (req.headers['sec-fetch-site'] === 'cross-site') {
    sendJson(res, 403, { error: 'Cross-site requests are not allowed.' })
    return
  }

  if (req.method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) {
    sendHtml(res, controlPage())
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/status') {
    sendJson(res, 200, status())
    return
  }

  if (req.method === 'POST' && ['/api/start', '/api/stop', '/api/restart'].includes(requestUrl.pathname)) {
    if (req.headers['x-nocturne-control'] !== '1') {
      sendJson(res, 403, { error: 'Missing the Nocturne control header.' })
      return
    }
    const contentType = String(req.headers['content-type'] || '')
    if (!contentType.toLowerCase().startsWith('application/json')) {
      sendJson(res, 415, { error: 'Control requests must use JSON.' })
      return
    }

    req.resume()

    try {
      if (requestUrl.pathname === '/api/start') {
        const started = await startApp()
        sendJson(res, started ? 200 : 500, {
          ...status(),
          error: started ? null : lastError,
        })
        return
      }

      if (requestUrl.pathname === '/api/stop') {
        const stopped = await stopApp()
        sendJson(res, stopped ? 200 : 500, {
          ...status(),
          error: stopped ? null : lastError,
        })
        return
      }

      const restarted = await restartApp()
      sendJson(res, restarted ? 200 : 500, {
        ...status(),
        error: restarted ? null : lastError,
      })
    } catch (error) {
      lastError = error.message
      log(`Control action failed: ${error.message}`)
      sendJson(res, 500, { ...status(), error: lastError })
    }
    return
  }

  sendJson(res, 404, { error: 'That control route does not exist.' })
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    log(`Control port ${CONTROL_PORT} is already in use. Close the other Nocturne process and try again.`)
  } else {
    log(`Control server failed: ${error.message}`)
  }
  process.exitCode = 1
})

server.listen(CONTROL_PORT, HOST, async () => {
  log(`Control page ready at ${CONTROL_URL}`)
  log(`Managing the app on port ${APP_PORT}`)
  const started = await startApp()
  if (!started) {
    log(lastError || 'The app did not start.')
  }
})

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  log('Stopping the control server and the app.')
  await stopApp()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
