import express from 'express'
import {
  childrenFor,
  genres,
  getArtSubject,
  metadataFor,
  onDeck,
  recentlyAdded,
  search,
  sectionRaws,
  sections,
  similarFor,
} from './data.js'
import { renderArt } from './art.js'

const PORT = Number(process.env.MOCK_PLEX_PORT) || 32499
const TOKEN = 'mock-plex-token-1234567890'
const MACHINE_ID = 'mock-machine-nocturne-001'
const app = express()
const pins = new Map()
let nextPin = 4000

app.disable('x-powered-by')

function authorize(req, res, next) {
  if (req.get('X-Plex-Token') !== TOKEN) {
    res.status(401).json({ error: 'Mock Plex token is missing or invalid.' })
    return
  }
  next()
}

function container(req, items, extra = {}) {
  const start = Math.max(0, Number(req.query['X-Plex-Container-Start']) || 0)
  const requested = Number(req.query['X-Plex-Container-Size']) || items.length
  const size = Math.min(200, Math.max(1, requested))
  const page = items.slice(start, start + size)
  return {
    MediaContainer: {
      size: page.length,
      totalSize: items.length,
      offset: start,
      ...extra,
      Metadata: page,
    },
  }
}

function sortItems(items, sort) {
  if (!sort) return items
  const [field, direction = 'asc'] = String(sort).split(':')
  const multiplier = direction === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    const left = a[field]
    const right = b[field]
    if (typeof left === 'string' || typeof right === 'string') {
      return String(left || '').localeCompare(String(right || '')) * multiplier
    }
    return ((Number(left) || 0) - (Number(right) || 0)) * multiplier
  })
}

app.get('/identity', (req, res) => {
  res.json({
    MediaContainer: {
      size: 0,
      machineIdentifier: MACHINE_ID,
      version: '1.41.0-mock+build',
    },
  })
})

app.get('/', (req, res) => {
  res.json({
    MediaContainer: {
      size: 0,
      friendlyName: 'Nocturne Test Plex',
      machineIdentifier: MACHINE_ID,
      version: '1.41.0-mock+build',
      platform: 'Linux',
    },
  })
})

app.get('/library/sections', authorize, (req, res) => {
  res.json({
    MediaContainer: {
      size: sections.length,
      Directory: sections.map((section) => ({
        ...section,
        art: `/:/resources/${section.type}-fanart.jpg`,
        thumb: `/:/resources/${section.type}.png`,
        refreshing: 0,
        updatedAt: Math.floor(Date.now() / 1000),
      })),
    },
  })
})

app.get('/library/sections/:key/genre', authorize, (req, res) => {
  res.json({
    MediaContainer: {
      size: genres.length,
      Directory: genres.map((genre) => ({
        key: genre.key,
        title: genre.title,
        count: sectionRaws(req.params.key).filter((item) =>
          (item.Genre || []).some((tag) => tag.tag === genre.title)).length,
      })),
    },
  })
})

app.get('/library/sections/:key/all', authorize, (req, res) => {
  let items = sectionRaws(req.params.key)
  const genreId = req.query.genre
  if (genreId) {
    const genre = genres.find((entry) => entry.key === String(genreId))
    if (genre) {
      items = items.filter((item) =>
        (item.Genre || []).some((tag) => tag.tag === genre.title))
    }
  }
  items = sortItems(items, req.query.sort)
  res.json(container(req, items, {
    librarySectionID: Number(req.params.key),
    viewGroup: req.params.key === '1' ? 'movie' : 'show',
  }))
})

app.get('/library/onDeck', authorize, (req, res) => {
  res.json(container(req, onDeck))
})

app.get('/library/recentlyAdded', authorize, (req, res) => {
  res.json(container(req, recentlyAdded))
})

app.get('/library/metadata/:key/similar', authorize, (req, res) => {
  res.json(container(req, similarFor(req.params.key)))
})

app.get('/library/metadata/:key/children', authorize, (req, res) => {
  res.json(container(req, childrenFor(req.params.key)))
})

app.get('/library/metadata/:key', authorize, (req, res) => {
  const metadata = metadataFor(req.params.key)
  if (!metadata) {
    res.status(404).json({ error: 'Mock item not found.' })
    return
  }
  res.json({
    MediaContainer: {
      size: 1,
      Metadata: [metadata],
    },
  })
})

app.get('/hubs/search', authorize, (req, res) => {
  const query = String(req.query.query || '').trim()
  const { movieHits, showHits, episodeHits } = search(query)
  res.json({
    MediaContainer: {
      size: 0,
      Hub: [
        { type: 'movie', title: 'Movies', size: movieHits.length, Metadata: movieHits.slice(0, 12) },
        {
          type: 'show',
          title: 'TV Shows',
          size: showHits.length + episodeHits.length,
          Metadata: [...showHits, ...episodeHits].slice(0, 20),
        },
      ],
    },
  })
})

app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.startsWith('/photo/:/transcode')) {
    if (req.get('X-Plex-Token') !== TOKEN) {
      res.status(401).end()
      return
    }
    const imagePath = String(req.query.url || '')
    const match = imagePath.match(/\/library\/metadata\/(\d+)\/(thumb|art)/)
    if (!match) {
      res.status(404).end()
      return
    }
    const subject = getArtSubject(match[1])
    const still = subject?.kind === 'episode' && match[2] === 'thumb'
    const kind = still ? 'still' : match[2] === 'art' ? 'backdrop' : 'poster'
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(renderArt(subject, kind))
    return
  }
  next()
})

app.post('/tv/api/v2/pins', (req, res) => {
  const id = nextPin
  nextPin += 1
  const pin = {
    id,
    code: `N${String(id).slice(-2)}VA`,
    createdAt: Date.now(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  }
  pins.set(String(id), pin)
  res.status(201).json({
    id: pin.id,
    code: pin.code,
    expiresAt: pin.expiresAt,
    authToken: null,
  })
})

app.get('/tv/api/v2/pins/:id', (req, res) => {
  const pin = pins.get(String(req.params.id))
  if (!pin) {
    res.status(404).json({ error: 'Mock PIN not found.' })
    return
  }
  const signedIn = Date.now() - pin.createdAt > 1600
  res.json({
    id: pin.id,
    code: pin.code,
    expiresAt: pin.expiresAt,
    authToken: signedIn ? TOKEN : null,
  })
})

app.get('/tv/api/v2/resources', authorize, (req, res) => {
  res.json([
    {
      name: 'Nocturne Test Plex',
      product: 'Plex Media Server',
      productVersion: '1.41.0-mock',
      platform: 'Linux',
      provides: 'server',
      clientIdentifier: MACHINE_ID,
      owned: true,
      connections: [
        {
          protocol: 'http',
          address: '127.0.0.1',
          port: PORT,
          uri: `http://127.0.0.1:${PORT}`,
          local: true,
          relay: false,
        },
      ],
    },
  ])
})

app.get('/tv/api/v2/user', authorize, (req, res) => {
  res.json({ username: 'nocturne_tester', title: 'Nocturne Tester' })
})

app.use((req, res) => {
  res.status(404).json({ error: `Mock route not found: ${req.method} ${req.path}` })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-plex] Mock Plex + plex.tv listening at http://127.0.0.1:${PORT}`)
  console.log(`[mock-plex] Plex token: ${TOKEN}`)
  console.log(`[mock-plex] plex.tv base: http://127.0.0.1:${PORT}/tv`)
})
