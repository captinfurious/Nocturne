import zlib from 'node:zlib'

/**
 * Minimal ZIP reader for Nocturne update packages.
 *
 * The app ships without extra dependencies, so this walks the archive's central
 * directory and inflates each entry with Node's own zlib. Only the formats an
 * update package actually uses are supported: stored and deflated entries.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50
const LOCAL_FILE_HEADER = 0x04034b50
const MAX_ENTRIES = 40_000
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024

function normalizeEntryName(name) {
  const cleaned = String(name).replace(/\\/g, '/').replace(/^\.\//, '')
  if (!cleaned || cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) {
    throw new Error('The archive contains an unsafe file path.')
  }

  const parts = cleaned.split('/')
  if (parts.some((part) => part === '..')) {
    throw new Error('The archive contains an unsafe file path.')
  }

  return cleaned
}

function findEndOfCentralDirectory(buffer) {
  const earliest = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset
  }
  return -1
}

/**
 * Read every file in a ZIP archive.
 * @returns {Array<{ name: string, directory: boolean, data: Buffer }>}
 */
export function readZipArchive(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || [])
  if (buffer.length < 22) throw new Error('The file is too small to be a ZIP archive.')
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('The archive is too large.')

  const end = findEndOfCentralDirectory(buffer)
  if (end < 0) throw new Error('The file is not a ZIP archive.')

  const entryCount = buffer.readUInt16LE(end + 10)
  const directorySize = buffer.readUInt32LE(end + 12)
  const directoryOffset = buffer.readUInt32LE(end + 16)

  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported.')
  }
  if (entryCount > MAX_ENTRIES) throw new Error('The archive contains too many files.')
  if (directoryOffset + directorySize > buffer.length) throw new Error('The archive is damaged.')

  const entries = []
  let offset = directoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) {
      throw new Error('The archive directory is damaged.')
    }

    const flags = buffer.readUInt16LE(offset + 8)
    const compression = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)

    const rawName = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + extraLength + commentLength

    const name = normalizeEntryName(rawName)
    if (name.endsWith('/')) {
      entries.push({ name, directory: true, data: Buffer.alloc(0) })
      continue
    }

    if (flags & 0x1) throw new Error('Encrypted archive entries are not supported.')
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported.')
    }
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      throw new Error('The archive is damaged.')
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > buffer.length) throw new Error('The archive is truncated.')

    const raw = buffer.subarray(dataStart, dataEnd)
    let data
    if (compression === 0) {
      data = Buffer.from(raw)
    } else if (compression === 8) {
      data = zlib.inflateRawSync(raw)
    } else {
      throw new Error(`The archive uses an unsupported compression method (${compression}).`)
    }

    entries.push({ name, directory: false, data })
  }

  return entries
}
