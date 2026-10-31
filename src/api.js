export class NocturneError extends Error {
  constructor(message, { code = 'NOCTURNE_ERROR', detail = null, attempts = null, status = 0 } = {}) {
    super(message)
    this.name = 'NocturneError'
    this.code = code
    this.detail = detail
    this.attempts = attempts
    this.status = status
  }
}

async function request(path, { signal, method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new NocturneError(
      'Nocturne could not reach its local server. Make sure the Nocturne server is running.',
      { code: 'NOCTURNE_SERVER_UNREACHABLE', detail: error.message },
    )
  }

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = payload?.error || {}
    throw new NocturneError(error.message || `Nocturne request failed (HTTP ${response.status}).`, {
      code: error.code || 'NOCTURNE_REQUEST_FAILED',
      detail: error.detail || null,
      attempts: error.attempts || null,
      status: response.status,
    })
  }

  return payload
}

function query(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  }
  const result = search.toString()
  return result ? `?${result}` : ''
}

export const api = {
  health(signal) {
    return request('/api/health', { signal })
  },

  libraries(signal) {
    return request('/api/libraries', { signal })
  },

  home(signal, { refresh = false } = {}) {
    return request(`/api/home${refresh ? '?refresh=1' : ''}`, { signal })
  },

  homeAll(type, { start = 0, size = 60 } = {}, signal) {
    return request(`/api/home/all${query({ type, start, size })}`, { signal })
  },

  library(key, { sort = 'recent', start = 0, size = 60 } = {}, signal) {
    return request(`/api/library/${encodeURIComponent(key)}${query({ sort, start, size })}`, { signal })
  },

  search(text, signal) {
    return request(`/api/search${query({ q: text })}`, { signal })
  },

  title(key, signal) {
    return request(`/api/title/${encodeURIComponent(key)}`, { signal })
  },

  season(key, signal) {
    return request(`/api/season/${encodeURIComponent(key)}`, { signal })
  },

  startPin(signal) {
    return request('/api/auth/pin', { method: 'POST', signal })
  },

  checkPin(id, signal) {
    return request(`/api/auth/pin/${encodeURIComponent(id)}`, { signal })
  },

  manualConnect({ token, serverUrl }, signal) {
    return request('/api/auth/manual', {
      method: 'POST',
      body: { token, serverUrl: serverUrl || undefined },
      signal,
    })
  },

  rediscover(signal) {
    return request('/api/auth/rediscover', { method: 'POST', signal })
  },

  disconnect(signal) {
    return request('/api/auth/disconnect', { method: 'POST', signal })
  },

  startPlayback(ratingKey, { offsetMs = 0, audioStreamId, subtitleStreamId } = {}, signal) {
    return request('/api/player', {
      method: 'POST',
      body: {
        ratingKey,
        offsetMs,
        audioStreamId: audioStreamId || undefined,
        subtitleStreamId: subtitleStreamId || undefined,
      },
      signal,
    })
  },

  playbackProgress(sessionId, { timeMs, state }, signal) {
    return request(`/api/player/${encodeURIComponent(sessionId)}/progress`, {
      method: 'POST',
      body: { timeMs, state },
      signal,
    })
  },

  stopPlayback(sessionId, { timeMs, completed = false }, signal) {
    return request(`/api/player/${encodeURIComponent(sessionId)}/stop`, {
      method: 'POST',
      body: { timeMs, completed },
      signal,
    })
  },

  playUrl(ratingKey) {
    return `/api/play/${encodeURIComponent(ratingKey)}`
  },
}
