import { getCredentials } from './config.js'
import { PlexError, plexHeaders } from './plexAuth.js'

const DEFAULT_TIMEOUT = 15000
const IMAGE_PREFIXES = ['/library/', '/:/resources/', '/photo/', '/system/']

function requireCredentials() {
  const credentials = getCredentials()
  if (!credentials.token || !credentials.server?.uri) {
    throw new PlexError(
      'Nocturne is not connected to Plex yet. Open Settings and sign in to your Plex account.',
      { status: 503, code: 'NOT_CONFIGURED' },
    )
  }
  return credentials
}

function buildUrl(base, pathname, query = {}) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.includes('..')) {
    throw new PlexError('Invalid Plex API path.', { status: 500, code: 'BAD_PLEX_PATH' })
  }

  const url = new URL(`${base.replace(/\/+$/, '')}${pathname}`)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url
}

async function parseResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new PlexError('Plex returned an unexpected response.', {
      status: 502,
      code: 'PLEX_BAD_RESPONSE',
      detail: text.slice(0, 180),
    })
  }
}

async function plexRequest(pathname, { query = {}, timeout = DEFAULT_TIMEOUT, accept = 'application/json' } = {}) {
  const { token, server, clientIdentifier } = requireCredentials()
  const url = buildUrl(server.uri, pathname, query)

  let response
  try {
    response = await fetch(url, {
      headers: {
        ...plexHeaders(clientIdentifier, token),
        Accept: accept,
      },
      signal: AbortSignal.timeout(timeout),
    })
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError'
    throw new PlexError(
      isTimeout
        ? 'Plex Media Server took too long to respond. It may be scanning or restarting.'
        : 'Nocturne could not reach Plex Media Server. Check that Plex is running, then try again.',
      { status: 502, code: 'PLEX_UNREACHABLE', detail: error.message },
    )
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PlexError(
        'Plex rejected the saved connection. Reconnect your Plex account in Settings.',
        { status: 401, code: 'PLEX_UNAUTHORIZED' },
      )
    }
    if (response.status === 404) {
      throw new PlexError('That item is no longer in your Plex library.', {
        status: 404,
        code: 'PLEX_NOT_FOUND',
      })
    }
    throw new PlexError(`Plex returned HTTP ${response.status}.`, {
      status: 502,
      code: 'PLEX_HTTP_ERROR',
      detail: url.pathname,
    })
  }

  return parseResponse(response)
}

export async function getLibraries() {
  const data = await plexRequest('/library/sections')
  const directories = data?.MediaContainer?.Directory || []
  return (Array.isArray(directories) ? directories : []).map((section) => ({
    key: String(section.key),
    title: section.title || 'Library',
    type: section.type,
    agent: section.agent || null,
    thumb: section.thumb || null,
    art: section.art || null,
  }))
}

export async function getLibrarySection(sectionKey) {
  const libraries = await getLibraries()
  return libraries.find((library) => library.key === String(sectionKey)) || null
}

export async function getSectionItems(sectionKey, { sort, genre, start = 0, size = 24 } = {}) {
  const query = {
    'X-Plex-Container-Start': Math.max(0, Number(start) || 0),
    'X-Plex-Container-Size': Math.min(200, Math.max(1, Number(size) || 24)),
  }
  if (sort) query.sort = sort
  if (genre) query.genre = genre

  const data = await plexRequest(`/library/sections/${sectionKey}/all`, { query })
  return data?.MediaContainer || {}
}

export async function getSectionGenres(sectionKey) {
  const data = await plexRequest(`/library/sections/${sectionKey}/genre`, {
    query: { 'X-Plex-Container-Size': 40 },
  })
  const directories = data?.MediaContainer?.Directory || []
  return (Array.isArray(directories) ? directories : [])
    .filter((genre) => genre.key && genre.title)
    .map((genre) => ({
      key: String(genre.key),
      title: genre.title,
      count: Number(genre.count) || 0,
    }))
}

export async function getMetadata(ratingKey) {
  const data = await plexRequest(`/library/metadata/${ratingKey}`, {
    query: { includeGuids: 1, includeExtras: 0, includeMarkers: 1 },
  })
  return data?.MediaContainer?.Metadata?.[0] || null
}

export async function getMarkers(ratingKey) {
  try {
    const data = await plexRequest(`/library/metadata/${ratingKey}/markers`)
    const markers = data?.MediaContainer?.Marker
    return Array.isArray(markers) ? markers : []
  } catch {
    return []
  }
}

function looksLikeWebVtt(text) {
  return /^\uFEFF?WEBVTT/.test(text.trimStart())
}

function srtToWebVtt(text) {
  const body = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^\d+\s*\n(?=\d{1,2}:\d{2}:\d{2}[,.])/gm, '')
    .replace(
      /^(\d{1,2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{1,2}:\d{2}:\d{2}),(\d{3})/gm,
      '$1.$2 --> $3.$4',
    )

  return `WEBVTT\n\n${body.trim()}\n`
}

export async function fetchSubtitleVtt(streamId) {
  if (!/^\d+$/.test(String(streamId))) {
    throw new PlexError('That subtitle track has an invalid Plex identifier.', {
      status: 400,
      code: 'BAD_SUBTITLE_ID',
    })
  }

  const { token, server, clientIdentifier } = requireCredentials()
  const headers = { ...plexHeaders(clientIdentifier, token), Accept: 'text/vtt, text/plain, */*' }
  let reachedPlex = false

  // Plex can convert text tracks to WebVTT with the .vtt suffix. If an older
  // server does not, the raw /library/streams/:id endpoint usually returns SRT,
  // which Nocturne converts itself.
  for (const pathname of [`/library/streams/${streamId}.vtt`, `/library/streams/${streamId}`]) {
    let response
    try {
      response = await fetch(buildUrl(server.uri, pathname), {
        headers,
        signal: AbortSignal.timeout(20000),
      })
    } catch {
      continue
    }

    reachedPlex = true
    if (!response.ok) continue

    const text = await response.text()
    if (!text.trim()) continue
    if (looksLikeWebVtt(text)) return text
    if (/^\d{1,2}:\d{2}:\d{2},\d{3}\s+-->/.test(text.replace(/^\uFEFF/, '').trim())) {
      return srtToWebVtt(text)
    }
  }

  if (!reachedPlex) {
    throw new PlexError('Plex did not answer when Nocturne asked for this subtitle track.', {
      status: 502,
      code: 'SUBTITLE_UNREACHABLE',
    })
  }

  throw new PlexError(
    'Plex returned this subtitle in a format the browser cannot display. Switch to burn-in for this track.',
    { status: 415, code: 'SUBTITLE_FORMAT_UNSUPPORTED' },
  )
}

export async function getChildren(ratingKey) {
  const data = await plexRequest(`/library/metadata/${ratingKey}/children`, {
    query: { 'X-Plex-Container-Size': 100 },
  })
  return data?.MediaContainer?.Metadata || []
}

export async function getSimilar(ratingKey) {
  try {
    const data = await plexRequest(`/library/metadata/${ratingKey}/similar`, {
      query: { 'X-Plex-Container-Size': 18 },
    })
    return data?.MediaContainer?.Metadata || []
  } catch {
    return []
  }
}

export async function getOnDeck(size = 20) {
  const data = await plexRequest('/library/onDeck', {
    query: { 'X-Plex-Container-Size': size },
  })
  return data?.MediaContainer?.Metadata || []
}

export async function getRecentlyAdded(size = 30) {
  const data = await plexRequest('/library/recentlyAdded', {
    query: { 'X-Plex-Container-Size': size },
  })
  return data?.MediaContainer?.Metadata || []
}

export async function searchPlex(queryText) {
  const data = await plexRequest('/hubs/search', {
    query: {
      query: queryText,
      limit: 24,
      includeCollections: 0,
      includeExternalMedia: 0,
    },
  })
  return data?.MediaContainer?.Hub || []
}

export async function probePlexServer() {
  const { token, server, clientIdentifier } = requireCredentials()
  let response
  try {
    response = await fetch(`${server.uri}/library/sections`, {
      headers: plexHeaders(clientIdentifier, token),
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    return { reachable: false, unauthorized: false }
  }

  if (response.status === 401 || response.status === 403) {
    return { reachable: false, unauthorized: true }
  }
  if (!response.ok) return { reachable: false, unauthorized: false }

  return { reachable: true, unauthorized: false }
}

async function resolveMachineIdentifier() {
  const { token, server, clientIdentifier } = requireCredentials()
  if (server.machineIdentifier) return server.machineIdentifier

  let response
  try {
    response = await fetch(`${server.uri}/identity`, {
      headers: plexHeaders(clientIdentifier, token),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    throw new PlexError('Nocturne could not ask Plex for its server identifier.', {
      status: 502,
      code: 'PLEX_UNREACHABLE',
    })
  }

  if (!response.ok) {
    throw new PlexError('Plex would not provide its server identifier.', {
      status: 502,
      code: 'NO_MACHINE_ID',
    })
  }

  const data = await parseResponse(response)
  const machineIdentifier = data?.MediaContainer?.machineIdentifier
  if (!machineIdentifier) {
    throw new PlexError(
      'Nocturne does not know this Plex server’s identifier. Reconnect in Settings.',
      { status: 503, code: 'NO_MACHINE_ID' },
    )
  }
  return machineIdentifier
}

export async function plexWebUrl(ratingKey) {
  const { server } = requireCredentials()
  const base = (process.env.PLEX_WEB_BASE_URL || `${server.uri}/web`).replace(/\/+$/, '')
  const machineIdentifier = await resolveMachineIdentifier()
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`)
  return `${base}/#!/server/${encodeURIComponent(machineIdentifier)}/details?key=${key}`
}

function safeImagePath(value) {
  if (typeof value !== 'string' || value.length > 2048) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return null
  if (value.includes('?') || value.includes('#')) return null
  if (!IMAGE_PREFIXES.some((prefix) => value.startsWith(prefix))) return null
  return value
}

export async function fetchPlexImage(imagePath, { width, height } = {}) {
  const safePath = safeImagePath(imagePath)
  if (!safePath) {
    throw new PlexError('Invalid Plex artwork path.', { status: 400, code: 'BAD_IMAGE_PATH' })
  }

  const { token, server, clientIdentifier } = requireCredentials()
  const headers = plexHeaders(clientIdentifier, token)
  const w = Math.min(2400, Math.max(80, Number(width) || 600))
  const h = Math.min(2400, Math.max(80, Number(height) || 900))

  const transcodeUrl = buildUrl(server.uri, '/photo/:/transcode', {
    width: w,
    height: h,
    minSize: 1,
    upscale: 1,
    url: safePath,
  })

  const attempt = async (url) => {
    const response = await fetch(url, {
      headers: { ...headers, Accept: 'image/*' },
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    })
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return null
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > 25 * 1024 * 1024) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length || buffer.length > 25 * 1024 * 1024) return null
    return { buffer, contentType }
  }

  try {
    const transcoded = await attempt(transcodeUrl)
    if (transcoded) return transcoded
  } catch {
    // Some Plex versions do not have the photo transcoder enabled. Try the original.
  }

  try {
    const original = await attempt(buildUrl(server.uri, safePath))
    if (original) return original
  } catch {
    // Fall through to the friendly error below.
  }

  throw new PlexError('This artwork is not available from Plex.', {
    status: 404,
    code: 'IMAGE_NOT_FOUND',
  })
}
