import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { cached, invalidateCache } from './cache.js'
import {
  clearConnection,
  getCredentials,
  getInstallInfo,
  getPaths,
  getPublicStatus,
  isLanEnabled,
  normalizeServerUrl,
  readConfig,
  setLanEnabled,
  updateConfig,
} from './config.js'
import {
  buildAllTitlesPage,
  buildHome,
  buildLibraryPage,
  buildSearch,
  buildSeasonEpisodes,
  buildTitlePage,
} from './nocturne.js'
import { fetchPlexImage, getLibraries, plexWebUrl, probePlexServer } from './plex.js'
import { PlexError, checkPin, createPin, discoverPlexServer } from './plexAuth.js'
import { getUpdateInfo, installUpdate, setUpdateSource } from './update.js'
import {
  progressPlayback,
  startPlayback,
  stopPlayback,
  streamDirect,
  streamHls,
  streamMaster,
  streamSubtitle,
} from './player.js'

const app = express()
const PORT = Number(process.env.PORT) || 8787
// Listening on all interfaces lets the same server answer LAN devices. A
// separate private-network gate below keeps it closed until the owner turns
// LAN access on in Settings.
const HOST = process.env.HOST || '0.0.0.0'
const CONTROL_PORT = Number(process.env.NOCTURNE_CONTROL_PORT) || (PORT + 1)
const CONTROL_MANAGED = process.env.NOCTURNE_MANAGED === '1'
const CONTROL_URL = `http://127.0.0.1:${CONTROL_PORT}`
const paths = getPaths()
const { distDir } = paths

app.disable('x-powered-by')

function normalizeAddress(value) {
  const address = String(value || '').trim().toLowerCase()
  return address.startsWith('::ffff:') ? address.slice(7) : address
}

function clientAddress(req) {
  return normalizeAddress(req.socket?.remoteAddress || req.ip || '')
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === 'localhost'
}

function isPrivateAddress(address) {
  if (isLoopback(address)) return true

  if (/^f[cd][0-9a-f]{2}:/.test(address) || /^fe[89ab][0-9a-f]:/.test(address)) {
    return true
  }

  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 169 && parts[1] === 254)
}

function networkInterfaceEntries() {
  return Object.values(os.networkInterfaces())
    .flatMap((group) => group || [])
    .filter((entry) => entry && !entry.internal)
}

function isLocalMachineAddress(address) {
  if (isLoopback(address)) return true
  return networkInterfaceEntries().some(
    (entry) => normalizeAddress(entry.address) === normalizeAddress(address),
  )
}

function lanUrls() {
  if (!['0.0.0.0', '::', '[::]'].includes(HOST)) return []
  const urls = new Set()

  for (const entry of networkInterfaceEntries()) {
    const family = typeof entry.family === 'string' ? entry.family : String(entry.family)
    if (family !== 'IPv4' && family !== '4') continue
    urls.add(`http://${entry.address}:${PORT}`)
  }

  return [...urls]
}

const allowedOrigins = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

const lanBlockedPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nocturne is not shared</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07060b;color:#f4f1ff;font:16px/1.5 system-ui,sans-serif">
<main style="max-width:32rem;padding:2rem"><p style="color:#b9a8e8;font-size:.75rem;letter-spacing:.18em;text-transform:uppercase">Nocturne</p>
<h1 style="letter-spacing:-.04em">This device is not allowed in yet.</h1>
<p style="color:#b9b3c8">LAN access is turned off. Open Nocturne on the PC running the server, go to Settings, and enable <strong>Watch from another screen</strong>.</p>
</main></body></html>`

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})

// This gate runs before body parsing and before every route. Loopback is
// always trusted. Other devices must be on a private LAN and the owner must
// have switched LAN access on; public addresses are never accepted.
app.use((req, res, next) => {
  const address = clientAddress(req)
  if (isLoopback(address)) {
    next()
    return
  }

  const lanEnabled = isLanEnabled()
  if (!isPrivateAddress(address) || !lanEnabled) {
    const message = !isPrivateAddress(address)
      ? 'Nocturne only accepts connections from your local network.'
      : 'LAN access is off. Enable it in Nocturne Settings on the PC running the server.'

    if (req.path.startsWith('/api/')) {
      res.status(403).json({ error: { message, code: 'LAN_ACCESS_BLOCKED' } })
      return
    }

    res.status(403).type('html').send(lanBlockedPage)
    return
  }

  next()
})

app.use(express.json({ limit: '16kb' }))

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next()
    return
  }

  const localOnlyWrites = new Set([
    '/api/auth/pin',
    '/api/auth/manual',
    '/api/auth/rediscover',
    '/api/auth/disconnect',
    '/api/network/lan',
    '/api/system/stop',
    '/api/system/restart',
    '/api/update/source',
    '/api/update/install',
  ])
  const requestPath = String(req.originalUrl || req.url).split('?')[0]
  if (localOnlyWrites.has(requestPath) && !isLocalMachineAddress(clientAddress(req))) {
    res.status(403).json({
      error: {
        message: 'Change the Plex connection and network settings on the PC that runs Nocturne.',
        code: 'SETTINGS_LOCAL_ONLY',
      },
    })
    return
  }

  const origin = req.get('Origin')
  if (origin) {
    const ownOrigin = `${req.protocol}://${req.get('host')}`
    const lanOrigin = isLanEnabled()
      && isPrivateAddress(clientAddress(req))
      && origin === ownOrigin

    if (!allowedOrigins.has(origin) && !lanOrigin) {
      res.status(403).json({
        error: {
          message: 'Nocturne rejected a cross-origin request.',
          code: 'CROSS_ORIGIN_BLOCKED',
        },
      })
      return
    }
  }

  if (req.get('Sec-Fetch-Site') === 'cross-site') {
    res.status(403).json({
      error: {
        message: 'Nocturne rejected a cross-site request.',
        code: 'CROSS_SITE_BLOCKED',
      },
    })
    return
  }

  next()
})

function controlInfo() {
  return {
    available: CONTROL_MANAGED,
    port: CONTROL_PORT,
    url: CONTROL_MANAGED ? CONTROL_URL : null,
  }
}

function requireControlAvailable() {
  if (!CONTROL_MANAGED) {
    throw new PlexError(
      'Server controls are available in the installed Nocturne app. Start Nocturne from its desktop shortcut.',
      { status: 409, code: 'SERVER_CONTROLS_UNAVAILABLE' },
    )
  }
}

async function requestControl(action) {
  if (!CONTROL_MANAGED) {
    throw new PlexError(
      'Server controls are available in the installed Nocturne app. Start Nocturne from its desktop shortcut.',
      { status: 409, code: 'SERVER_CONTROLS_UNAVAILABLE' },
    )
  }

  let response
  try {
    response = await fetch(`${CONTROL_URL}/api/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nocturne-Control': '1',
      },
      body: '{}',
      signal: AbortSignal.timeout(35_000),
    })
  } catch (error) {
    throw new PlexError(
      'Nocturne could not reach its local server control page.',
      { status: 502, code: 'CONTROL_UNREACHABLE', detail: error.message },
    )
  }

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new PlexError(
      payload?.error || 'The local server control page refused that action.',
      { status: 502, code: 'CONTROL_ACTION_FAILED' },
    )
  }

  return payload
}

function requireLocalClient(req) {
  if (!isLocalMachineAddress(clientAddress(req))) {
    throw new PlexError(
      'Start, stop, and restart the server on the PC that runs Nocturne.',
      { status: 403, code: 'SERVER_CONTROL_LOCAL_ONLY' },
    )
  }
}

function requireConfigured() {
  const status = getPublicStatus()
  if (!status.configured) {
    throw new PlexError(
      'Nocturne is not connected to Plex yet. Sign in on the setup screen first.',
      { status: 503, code: 'NOT_CONFIGURED' },
    )
  }
  return status
}

function ratingKey(value) {
  if (!/^\d+$/.test(String(value))) {
    throw new PlexError('That media item has an invalid Plex identifier.', {
      status: 400,
      code: 'BAD_RATING_KEY',
    })
  }
  return String(value)
}

function sectionKey(value) {
  if (!/^\d+$/.test(String(value))) {
    throw new PlexError('That Plex library has an invalid identifier.', {
      status: 400,
      code: 'BAD_SECTION_KEY',
    })
  }
  return String(value)
}

function playbackId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value))) {
    throw new PlexError('That playback session is not valid.', {
      status: 400,
      code: 'BAD_PLAYBACK_SESSION',
    })
  }
  return String(value)
}

app.get('/api/health', async (req, res) => {
  const status = getPublicStatus()
  let reachable = false
  let authError = false
  let connectionError = null

  if (status.configured) {
    try {
      const result = await probePlexServer()
      reachable = result.reachable
      authError = result.unauthorized
      if (authError) {
        connectionError = 'Plex rejected the saved token. Sign in to Plex again to reconnect.'
      } else if (!reachable) {
        connectionError = 'Plex Media Server did not answer. Check that it is running.'
      }
    } catch {
      connectionError = 'Nocturne could not verify the Plex connection. Try again in a moment.'
    }
  }

  res.json({
    product: 'Nocturne',
    ...status,
    install: getInstallInfo(),
    network: {
      lanEnabled: isLanEnabled(),
      boundHost: HOST,
      urls: lanUrls(),
      localClient: isLocalMachineAddress(clientAddress(req)),
    },
    control: controlInfo(),
    reachable,
    authError,
    connectionError,
  })
})

app.post('/api/network/lan', (req, res) => {
  if (!isLocalMachineAddress(clientAddress(req))) {
    throw new PlexError(
      'Change network access on the PC that runs Nocturne, using its local address.',
      { status: 403, code: 'LAN_SETTING_LOCAL_ONLY' },
    )
  }
  if (typeof req.body?.enabled !== 'boolean') {
    throw new PlexError('Choose whether LAN access should be on or off.', {
      status: 400,
      code: 'BAD_LAN_SETTING',
    })
  }

  setLanEnabled(req.body.enabled)
  res.json({
    network: {
      lanEnabled: isLanEnabled(),
      boundHost: HOST,
      urls: lanUrls(),
    },
  })
})

app.post('/api/system/stop', (req, res) => {
  requireLocalClient(req)
  requireControlAvailable()

  res.json({ ok: true, controlUrl: CONTROL_URL })
  res.on('finish', () => {
    setTimeout(() => {
      requestControl('stop').catch((error) => {
        console.warn('[Nocturne] Could not stop the local server:', error.message)
      })
    }, 250)
  })
})

app.post('/api/system/restart', (req, res) => {
  requireLocalClient(req)
  requireControlAvailable()

  res.json({ ok: true, controlUrl: CONTROL_URL })
  res.on('finish', () => {
    setTimeout(() => {
      requestControl('restart').catch((error) => {
        console.warn('[Nocturne] Could not restart the local server:', error.message)
      })
    }, 250)
  })
})

app.get('/api/update', (req, res) => {
  res.json(getUpdateInfo())
})

app.post('/api/update/source', (req, res) => {
  requireLocalClient(req)
  const sourceUrl = setUpdateSource(typeof req.body?.url === 'string' ? req.body.url : null)
  res.json({ source: { url: sourceUrl, configured: Boolean(sourceUrl) } })
})

// An update package is a ZIP archive, not JSON, so this route reads the raw
// body instead of going through the small JSON parser used elsewhere.
const updatePackageBody = express.raw({
  type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  limit: '512mb',
})

app.post('/api/update/install', updatePackageBody, async (req, res) => {
  requireLocalClient(req)

  const upload = Buffer.isBuffer(req.body) && req.body.length ? req.body : null
  const url = !upload && typeof req.body?.url === 'string' ? req.body.url : null
  const result = await installUpdate({ buffer: upload, url })

  // The installed app runs under the control server, which restarts the app on
  // the new files. Source mode has no supervisor, so it asks for a restart
  // instead of silently serving the old code.
  const restarting = CONTROL_MANAGED
  res.json({
    ok: true,
    ...result,
    restarting,
    controlUrl: restarting ? CONTROL_URL : null,
  })

  if (restarting) {
    res.on('finish', () => {
      setTimeout(() => {
        requestControl('restart').catch((error) => {
          console.warn('[Nocturne] Could not restart after the update:', error.message)
        })
      }, 400)
    })
  }
})

app.get('/api/libraries', async (req, res) => {
  requireConfigured()
  const { server, clientIdentifier } = getCredentials()
  const libraries = await cached(`libraries:${clientIdentifier}:${server.uri}`, 30_000, getLibraries)
  res.json({
    libraries: libraries.filter((library) => ['movie', 'show'].includes(library.type)),
  })
})

app.get('/api/home', async (req, res) => {
  const status = requireConfigured()
  const refresh = req.query.refresh === '1'
  if (refresh) invalidateCache()

  const credentials = getCredentials()
  const key = `home:${credentials.clientIdentifier}:${credentials.server.uri}`
  const home = refresh
    ? await buildHome()
    : await cached(key, 60_000, buildHome)

  res.json({
    ...home,
    server: status.server,
  })
})

app.get('/api/home/all', async (req, res) => {
  requireConfigured()
  const type = req.query.type === 'show' ? 'show' : 'movie'
  const sort = ['recent', 'title', 'rating', 'year', 'popular'].includes(req.query.sort)
    ? req.query.sort
    : 'recent'
  const start = Math.max(0, Number.parseInt(req.query.start, 10) || 0)
  const size = Math.min(120, Math.max(1, Number.parseInt(req.query.size, 10) || 60))
  const credentials = getCredentials()
  const cacheKey = `home-all:${credentials.server.uri}:${type}:${sort}:${start}:${size}`

  const page = await cached(cacheKey, 30_000, () =>
    buildAllTitlesPage(type, { sort, start, size }))
  res.json(page)
})

app.get('/api/library/:key', async (req, res) => {
  requireConfigured()
  const key = sectionKey(req.params.key)
  const sort = ['recent', 'title', 'rating', 'year', 'popular'].includes(req.query.sort)
    ? req.query.sort
    : 'recent'
  const start = Math.max(0, Number.parseInt(req.query.start, 10) || 0)
  const size = Math.min(120, Math.max(1, Number.parseInt(req.query.size, 10) || 60))
  const credentials = getCredentials()
  const cacheKey = `library:${credentials.server.uri}:${key}:${sort}:${start}:${size}`

  const page = await cached(cacheKey, 30_000, () =>
    buildLibraryPage(key, { sort, start, size }))
  if (!page) {
    throw new PlexError('That library is not available in Nocturne.', {
      status: 404,
      code: 'LIBRARY_NOT_FOUND',
    })
  }

  res.json(page)
})

app.get('/api/search', async (req, res) => {
  requireConfigured()
  const query = String(req.query.q || '').trim().slice(0, 120)
  if (query.length < 2) {
    res.json({ query, movies: [], shows: [], total: 0 })
    return
  }

  const credentials = getCredentials()
  const results = await cached(
    `search:${credentials.server.uri}:${query.toLowerCase()}`,
    15_000,
    () => buildSearch(query),
  )
  res.json(results)
})

app.get('/api/title/:key', async (req, res) => {
  requireConfigured()
  const key = ratingKey(req.params.key)
  const title = await buildTitlePage(key)
  if (!title) {
    throw new PlexError('That title is no longer in your Plex library.', {
      status: 404,
      code: 'TITLE_NOT_FOUND',
    })
  }
  res.json(title)
})

app.get('/api/season/:key', async (req, res) => {
  requireConfigured()
  const key = ratingKey(req.params.key)
  const season = await buildSeasonEpisodes(key)
  if (!season) {
    throw new PlexError('That season is no longer in your Plex library.', {
      status: 404,
      code: 'SEASON_NOT_FOUND',
    })
  }
  res.json(season)
})

app.get('/api/image', async (req, res) => {
  const imagePath = String(req.query.path || '')
  const width = Number.parseInt(req.query.w, 10) || 600
  const height = Number.parseInt(req.query.h, 10) || 900
  const image = await fetchPlexImage(imagePath, { width, height })

  res.setHeader('Content-Type', image.contentType)
  res.setHeader('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800')
  res.send(image.buffer)
})

app.post('/api/auth/pin', async (req, res) => {
  const config = readConfig()
  const pin = await createPin(config.clientIdentifier)
  res.status(201).json({ pin })
})

app.get('/api/auth/pin/:id', async (req, res) => {
  const config = readConfig()
  const result = await checkPin(config.clientIdentifier, req.params.id)
  if (result.status !== 'connected') {
    res.json({ status: result.status })
    return
  }

  const discovered = await discoverPlexServer({
    token: result.token,
    clientIdentifier: config.clientIdentifier,
  })

  updateConfig({
    token: result.token,
    server: discovered.server,
    account: discovered.account || null,
  })
  invalidateCache()

  res.json({
    status: 'connected',
    server: getPublicStatus().server,
    account: getPublicStatus().account,
  })
})

app.post('/api/auth/manual', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (token.length < 16 || token.length > 512 || /\s/.test(token)) {
    throw new PlexError('That does not look like a valid Plex token.', {
      status: 400,
      code: 'BAD_TOKEN',
    })
  }

  let serverUrl = null
  if (req.body?.serverUrl) {
    serverUrl = normalizeServerUrl(req.body.serverUrl)
  }

  const config = readConfig()
  const discovered = await discoverPlexServer({
    token,
    clientIdentifier: config.clientIdentifier,
    serverUrl,
  })

  updateConfig({
    token,
    server: discovered.server,
    account: discovered.account || null,
  })
  invalidateCache()

  res.json({
    status: 'connected',
    server: getPublicStatus().server,
    account: getPublicStatus().account,
  })
})

app.post('/api/auth/rediscover', async (req, res) => {
  requireConfigured()
  const credentials = getCredentials()
  if (credentials.source !== 'config') {
    throw new PlexError(
      'This connection comes from .env, so Nocturne cannot rediscover it automatically. Update PLEX_URL in .env.',
      { status: 400, code: 'ENV_CONNECTION' },
    )
  }

  const discovered = await discoverPlexServer({
    token: credentials.token,
    clientIdentifier: credentials.clientIdentifier,
    serverUrl: credentials.server?.uri,
  })
  updateConfig({
    server: discovered.server,
    account: discovered.account || readConfig().account || null,
  })
  invalidateCache()
  res.json({ status: 'connected', server: getPublicStatus().server })
})

app.post('/api/auth/disconnect', (req, res) => {
  clearConnection()
  invalidateCache()
  res.json({ status: 'disconnected', ...getPublicStatus() })
})

app.post('/api/player', async (req, res) => {
  requireConfigured()
  const key = ratingKey(req.body?.ratingKey)
  const offsetMs = Math.max(0, Math.min(Number(req.body?.offsetMs) || 0, 24 * 60 * 60 * 1000))
  const audioStreamId = /^\d+$/.test(String(req.body?.audioStreamId ?? ''))
    ? String(req.body.audioStreamId)
    : null
  const subtitleStreamId = /^\d+$/.test(String(req.body?.subtitleStreamId ?? ''))
    ? String(req.body.subtitleStreamId)
    : null
  const burnSubtitles = req.body?.burnSubtitles === true
  const session = await startPlayback(key, {
    offsetMs,
    audioStreamId,
    subtitleStreamId,
    burnSubtitles,
  })
  res.status(201).json({ session })
})

app.get('/api/player/:id/master.m3u8', async (req, res) => {
  requireConfigured()
  await streamMaster(req, res, playbackId(req.params.id))
})

app.get('/api/player/:id/hls', async (req, res) => {
  requireConfigured()
  await streamHls(req, res, playbackId(req.params.id))
})

app.get('/api/player/:id/stream', async (req, res) => {
  requireConfigured()
  await streamDirect(req, res, playbackId(req.params.id))
})

app.get('/api/player/:id/subtitles/:streamId', async (req, res) => {
  requireConfigured()
  await streamSubtitle(req, res, playbackId(req.params.id), req.params.streamId)
})

app.post('/api/player/:id/progress', async (req, res) => {
  requireConfigured()
  const result = await progressPlayback(playbackId(req.params.id), {
    timeMs: req.body?.timeMs,
    state: req.body?.state,
  })
  res.json(result)
})

app.post('/api/player/:id/stop', async (req, res) => {
  requireConfigured()
  const result = await stopPlayback(playbackId(req.params.id), {
    timeMs: req.body?.timeMs,
    completed: Boolean(req.body?.completed),
  })
  res.json(result)
})

app.get('/api/play/:key', async (req, res) => {
  requireConfigured()
  const url = await plexWebUrl(ratingKey(req.params.key))
  res.setHeader('Cache-Control', 'no-store')
  res.redirect(302, url)
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: { message: 'That Nocturne API route does not exist.' } })
})

const indexFile = path.join(distDir, 'index.html')
if (fs.existsSync(indexFile)) {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self' blob:",
    "worker-src 'self' blob:",
  ].join('; ')

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', contentSecurityPolicy)
    next()
  })

  app.use(express.static(distDir, {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store')
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  }))

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.setHeader('Cache-Control', 'no-store')
    res.sendFile(indexFile)
  })
} else {
  app.get('/', (req, res) => {
    res.type('text/plain').send(
      'Nocturne API is running.\n\nStart the dev UI with: npm run dev\nThen open http://127.0.0.1:5173',
    )
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)

  const status = error instanceof PlexError ? error.status : 500
  if (!(error instanceof PlexError)) {
    console.error('[Nocturne] Unexpected server error:', error?.message || error)
  }

  res.status(status).json({
    error: {
      message: error.message || 'Something went wrong inside Nocturne.',
      code: error.code || 'INTERNAL_ERROR',
      detail: error.detail || null,
      attempts: error.attempts || null,
    },
  })
})

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  Nocturne API ready at http://127.0.0.1:${PORT}`)
  if (HOST === '127.0.0.1' || HOST === 'localhost') {
    console.log('  This server is bound to this PC only. Remove HOST from .env to allow LAN access.')
  } else {
    console.log(`  Listening on ${HOST}; LAN access is ${isLanEnabled() ? 'on' : 'off'}. Change it in Settings.`)
  }
  if (fs.existsSync(indexFile)) {
    console.log(`  Built Nocturne app available at http://127.0.0.1:${PORT}`)
  } else {
    console.log('  Development UI: run npm run dev, then open http://127.0.0.1:5173')
  }
  if (CONTROL_MANAGED) {
    console.log(`  Server controls: ${CONTROL_URL}`)
  }
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[Nocturne] ${signal} received; closing the local server.`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
