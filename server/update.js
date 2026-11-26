import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getInstallInfo, getPaths, readConfig, writeConfig } from './config.js'
import { PlexError } from './plexAuth.js'
import { readZipArchive } from './zip.js'

/**
 * In-place updates for the installed Nocturne app.
 *
 * The installed app only carries a Node runtime (no npm, no build tools), so an
 * update is a ready-to-run package: the built interface plus the server code and
 * its production dependencies. Installing one replaces those folders in the app
 * directory, keeps the Plex sign-in and every other file, and lets the control
 * server restart the app on the new code.
 */

const UPDATE_DIRECTORIES = ['server', 'dist', 'public', 'node_modules']
const PACKAGE_ROOT_FILES = ['LICENSE']
const REQUIRED_FILES = ['package.json', 'server/index.js', 'dist/index.html']
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000

let installing = false

function updateError(message, code, status = 400, detail = null) {
  return new PlexError(message, { status, code, detail })
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export function getAppVersion() {
  const manifest = readJsonFile(path.join(getPaths().root, 'package.json'))
  return typeof manifest?.version === 'string' ? manifest.version : null
}

export function getUpdateSource() {
  const sourceUrl = readConfig().updates?.sourceUrl
  return typeof sourceUrl === 'string' && sourceUrl.trim() ? sourceUrl : null
}

function normalizeUpdateSource(value) {
  const text = String(value ?? '').trim()
  if (!text) return null

  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw updateError('That update address is not a valid link.', 'BAD_UPDATE_ADDRESS')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw updateError('The update address must start with http:// or https://.', 'BAD_UPDATE_ADDRESS')
  }
  if (parsed.username || parsed.password) {
    throw updateError(
      'Leave usernames and passwords out of the update address. Nocturne never stores credentials in a link.',
      'BAD_UPDATE_ADDRESS',
    )
  }

  return parsed.toString()
}

export function setUpdateSource(value) {
  const sourceUrl = normalizeUpdateSource(value)
  const current = readConfig()
  writeConfig({
    ...current,
    updates: { ...(current.updates || {}), sourceUrl },
  })
  return sourceUrl
}

function versionParts(value) {
  return String(value ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : null))
}

/** Compare two simple dotted versions. Returns -1, 0 or 1. */
export function compareVersions(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)

  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const one = a[index] ?? 0
    const two = b[index] ?? 0
    // A pre-release tail (1.4.0-beta.2) is not treated as newer.
    if (one === null || two === null) return 0
    if (one !== two) return one > two ? 1 : -1
  }

  return 0
}

export function getUpdateInfo() {
  const root = path.resolve(getPaths().root)
  const install = getInstallInfo()
  const installDir = install?.installDir ? path.resolve(install.installDir) : null
  const installedHere = Boolean(install && installDir && installDir === root)
  const version = getAppVersion()
  const sourceUrl = getUpdateSource()

  return {
    version,
    canInstall: installedHere && Boolean(version),
    reason: installedHere
      ? null
      : 'Updates install into the Nocturne Windows app. Start Nocturne from its shortcut to update from here, or run windows\\Install Nocturne.cmd from a newer project folder.',
    source: { url: sourceUrl, configured: Boolean(sourceUrl) },
    installDir: installedHere ? installDir : null,
  }
}

function collectPackageFiles(entries) {
  const files = new Map()
  for (const entry of entries) {
    if (entry.directory) continue
    files.set(entry.name, entry.data)
  }

  // A package zipped from a folder (or straight from a repository) keeps one
  // top-level directory. Work out which prefix to strip from every entry.
  const manifestName = [...files.keys()]
    .filter((name) => /(^|\/)package\.json$/.test(name))
    .sort((left, right) => left.split('/').length - right.split('/').length)[0]
  if (!manifestName) {
    throw updateError(
      'That file is not a Nocturne update package: it has no package.json.',
      'BAD_UPDATE_PACKAGE',
    )
  }

  const prefix = manifestName.slice(0, manifestName.length - 'package.json'.length)
  const scoped = new Map()
  for (const [name, data] of files) {
    if (prefix && !name.startsWith(prefix)) continue
    scoped.set(name.slice(prefix.length), data)
  }
  return scoped
}

function readPackageManifest(files) {
  let manifest
  try {
    manifest = JSON.parse(files.get('package.json').toString('utf8'))
  } catch {
    throw updateError('The package.json inside that update is unreadable.', 'BAD_UPDATE_PACKAGE')
  }

  if (!manifest || typeof manifest.version !== 'string' || !manifest.version.trim()) {
    throw updateError('That update package has no version number.', 'BAD_UPDATE_PACKAGE')
  }
  if (!['nocturne', 'nocturne-runtime'].includes(String(manifest.name || ''))) {
    throw updateError('That file is not a Nocturne update package.', 'BAD_UPDATE_PACKAGE')
  }

  for (const required of REQUIRED_FILES) {
    if (!files.has(required)) {
      throw updateError(
        `The update package is missing ${required}. Use the .zip made by "npm run package:update".`,
        'BAD_UPDATE_PACKAGE',
      )
    }
  }

  return manifest
}

function runtimeManifest(manifest) {
  const dependencies = {}
  for (const [name, version] of Object.entries(manifest.dependencies || {})) {
    if (typeof version === 'string') dependencies[name] = version
  }

  return {
    name: 'nocturne-runtime',
    private: true,
    version: manifest.version,
    type: 'module',
    dependencies,
  }
}

function stagePackage(files, stagingDir) {
  let bytes = 0

  for (const [name, data] of files) {
    const [top, ...rest] = name.split('/')
    if (rest.length === 0 && !PACKAGE_ROOT_FILES.includes(top)) continue
    if (rest.length > 0 && !UPDATE_DIRECTORIES.includes(top)) continue

    const target = path.join(stagingDir, ...name.split('/'))
    if (!target.startsWith(`${stagingDir}${path.sep}`)) continue

    bytes += data.length
    if (bytes > MAX_PACKAGE_BYTES) {
      throw updateError('That update package is too large.', 'BAD_UPDATE_PACKAGE', 413)
    }

    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, data)
  }
}

function installFiles(stagingDir, root, manifest) {
  for (const directory of UPDATE_DIRECTORIES) {
    const source = path.join(stagingDir, directory)
    if (!fs.existsSync(source)) continue

    // Copy over the existing files instead of deleting the folder first: the
    // running server has already loaded its modules, and leaving a stale asset
    // behind is harmless, while a half-deleted app folder is not.
    fs.cpSync(source, path.join(root, directory), { recursive: true, force: true })
  }

  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(runtimeManifest(manifest), null, 2)}\n`,
    'utf8',
  )

  // The license travels with the installed app, not just the repository.
  const licensePath = path.join(stagingDir, 'LICENSE')
  if (fs.existsSync(licensePath)) {
    fs.copyFileSync(licensePath, path.join(root, 'LICENSE'))
  }

  const manifestPath = path.join(root, 'install.json')
  const install = readJsonFile(manifestPath)
  if (install && typeof install === 'object') {
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          ...install,
          version: manifest.version,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }
}

async function downloadPackage(url) {
  let response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
  } catch (error) {
    throw updateError(
      'Nocturne could not reach that update address. Check the link and your connection.',
      'UPDATE_DOWNLOAD_FAILED',
      502,
      error?.message || null,
    )
  }

  if (!response.ok) {
    throw updateError(
      response.status === 401 || response.status === 403
        ? 'That update address needs a sign-in Nocturne cannot provide. Host the package where Nocturne can download it.'
        : `The update address answered HTTP ${response.status}.`,
      'UPDATE_DOWNLOAD_FAILED',
      502,
    )
  }

  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_PACKAGE_BYTES) {
    throw updateError('That update package is too large.', 'BAD_UPDATE_PACKAGE', 413)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_PACKAGE_BYTES) {
    throw updateError('That update package is too large.', 'BAD_UPDATE_PACKAGE', 413)
  }
  return buffer
}

/**
 * Install an update package over the installed app.
 * @param {{ buffer?: Buffer, url?: string }} payload
 * @returns {Promise<{ fromVersion: string, toVersion: string, directories: string[] }>}
 */
export async function installUpdate({ buffer = null, url = null } = {}) {
  const info = getUpdateInfo()
  if (!info.canInstall) {
    throw updateError(info.reason, 'UPDATE_NOT_SUPPORTED', 409)
  }
  if (installing) {
    throw updateError('Nocturne is already installing an update.', 'UPDATE_IN_PROGRESS', 409)
  }

  installing = true
  try {
    const packageBuffer = buffer && buffer.length
      ? buffer
      : await downloadPackage(url || info.source.url)

    if (!packageBuffer || !packageBuffer.length) {
      throw updateError('Choose an update package or save an update address first.', 'NO_UPDATE_PACKAGE')
    }

    let entries
    try {
      entries = readZipArchive(packageBuffer)
    } catch (error) {
      throw updateError(
        'That file is not a readable update package. Choose the .zip made by "npm run package:update".',
        'BAD_UPDATE_PACKAGE',
        400,
        error?.message || null,
      )
    }

    const files = collectPackageFiles(entries)
    const manifest = readPackageManifest(files)

    // The same version is accepted so the package can also repair an app whose
    // files were damaged, but going backwards is always refused.
    if (compareVersions(manifest.version, info.version) < 0) {
      throw updateError(
        `That package is Nocturne ${manifest.version}, which is older than the installed ${info.version}.`,
        'UPDATE_OLDER',
        409,
      )
    }

    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nocturne-update-'))
    let directories = []
    try {
      stagePackage(files, stagingDir)
      directories = UPDATE_DIRECTORIES.filter((directory) =>
        fs.existsSync(path.join(stagingDir, directory)))
      try {
        installFiles(stagingDir, path.resolve(getPaths().root), manifest)
      } catch (error) {
        throw updateError(
          'Nocturne could not replace its app files with this update. Close Nocturne and run windows\\Install Nocturne.cmd from a newer project folder.',
          'UPDATE_WRITE_FAILED',
          500,
          error?.message || null,
        )
      }
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true })
    }

    console.log(`[Nocturne] Updated ${info.version} to ${manifest.version}.`)
    return { fromVersion: info.version, toVersion: manifest.version, directories }
  } finally {
    installing = false
  }
}
