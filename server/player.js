import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { getCredentials } from './config.js'
import { getMetadata } from './plex.js'
import { PlexError, plexHeaders } from './plexAuth.js'

const SESSION_TTL_MS = 6 * 60 * 60 * 1000
const MAX_SESSIONS = 8

const sessions = new Map()

const DIRECT_CONTAINERS = new Set(['mp4', 'm4v', 'mov', 'webm'])
const BROWSER_VIDEO = new Set(['h264', 'avc', 'avc1', 'vp8', 'vp9', 'av1'])
const BROWSER_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis'])

function now() {
  return Date.now()
}

function plexError(message, code, status = 502, detail = null) {
  return new PlexError(message, { status, code, detail })
}

function requireCredentials() {
  const credentials = getCredentials()
  if (!credentials.token || !credentials.server?.uri) {
    throw plexError(
      'Nocturne is not connected to Plex yet. Sign in on the setup screen first.',
      'NOT_CONFIGURED',
      503,
    )
  }
  return credentials
}

function plexUrl(pathWithQuery) {
  const { server } = requireCredentials()
  if (typeof pathWithQuery !== 'string' || !pathWithQuery.startsWith('/')) {
    throw plexError('Nocturne built an invalid Plex playback address.', 'BAD_PLAYER_PATH', 500)
  }

  const base = server.uri.replace(/\/+$/, '')
  let url
  try {
    url = new URL(`${base}${pathWithQuery}`)
  } catch {
    throw plexError('Nocturne built an invalid Plex playback address.', 'BAD_PLAYER_PATH', 500)
  }

  if (url.origin !== new URL(base).origin) {
    throw plexError('Nocturne refused an unexpected playback address.', 'BAD_PLAYER_PATH', 500)
  }
  return url
}

function playbackHeaders(playbackSessionId) {
  const { token, clientIdentifier } = requireCredentials()
  return {
    ...plexHeaders(clientIdentifier, token),
    Accept: '*/*',
    'X-Plex-Playback-Session-Id': playbackSessionId,
    'X-Plex-Playback-Client': 'Nocturne',
  }
}

function safePartKey(value) {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/library/parts/')) return null
  if (value.length > 2048 || value.includes('..') || value.includes('\\') || value.includes('\0')) {
    return null
  }
  return value
}

function pickMedia(raw) {
  const mediaList = Array.isArray(raw?.Media) ? raw.Media : []
  if (!mediaList.length) return null

  const mediaIndex = Math.max(0, mediaList.findIndex((entry) => entry?.selected))
  const media = mediaList[mediaIndex] || mediaList[0]
  const parts = Array.isArray(media?.Part) ? media.Part : []
  if (!parts.length) return null

  const partIndex = Math.max(0, parts.findIndex((entry) => entry?.selected))
  const part = parts[partIndex] || parts[0]
  if (!safePartKey(part?.key)) return null

  return { media, mediaIndex, part, partIndex }
}

function containerOf(media, part) {
  return String(part?.container || media?.container || '').toLowerCase()
}

function canDirectPlay(media, part) {
  const container = containerOf(media, part)
  const video = String(media?.videoCodec || '').toLowerCase()
  const audio = String(media?.audioCodec || '').toLowerCase()

  if (!DIRECT_CONTAINERS.has(container)) return false
  if (video && !BROWSER_VIDEO.has(video)) return false
  if (audio && !BROWSER_AUDIO.has(audio)) return false
  return true
}

function canRemuxVideo(media) {
  const video = String(media?.videoCodec || '').toLowerCase()
  return video === 'h264' || video === 'avc' || video === 'avc1'
}

function clampOffset(offsetMs, duration) {
  const offset = Math.max(0, Math.round(Number(offsetMs) || 0))
  if (duration > 0 && offset > duration - 20_000) return 0
  return Math.min(offset, SESSION_TTL_MS)
}

function stopSessionOnPlex(session) {
  const transcodeSession = session.plexSessionId || session.playbackSessionId
  if (!transcodeSession) return

  try {
    const url = plexUrl(`/video/:/transcode/universal/stop?session=${encodeURIComponent(transcodeSession)}`)
    fetch(url, {
      headers: playbackHeaders(session.playbackSessionId),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  } catch {
    // The Plex connection may have been removed while a session was open.
  }
}

function forgetSession(session, { stopTranscode = true } = {}) {
  if (!session || session.closed) return
  session.closed = true
  sessions.delete(session.id)
  if (stopTranscode) stopSessionOnPlex(session)
}

function cleanupSessions() {
  const cutoff = now() - SESSION_TTL_MS
  const ordered = [...sessions.values()].sort((a, b) => a.touchedAt - b.touchedAt)

  for (const session of ordered) {
    if (session.touchedAt < cutoff) forgetSession(session)
  }

  while ([...sessions.values()].length > MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.touchedAt - b.touchedAt)[0]
    if (!oldest) break
    forgetSession(oldest)
  }
}

const cleanupTimer = setInterval(cleanupSessions, 10 * 60 * 1000)
cleanupTimer.unref?.()

async function reportTimeline(session, { state, timeMs }) {
  const { token, clientIdentifier } = requireCredentials()
  const time = Math.max(0, Math.min(Math.round(Number(timeMs) || 0), session.duration || 0))
  const query = new URLSearchParams({
    ratingKey: session.ratingKey,
    key: `/library/metadata/${session.ratingKey}`,
    state,
    time: String(time),
    duration: String(session.duration || 0),
    hasMDE: '1',
  })
  const url = plexUrl(`/:/timeline?${query.toString()}`)

  try {
    await fetch(url, {
      headers: {
        ...plexHeaders(clientIdentifier, token),
        'X-Plex-Playback-Session-Id': session.playbackSessionId,
      },
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    // Progress reporting is best-effort; playback should never fail because of it.
  }
}

async function scrobble(session) {
  const { token, clientIdentifier } = requireCredentials()
  const url = plexUrl(
    `/:/scrobble?key=${encodeURIComponent(session.ratingKey)}&identifier=com.plexapp.plugins.library`,
  )
  try {
    await fetch(url, {
      headers: {
        ...plexHeaders(clientIdentifier, token),
        'X-Plex-Playback-Session-Id': session.playbackSessionId,
      },
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    // Best-effort, like the timeline reports.
  }
}

async function pingTranscode(session) {
  if (!session.plexSessionId) return
  if (now() - session.lastPingAt < 12_000) return
  session.lastPingAt = now()

  try {
    await fetch(plexUrl(`/video/:/transcode/segmented/ping?session=${encodeURIComponent(session.plexSessionId)}`), {
      headers: playbackHeaders(session.playbackSessionId),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // A missed ping does not break an active stream.
  }
}

function transcodeStartPath(session) {
  const query = new URLSearchParams({
    path: `/library/metadata/${session.ratingKey}`,
    mediaIndex: String(session.mediaIndex),
    partIndex: String(session.partIndex),
    protocol: 'hls',
    fastSeek: '1',
    directPlay: '0',
    directStream: session.remuxVideo ? '1' : '0',
    subtitleSize: '100',
    audioBoost: '100',
    location: 'lan',
    session: session.playbackSessionId,
    copyts: '1',
    hasMDE: '1',
  })

  if (session.offsetMs >= 1000) {
    query.set('offset', String(Math.floor(session.offsetMs / 1000)))
  }

  return `/video/:/transcode/universal/start.m3u8?${query.toString()}`
}

function publicSession(session) {
  return {
    sessionId: session.id,
    mode: session.mode,
    src: session.mode === 'hls'
      ? `/api/player/${session.id}/master.m3u8`
      : `/api/player/${session.id}/stream`,
    offsetMs: session.offsetMs,
    durationMs: session.duration,
    ratingKey: session.ratingKey,
    title: session.title,
    subtitle: session.subtitle,
    year: session.year,
    directPlay: session.mode === 'direct',
    transcodeReason: session.transcodeReason,
  }
}

export async function startPlayback(ratingKey, { offsetMs = 0 } = {}) {
  requireCredentials()

  const raw = await getMetadata(ratingKey)
  if (!raw || !['movie', 'episode'].includes(raw.type)) {
    throw plexError(
      'That item cannot be played directly. Choose a movie or an episode.',
      'NOT_PLAYABLE',
      400,
    )
  }

  const selected = pickMedia(raw)
  if (!selected) {
    throw plexError(
      'Plex has no playable media file for this title yet. It may still be scanning or the file is missing.',
      'NO_MEDIA_FILE',
      409,
    )
  }

  const { media, mediaIndex, part, partIndex } = selected
  const duration = Math.max(0, Number(raw.duration) || Number(media.duration) || 0)
  const offset = clampOffset(offsetMs, duration)
  const direct = canDirectPlay(media, part)

  const session = {
    id: crypto.randomUUID(),
    playbackSessionId: crypto.randomUUID(),
    created: now(),
    touchedAt: now(),
    lastPingAt: 0,
    ratingKey: String(ratingKey),
    duration,
    offsetMs: offset,
    mediaIndex,
    partIndex,
    partKey: part.key,
    plexSessionId: null,
    closed: false,
    mode: direct ? 'direct' : 'hls',
    remuxVideo: canRemuxVideo(media),
    title: raw.type === 'episode' ? raw.grandparentTitle || raw.title : raw.title,
    subtitle: raw.type === 'episode'
      ? [
          raw.parentIndex != null && raw.index != null ? `S${raw.parentIndex} · E${raw.index}` : null,
          raw.title,
        ].filter(Boolean).join(' · ')
      : null,
    year: Number(raw.year) || null,
    transcodeReason: direct
      ? null
      : `${containerOf(media, part) || 'this file'} needs conversion for the browser`,
  }

  sessions.set(session.id, session)
  cleanupSessions()

  await reportTimeline(session, { state: 'buffering', timeMs: offset })

  return publicSession(session)
}

export function getSession(id) {
  const session = sessions.get(String(id))
  if (!session) {
    throw plexError(
      'This playback session has ended. Press play again to restart it.',
      'PLAYBACK_SESSION_GONE',
      410,
    )
  }
  session.touchedAt = now()
  return session
}

function rewritePlaylist(body, baseUrl, session) {
  const base = new URL(baseUrl)

  const proxyUri = (value) => {
    let resolved
    try {
      resolved = new URL(value, base)
    } catch {
      return value
    }

    resolved.searchParams.delete('X-Plex-Token')
    resolved.searchParams.delete('x-plex-token')

    if (resolved.origin !== base.origin) return resolved.toString()
    if (!resolved.pathname.startsWith('/video/:/transcode/universal/')) return resolved.toString()

    const target = `${resolved.pathname}${resolved.search}`
    return `/api/player/${session.id}/hls?u=${encodeURIComponent(target)}`
  }

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => `URI="${proxyUri(uri)}"`)
      }
      return proxyUri(trimmed)
    })
    .join('\n')
}

function extractTranscodeSession(playlist, session) {
  const match = playlist.match(/session\/([^/?#]+)\/base/)
  if (match?.[1] && match[1] !== session.plexSessionId) {
    session.plexSessionId = match[1]
  }
}

async function fetchUpstream(session, pathWithQuery, { range, timeout = 45000 } = {}) {
  const { token, clientIdentifier } = requireCredentials()
  const url = plexUrl(pathWithQuery)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let response
  try {
    response = await fetch(url, {
      headers: {
        ...plexHeaders(clientIdentifier, token),
        Accept: '*/*',
        'X-Plex-Playback-Session-Id': session.playbackSessionId,
        'X-Plex-Playback-Client': 'Nocturne',
        ...(range ? { Range: range } : {}),
      },
      signal: controller.signal,
      redirect: 'follow',
    })
  } catch (error) {
    clearTimeout(timer)
    const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError'
    throw plexError(
      timedOut
        ? 'Plex took too long to start this video. It may be busy transcoding another stream.'
        : 'Nocturne could not reach Plex while starting playback. Check that Plex is running.',
      'PLEX_PLAYBACK_UNREACHABLE',
      502,
      error?.message || null,
    )
  }

  clearTimeout(timer)
  return { response, controller }
}

function pipeUpstream(res, upstream, controller) {
  res.status(upstream.status)

  for (const header of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'content-encoding',
  ]) {
    const value = upstream.headers.get(header)
    if (value) res.setHeader(header, value)
  }

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Accel-Buffering', 'no')

  if (!upstream.body) {
    res.end()
    return
  }

  const stream = Readable.fromWeb(upstream.body)
  const abort = () => {
    controller.abort()
    stream.destroy()
  }
  res.on('close', abort)
  stream.on('error', () => {
    if (!res.headersSent) res.status(502)
    res.end()
  })
  stream.pipe(res)
}

async function readErrorMessage(response) {
  try {
    const text = await response.text()
    const data = JSON.parse(text)
    return data?.error?.message || text.slice(0, 180) || null
  } catch {
    return null
  }
}

export async function streamDirect(req, res, id) {
  const session = getSession(id)
  if (session.mode !== 'direct') {
    throw plexError('This playback session is not a direct stream.', 'WRONG_PLAYBACK_MODE', 409)
  }

  const { response, controller } = await fetchUpstream(session, session.partKey, {
    range: req.get('Range'),
    timeout: 30000,
  })

  if (!response.ok && response.status !== 206) {
    const detail = await readErrorMessage(response)
    controller.abort()
    throw plexError(
      response.status === 404
        ? 'Plex could not find the video file for this title. Rescan the library in Plex.'
        : 'Plex refused to stream this video file.',
      'PLEX_STREAM_FAILED',
      502,
      detail || `Plex returned HTTP ${response.status}`,
    )
  }

  res.setHeader('Content-Disposition', 'inline')
  pipeUpstream(res, response, controller)
}

export async function streamMaster(req, res, id) {
  const session = getSession(id)
  if (session.mode !== 'hls') {
    throw plexError('This playback session is not transcoded.', 'WRONG_PLAYBACK_MODE', 409)
  }

  const startPath = transcodeStartPath(session)
  const { response, controller } = await fetchUpstream(session, startPath, { timeout: 60000 })

  if (!response.ok) {
    const detail = await readErrorMessage(response)
    controller.abort()
    throw plexError(
      response.status === 401 || response.status === 403
        ? 'Plex rejected this playback request. Reconnect your Plex account in Settings.'
        : 'Plex could not start a transcode for this title.',
      'PLEX_TRANSCODE_FAILED',
      502,
      detail || `Plex returned HTTP ${response.status}`,
    )
  }

  const playlist = await response.text()
  if (!playlist.trimStart().startsWith('#EXTM3U')) {
    throw plexError(
      'Plex did not return a playable transcode playlist for this title.',
      'PLEX_TRANSCODE_FAILED',
      502,
      playlist.slice(0, 180) || null,
    )
  }

  extractTranscodeSession(playlist, session)
  await pingTranscode(session)

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
  res.setHeader('Cache-Control', 'no-store')
  res.send(rewritePlaylist(playlist, response.url || plexUrl(startPath).toString(), session))
}

function validateHlsTarget(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }
  if (value.length > 4096 || value.includes('..') || value.includes('\\') || value.startsWith('//')) {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }

  let parsed
  try {
    parsed = new URL(value, 'http://nocturne.local')
  } catch {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }

  if (parsed.origin !== 'http://nocturne.local') {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }
  if (!parsed.pathname.startsWith('/video/:/transcode/universal/')) {
    throw plexError('Nocturne rejected an invalid stream address.', 'BAD_STREAM_PATH', 400)
  }

  parsed.searchParams.delete('X-Plex-Token')
  parsed.searchParams.delete('x-plex-token')
  return `${parsed.pathname}${parsed.search}`
}

export async function streamHls(req, res, id) {
  const session = getSession(id)
  if (session.mode !== 'hls') {
    throw plexError('This playback session is not transcoded.', 'WRONG_PLAYBACK_MODE', 409)
  }

  const target = validateHlsTarget(req.query.u)
  const { response, controller } = await fetchUpstream(session, target, {
    range: req.get('Range'),
    timeout: 60000,
  })

  if (!response.ok && response.status !== 206) {
    const detail = await readErrorMessage(response)
    controller.abort()
    throw plexError(
      'Plex stopped sending the video stream. The transcode may have failed on the server.',
      'PLEX_STREAM_FAILED',
      502,
      detail || `Plex returned HTTP ${response.status}`,
    )
  }

  const contentType = response.headers.get('content-type') || ''
  const isPlaylist = target.split('?')[0].endsWith('.m3u8')
    || contentType.includes('mpegurl')

  if (isPlaylist) {
    const body = await response.text()
    if (!body.trimStart().startsWith('#EXTM3U')) {
      throw plexError(
        'Plex returned an invalid HLS playlist for this title.',
        'PLEX_TRANSCODE_FAILED',
        502,
        body.slice(0, 180) || null,
      )
    }

    extractTranscodeSession(body, session)
    await pingTranscode(session)
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Cache-Control', 'no-store')
    res.send(rewritePlaylist(body, response.url || plexUrl(target).toString(), session))
    return
  }

  await pingTranscode(session)
  pipeUpstream(res, response, controller)
}

export async function progressPlayback(id, { timeMs, state = 'playing' } = {}) {
  const session = getSession(id)
  const allowed = new Set(['playing', 'paused', 'buffering', 'stopped'])
  const nextState = allowed.has(state) ? state : 'playing'

  await reportTimeline(session, { state: nextState, timeMs })
  return { ok: true }
}

export async function stopPlayback(id, { timeMs, completed = false } = {}) {
  const session = sessions.get(String(id))
  if (!session) return { ok: true }

  await reportTimeline(session, { state: 'stopped', timeMs })
  if (completed || (session.duration > 0 && Number(timeMs) >= session.duration * 0.92)) {
    await scrobble(session)
  }

  forgetSession(session)
  return { ok: true }
}

export function activeSessionCount() {
  return sessions.size
}
