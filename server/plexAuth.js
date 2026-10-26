const TV_BASE = (process.env.PLEX_TV_BASE_URL || 'https://plex.tv').replace(/\/+$/, '')
const PRODUCT = 'NOVA'
const VERSION = '1.0.0'

export class PlexError extends Error {
  constructor(message, { status = 502, code = 'PLEX_ERROR', detail = null } = {}) {
    super(message)
    this.name = 'PlexError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export function plexHeaders(clientIdentifier, token) {
  const headers = {
    Accept: 'application/json',
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': VERSION,
    'X-Plex-Client-Identifier': clientIdentifier,
    'X-Plex-Platform': 'Web',
    'X-Plex-Platform-Version': '1.0',
    'X-Plex-Device': 'Desktop',
    'X-Plex-Device-Name': `${PRODUCT} Web`,
  }

  if (token) headers['X-Plex-Token'] = token
  return headers
}

async function readJson(response) {
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

async function plexTvRequest(pathname, { method = 'GET', clientIdentifier, token } = {}) {
  let response
  try {
    response = await fetch(`${TV_BASE}${pathname}`, {
      method,
      headers: plexHeaders(clientIdentifier, token),
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    throw new PlexError(
      'NOVA could not reach plex.tv. Check your internet connection and try again.',
      {
        status: 502,
        code: 'PLEX_TV_UNREACHABLE',
        detail: 'Open https://app.plex.tv in Edge to confirm the internet connection, then try again.',
      },
    )
  }

  if (!response.ok) {
    throw new PlexError('Plex sign-in failed. Please try again.', {
      status: response.status === 401 ? 401 : 502,
      code: 'PLEX_TV_REQUEST_FAILED',
      detail: `plex.tv returned HTTP ${response.status}`,
    })
  }

  return readJson(response)
}

export async function createPin(clientIdentifier) {
  const pin = await plexTvRequest('/api/v2/pins?strong=true', {
    method: 'POST',
    clientIdentifier,
  })

  if (!pin?.id || !pin?.code) {
    throw new PlexError('Plex did not return a sign-in code. Try again in a moment.', {
      code: 'PLEX_PIN_FAILED',
    })
  }

  return {
    id: pin.id,
    code: pin.code,
    expiresAt: pin.expiresAt || null,
    authUrl: `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientIdentifier)}&code=${encodeURIComponent(pin.code)}&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent(PRODUCT)}`,
  }
}

export async function checkPin(clientIdentifier, pinId) {
  if (!/^\d+$/.test(String(pinId))) {
    throw new PlexError('That sign-in code is not valid.', { status: 400, code: 'BAD_PIN' })
  }

  const pin = await plexTvRequest(`/api/v2/pins/${pinId}`, { clientIdentifier })
  if (pin?.authToken) {
    return { status: 'connected', token: pin.authToken }
  }

  if (pin?.expiresAt && new Date(pin.expiresAt).getTime() < Date.now()) {
    return { status: 'expired' }
  }

  return { status: 'pending' }
}

function resourcesForServer(resources) {
  return (Array.isArray(resources) ? resources : [])
    .filter((resource) => String(resource.provides || '').split(',').includes('server'))
    .sort((a, b) => Number(Boolean(b.owned)) - Number(Boolean(a.owned)))
}

function candidateUris(resource, extraUris = []) {
  const candidates = []
  const add = (uri, meta = {}) => {
    if (!uri) return
    try {
      const normalized = new URL(uri).toString().replace(/\/$/, '')
      if (candidates.some((item) => item.uri === normalized)) return
      candidates.push({ uri: normalized, ...meta })
    } catch {
      // Ignore malformed addresses advertised by Plex.
    }
  }

  for (const uri of extraUris) add(uri, { local: true, preferred: true })

  const connections = Array.isArray(resource?.connections) ? resource.connections : []
  const sorted = [...connections].sort((a, b) => {
    const score = (connection) =>
      (connection.local ? 0 : 2) +
      (connection.relay ? 3 : 0) +
      (connection.protocol === 'https' ? 1 : 0)
    return score(a) - score(b)
  })

  for (const connection of sorted) {
    add(connection.uri, {
      local: Boolean(connection.local),
      relay: Boolean(connection.relay),
    })
  }

  return candidates
}

async function loadAccount(token, clientIdentifier) {
  try {
    const user = await plexTvRequest('/api/v2/user', { clientIdentifier, token })
    return {
      username: user?.username || user?.title || null,
      title: user?.title || null,
    }
  } catch {
    return null
  }
}

export async function discoverPlexServer({
  token,
  clientIdentifier,
  serverUrl = null,
  preferredServerName = null,
  account = null,
}) {
  if (!token) {
    throw new PlexError('A Plex token is required.', { status: 401, code: 'NO_TOKEN' })
  }

  let resources = []
  let resourcesError = null
  try {
    resources = await plexTvRequest('/api/v2/resources?includeHttps=1&includeRelay=1', {
      clientIdentifier,
      token,
    })
  } catch (error) {
    resourcesError = error
  }

  const servers = resourcesForServer(resources)
  let chosenResources = servers
  if (preferredServerName) {
    const matching = servers.filter((server) =>
      String(server.name || '').toLowerCase().includes(preferredServerName.toLowerCase()),
    )
    if (matching.length) chosenResources = matching
  }

  const extraUris = []
  if (serverUrl) extraUris.push(serverUrl)
  if (process.env.PLEX_URL) extraUris.push(process.env.PLEX_URL)
  extraUris.push('http://127.0.0.1:32400')

  const attempts = []
  for (const resource of chosenResources.length ? chosenResources : [null]) {
    for (const candidate of candidateUris(resource, extraUris)) {
      try {
        const identityResponse = await fetch(`${candidate.uri}/identity`, {
          headers: plexHeaders(clientIdentifier, token),
          signal: AbortSignal.timeout(3000),
        })
        if (!identityResponse.ok) throw new Error(`HTTP ${identityResponse.status}`)
        const identity = await readJson(identityResponse)

        const sectionsResponse = await fetch(`${candidate.uri}/library/sections`, {
          headers: plexHeaders(clientIdentifier, token),
          signal: AbortSignal.timeout(6000),
        })
        if (!sectionsResponse.ok) {
          const detail = sectionsResponse.status === 401
            ? 'Plex rejected the token for this server.'
            : `HTTP ${sectionsResponse.status}`
          throw new Error(detail)
        }
        const sections = await readJson(sectionsResponse)
        const size = sections?.MediaContainer?.Directory?.length ?? sections?.MediaContainer?.size ?? 0

        let friendlyName = resource?.name || null
        try {
          const rootResponse = await fetch(`${candidate.uri}/`, {
            headers: plexHeaders(clientIdentifier, token),
            signal: AbortSignal.timeout(3000),
          })
          if (rootResponse.ok) {
            const root = await readJson(rootResponse)
            friendlyName = root?.MediaContainer?.friendlyName || friendlyName
          }
        } catch {
          // The name is cosmetic; discovery already succeeded.
        }

        const serverName = friendlyName || `Plex at ${new URL(candidate.uri).hostname}`
        const resolvedAccount = account || (await loadAccount(token, clientIdentifier))

        return {
          server: {
            uri: candidate.uri,
            name: serverName,
            machineIdentifier: identity?.MediaContainer?.machineIdentifier || resource?.clientIdentifier || null,
            version: identity?.MediaContainer?.version || resource?.productVersion || null,
            local: Boolean(candidate.local),
            relay: Boolean(candidate.relay),
            libraryCount: size,
          },
          account: resolvedAccount,
        }
      } catch (error) {
        attempts.push(`${candidate.uri} — ${error.message}`)
      }
    }
  }

  const details = attempts.join('; ')
  const tokenRejected = resourcesError?.status === 401
  const baseMessage = tokenRejected
    ? 'Plex rejected that token.'
    : 'NOVA found your Plex account, but could not reach a Plex Media Server.'
  const guidance = tokenRejected
    ? 'Copy the full X-Plex-Token from Plex Web and try again. Tokens are long strings, not your Plex password.'
    : resourcesError
      ? 'NOVA could not read your Plex server list from plex.tv. Check your internet connection, or enter your server address manually.'
      : 'Make sure Plex Media Server is running and reachable at http://127.0.0.1:32400, then try again.'

  const error = new PlexError(baseMessage, {
    status: tokenRejected ? 401 : 502,
    code: tokenRejected ? 'PLEX_TOKEN_REJECTED' : 'PLEX_SERVER_UNREACHABLE',
    detail: guidance,
  })
  error.attempts = details || null
  throw error
}
