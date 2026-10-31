import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = process.env.NOCTURNE_DATA_DIR
  ? path.resolve(process.env.NOCTURNE_DATA_DIR)
  : path.join(ROOT, 'data')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const DIST_DIR = path.join(ROOT, 'dist')

dotenv.config({ path: path.join(ROOT, '.env'), quiet: true })

let cachedConfig

function nowIso() {
  return new Date().toISOString()
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
}

function emptyConfig() {
  return {
    version: 1,
    clientIdentifier: crypto.randomUUID(),
    token: null,
    server: null,
    account: null,
    network: { lanEnabled: false },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

export function readConfig() {
  if (cachedConfig) return cachedConfig

  ensureDataDir()

  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    cachedConfig = {
      ...emptyConfig(),
      ...parsed,
      clientIdentifier: parsed.clientIdentifier || crypto.randomUUID(),
      network: {
        ...emptyConfig().network,
        ...(parsed.network && typeof parsed.network === 'object' ? parsed.network : {}),
        lanEnabled: Boolean(parsed.network?.lanEnabled),
      },
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[Nocturne] Could not read data/config.json; starting a fresh local config.')
    }
    cachedConfig = emptyConfig()
    writeConfig(cachedConfig)
  }

  return cachedConfig
}

export function writeConfig(nextConfig) {
  ensureDataDir()
  const payload = {
    ...nextConfig,
    updatedAt: nowIso(),
  }
  const tempPath = `${CONFIG_PATH}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tempPath, CONFIG_PATH)
  cachedConfig = payload
  return payload
}

export function updateConfig(patch) {
  const current = readConfig()
  return writeConfig({
    ...current,
    ...patch,
  })
}

export function clearConnection() {
  const current = readConfig()
  return writeConfig({
    ...current,
    token: null,
    server: null,
    account: null,
  })
}

export function isLanEnabled() {
  return Boolean(readConfig().network?.lanEnabled)
}

export function setLanEnabled(enabled) {
  const current = readConfig()
  return writeConfig({
    ...current,
    network: {
      ...current.network,
      lanEnabled: Boolean(enabled),
    },
  })
}

export function getCredentials() {
  const config = readConfig()
  const configToken = typeof config.token === 'string' && config.token.trim() ? config.token.trim() : null
  const envToken = typeof process.env.PLEX_TOKEN === 'string' && process.env.PLEX_TOKEN.trim()
    ? process.env.PLEX_TOKEN.trim()
    : null

  let server = configToken ? config.server : null
  if (!server && envToken && process.env.PLEX_URL) {
    server = {
      uri: normalizeServerUrl(process.env.PLEX_URL),
      name: 'Plex (from .env)',
      machineIdentifier: null,
      version: null,
    }
  }

  return {
    token: configToken || envToken,
    server,
    source: configToken ? 'config' : envToken ? 'env' : null,
    clientIdentifier: config.clientIdentifier,
  }
}

export function getPublicStatus() {
  const credentials = getCredentials()
  const config = readConfig()

  return {
    configured: Boolean(credentials.token && credentials.server?.uri),
    source: credentials.source,
    server: credentials.server
      ? {
          name: credentials.server.name || 'Plex Media Server',
          uri: credentials.server.uri,
          machineIdentifier: credentials.server.machineIdentifier || null,
          version: credentials.server.version || null,
        }
      : null,
    account: config.account || null,
  }
}

export function normalizeServerUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('A Plex server address is required.')
  }

  let parsed
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('That Plex server address is not a valid http:// or https:// URL.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('The Plex server address must use http:// or https://.')
  }

  if (parsed.username || parsed.password) {
    throw new Error('The Plex server address must not contain a username or password.')
  }

  parsed.search = ''
  parsed.hash = ''
  parsed.pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/web$/, '')
  return parsed.toString().replace(/\/$/, '')
}

export function getPaths() {
  return {
    root: ROOT,
    dataDir: DATA_DIR,
    configPath: CONFIG_PATH,
    distDir: DIST_DIR,
  }
}

/**
 * Details written by windows/Install-Nocturne.ps1. Only used to show accurate
 * app information in Settings; the app works identically when it is absent.
 */
export function getInstallInfo() {
  if (!process.env.LOCALAPPDATA) return null

  const manifestPath = path.join(
    process.env.LOCALAPPDATA,
    'Programs',
    'Nocturne',
    'install.json',
  )

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    return {
      installed: true,
      version: typeof raw.version === 'string' ? raw.version : null,
      installDir: typeof raw.installDir === 'string' ? raw.installDir : null,
      dataDir: typeof raw.dataDir === 'string' ? raw.dataDir : null,
      port: Number.isInteger(raw.port) && raw.port > 0 && raw.port < 65536 ? raw.port : null,
      runAtLogin: Boolean(raw.runAtLogin),
      installedAt: typeof raw.installedAt === 'string' ? raw.installedAt : null,
    }
  } catch {
    return null
  }
}
