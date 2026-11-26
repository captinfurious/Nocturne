import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/**
 * Minimal ZIP writer used by tools/make-update.js to build a Nocturne update
 * package. Keeping it dependency-free matches how the rest of the project is
 * packaged (no build tooling for the release step itself).
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function dosTimestamp(date) {
  return {
    time: ((date.getHours() & 0x1f) << 11)
      | ((date.getMinutes() & 0x3f) << 5)
      | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: (((date.getFullYear() - 1980) & 0x7f) << 9)
      | (((date.getMonth() + 1) & 0x0f) << 5)
      | (date.getDate() & 0x1f),
  }
}

/** @param {Array<{ name: string, data: Buffer }>} files */
export function createZip(files) {
  const stamp = dosTimestamp(new Date())
  const chunks = []
  const central = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8')
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data)
    const compressed = zlib.deflateRawSync(data, { level: 9 })
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt16LE(stamp.time, 12)
    entry.writeUInt16LE(stamp.date, 14)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(compressed.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt16LE(0, 30)
    entry.writeUInt16LE(0, 32)
    entry.writeUInt16LE(0, 34)
    entry.writeUInt16LE(0, 36)
    entry.writeUInt32LE(0, 38)
    entry.writeUInt32LE(offset, 42)

    chunks.push(local, name, compressed)
    central.push(entry, name)
    offset += local.length + name.length + compressed.length
  }

  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, directory, end])
}

/**
 * Collect every regular file below a folder as zip entries.
 * @param {string} directory
 * @param {string} prefix
 */
export function collectFiles(directory, prefix = '') {
  const files = []

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name

    let stats
    try {
      stats = fs.lstatSync(source)
    } catch {
      continue
    }

    // Skip symlinks (npm's .bin shims) and editor caches inside node_modules.
    if (stats.isSymbolicLink()) continue

    if (stats.isDirectory()) {
      if (entry.name === '.bin' || entry.name === '.cache') continue
      files.push(...collectFiles(source, name))
      continue
    }

    if (!stats.isFile()) continue
    files.push({ name, data: fs.readFileSync(source) })
  }

  return files
}
