import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectFiles, createZip } from './zip.js'

/**
 * Build a Nocturne update package.
 *
 * The installed app has no build tools, so this builds the interface here and
 * writes a package the app can install directly: the server, the built
 * interface, and the production dependencies. Run it with:
 *
 *   npm run package:update
 *
 * Then install the .zip from Nocturne -> Settings -> Updates.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE_DIR = path.join(ROOT, 'release')
const APP_DIRECTORIES = ['server', 'dist', 'public']
// The installed app only runs the server; the interface is already built into
// dist/ and bundled by Vite, so its packages stay out of the update.
const SERVER_DEPENDENCIES = ['dotenv', 'express']
const SKIP_BUILD = process.argv.includes('--no-build')

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function run(command, args, cwd) {
  console.log(`\n==> ${command} ${args.join(' ')}`)
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const version = String(packageJson.version || '').trim()
if (!version) throw new Error('package.json has no version to package.')

if (!SKIP_BUILD) {
  run(npmCommand(), ['run', 'build'], ROOT)
} else if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  throw new Error('No built interface found. Run without --no-build first.')
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'nocturne-package-'))
try {
  for (const directory of APP_DIRECTORIES) {
    const source = path.join(ROOT, directory)
    if (!fs.existsSync(source)) throw new Error(`The project is missing the "${directory}" folder.`)
    fs.cpSync(source, path.join(staging, directory), { recursive: true })
  }

  const dependencies = {}
  for (const name of SERVER_DEPENDENCIES) {
    const range = packageJson.dependencies?.[name]
    if (typeof range === 'string') dependencies[name] = range
  }

  const runtimeManifest = {
    name: 'nocturne-runtime',
    private: true,
    version,
    type: 'module',
    dependencies,
  }
  fs.writeFileSync(
    path.join(staging, 'package.json'),
    `${JSON.stringify(runtimeManifest, null, 2)}\n`,
  )

  // Dependencies travel with the package so the installed app can update
  // without npm, a compiler, or an internet connection of its own.
  run(npmCommand(), ['install', '--omit=dev', '--no-audit', '--no-fund'], staging)

  const files = [
    { name: 'package.json', data: fs.readFileSync(path.join(staging, 'package.json')) },
  ]
  for (const directory of [...APP_DIRECTORIES, 'node_modules']) {
    const source = path.join(staging, directory)
    if (!fs.existsSync(source)) continue
    files.push(...collectFiles(source, directory))
  }

  const archive = createZip(files)
  fs.mkdirSync(RELEASE_DIR, { recursive: true })
  const target = path.join(RELEASE_DIR, `nocturne-update-${version}.zip`)
  fs.writeFileSync(target, archive)

  console.log(`\nNocturne ${version} update package`)
  console.log(`    File:  ${target}`)
  console.log(`    Size:  ${(archive.length / 1024 / 1024).toFixed(2)} MB (${files.length} files)`)
  console.log('    Install it in Nocturne -> Settings -> Updates.')
} finally {
  fs.rmSync(staging, { recursive: true, force: true })
}
