import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { cached, invalidateCache } from './cache.js'
import {
  clearConnection,
  getCredentials,
  getPaths,
  getPublicStatus,
  normalizeServerUrl,
  readConfig,
  updateConfig,
} from './config.js'
import {
  buildHome,
  buildLibraryPage,
  buildSearch,
  buildSeasonEpisodes,
  buildTitlePage,
} from './nova.js'
import { fetchPlexImage, getLibraries, plexWebUrl, probePlexServer } from './plex.js'
import { PlexError, checkPin, createPin, discoverPlexServer } from './plexAuth.js'

const app = express()
const PORT = Number(process.env.PORT) || 8787
const HOST = process.env.HOST || '127.0.0.1'
const paths = getPaths()
const { distDir } = paths

app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})

const allowedOrigins = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  'http://127.0.0.1:5173',
  'http://localhost:5173',
])

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next()
    return
  }

  const origin = req.get('Origin')
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({
      error: {
        message: 'NOVA rejected a cross-origin request.',
        code: 'CROSS_ORIGIN_BLOCKED',
      },
    })
    return
  }

  if (req.get('Sec-Fetch-Site') === 'cross-site') {
    res.status(403).json({
      error: {
        message: 'NOVA rejected a cross-site request.',
        code: 'CROSS_SITE_BLOCKED',
      },
    })
    return
  }

  next()
})

function requireConfigured() {
  const status = getPublicStatus()
  if (!status.configured) {
    throw new PlexError(
      'NOVA is not connected to Plex yet. Sign in on the setup screen first.',
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
      connectionError = 'NOVA could not verify the Plex connection. Try again in a moment.'
    }
  }

  res.json({
    product: 'NOVA',
    ...status,
    reachable,
    authError,
    connectionError,
  })
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
    throw new PlexError('That library is not available in NOVA.', {
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
      'This connection comes from .env, so NOVA cannot rediscover it automatically. Update PLEX_URL in .env.',
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

app.get('/api/play/:key', async (req, res) => {
  requireConfigured()
  const url = await plexWebUrl(ratingKey(req.params.key))
  res.setHeader('Cache-Control', 'no-store')
  res.redirect(302, url)
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: { message: 'That NOVA API route does not exist.' } })
})

const indexFile = path.join(distDir, 'index.html')
if (fs.existsSync(indexFile)) {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
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
      'NOVA API is running.\n\nStart the dev UI with: npm run dev\nThen open http://127.0.0.1:5173',
    )
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)

  const status = error instanceof PlexError ? error.status : 500
  if (!(error instanceof PlexError)) {
    console.error('[NOVA] Unexpected server error:', error?.message || error)
  }

  res.status(status).json({
    error: {
      message: error.message || 'Something went wrong inside NOVA.',
      code: error.code || 'INTERNAL_ERROR',
      detail: error.detail || null,
      attempts: error.attempts || null,
    },
  })
})

app.listen(PORT, HOST, () => {
  console.log(`\n  NOVA API ready at http://${HOST}:${PORT}`)
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn('  Warning: the NOVA API is not bound to this PC only. Keep HOST=127.0.0.1 for local use.')
  }
  if (fs.existsSync(indexFile)) {
    console.log(`  Built NOVA app available at http://${HOST}:${PORT}`)
  } else {
    console.log('  Development UI: run npm run dev, then open http://127.0.0.1:5173')
  }
})
