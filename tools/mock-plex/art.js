const PALETTES = [
  ['#0b0a13', '#241044', '#7c53e6', '#d4b6ff'],
  ['#0a0d12', '#112635', '#3b7a78', '#bfe2d4'],
  ['#120b0e', '#34121f', '#9c3d58', '#efc2a8'],
  ['#0b0c0b', '#182817', '#647a44', '#d6d2a8'],
  ['#0d0a11', '#271a36', '#6e4c96', '#c9b6dc'],
  ['#100b08', '#352018', '#9b6944', '#ead1aa'],
]

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function hash(value) {
  let result = 0
  const text = String(value)
  for (let index = 0; index < text.length; index += 1) {
    result = ((result << 5) - result + text.charCodeAt(index)) | 0
  }
  return Math.abs(result)
}

function palette(seed) {
  return PALETTES[hash(seed) % PALETTES.length]
}

function wrap(text, maxChars) {
  const words = String(text).split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
    } else if (`${current} ${word}`.length <= maxChars) {
      current += ` ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 3)
}

function defs(id, colors) {
  return `
    <defs>
      <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colors[0]}"/>
        <stop offset="0.55" stop-color="${colors[1]}"/>
        <stop offset="1" stop-color="${colors[0]}"/>
      </linearGradient>
      <radialGradient id="glow-${id}" cx="0.78" cy="0.16" r="0.9">
        <stop offset="0" stop-color="${colors[2]}" stop-opacity="0.62"/>
        <stop offset="0.55" stop-color="${colors[2]}" stop-opacity="0.12"/>
        <stop offset="1" stop-color="${colors[2]}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="accent-${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${colors[3]}"/>
        <stop offset="1" stop-color="${colors[2]}" stop-opacity="0.1"/>
      </linearGradient>
      <filter id="noise-${id}">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.12"/></feComponentTransfer>
      </filter>
    </defs>`
}

function subjectText(subject) {
  return {
    title: esc(subject.title),
    subtitle: esc(subject.subtitle || ''),
    genres: esc((subject.genres || []).join(' / ')),
    year: esc(subject.year || ''),
  }
}

function poster(subject) {
  const id = `p${hash(subject.seed)}`
  const colors = palette(subject.seed)
  const text = subjectText(subject)
  const title = String(subject.title).toUpperCase()
  const fontSize = title.length > 30 ? 38 : title.length > 20 ? 44 : 50
  const lines = wrap(title, title.length > 30 ? 17 : 15)
  const startY = 414 - (lines.length - 1) * fontSize * 0.52

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    ${defs(id, colors)}
    <rect width="400" height="600" fill="url(#bg-${id})"/>
    <rect width="400" height="600" fill="url(#glow-${id})"/>
    <circle cx="326" cy="148" r="142" fill="none" stroke="${colors[3]}" stroke-opacity="0.17"/>
    <circle cx="326" cy="148" r="107" fill="none" stroke="${colors[3]}" stroke-opacity="0.1"/>
    <ellipse cx="320" cy="154" rx="70" ry="164" fill="none" stroke="${colors[2]}" stroke-opacity="0.35" transform="rotate(34 320 154)"/>
    <path d="M-20 548 C110 430 222 574 430 438" fill="none" stroke="${colors[3]}" stroke-opacity="0.2" stroke-width="1.2"/>
    <path d="M-30 574 C120 472 236 616 430 478" fill="none" stroke="${colors[3]}" stroke-opacity="0.12" stroke-width="1"/>
    <text x="34" y="54" fill="${colors[3]}" fill-opacity="0.58" font-family="Segoe UI, Arial, sans-serif" font-size="8.5" font-weight="700" letter-spacing="2.2">A NOVA TEST LIBRARY PRESENTATION</text>
    <path d="M34 72 H88" stroke="${colors[3]}" stroke-opacity="0.4"/>
    <text x="34" y="${startY - 46}" fill="${colors[3]}" fill-opacity="0.78" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="3.2">${text.year}</text>
    ${lines.map((line, index) => `<text x="32" y="${startY + index * fontSize * 1.04}" fill="#f7f2ff" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-1.2">${esc(line)}</text>`).join('')}
    <text x="34" y="536" fill="${colors[3]}" fill-opacity="0.72" font-family="Segoe UI, Arial, sans-serif" font-size="9" font-weight="600" letter-spacing="2">${text.genres}</text>
    <text x="34" y="560" fill="#f7f2ff" fill-opacity="0.42" font-family="Segoe UI, Arial, sans-serif" font-size="8" letter-spacing="2.4">MOCK PLEX · TEST ARTWORK</text>
    <text x="354" y="548" fill="${colors[3]}" fill-opacity="0.5" font-family="Segoe UI, Arial, sans-serif" font-size="30">✦</text>
    <rect width="400" height="600" filter="url(#noise-${id})" opacity="0.55"/>
    <rect x="0.5" y="0.5" width="399" height="599" fill="none" stroke="#ffffff" stroke-opacity="0.09" rx="4"/>
  </svg>`
}

function backdrop(subject) {
  const id = `b${hash(subject.seed)}`
  const colors = palette(subject.seed)
  const text = subjectText(subject)
  const title = String(subject.title).toUpperCase()
  const lines = wrap(title, 22)
  const fontSize = title.length > 26 ? 66 : 82
  const startY = 620 - (lines.length - 1) * fontSize

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    ${defs(id, colors)}
    <rect width="1600" height="900" fill="url(#bg-${id})"/>
    <rect width="1600" height="900" fill="url(#glow-${id})"/>
    <circle cx="1230" cy="280" r="430" fill="none" stroke="${colors[3]}" stroke-opacity="0.11"/>
    <circle cx="1230" cy="280" r="310" fill="none" stroke="${colors[3]}" stroke-opacity="0.08"/>
    <ellipse cx="1230" cy="280" rx="210" ry="470" fill="none" stroke="${colors[2]}" stroke-opacity="0.25" transform="rotate(27 1230 280)"/>
    <path d="M-80 810 C300 590 650 910 1050 650 C1300 486 1510 540 1700 430" fill="none" stroke="${colors[3]}" stroke-opacity="0.16"/>
    <path d="M-70 860 C310 650 680 966 1080 700 C1330 532 1540 592 1710 486" fill="none" stroke="${colors[3]}" stroke-opacity="0.09"/>
    <text x="70" y="82" fill="${colors[3]}" fill-opacity="0.6" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="4">A NOVA TEST LIBRARY PRESENTATION</text>
    <text x="1010" y="${startY - 60}" fill="${colors[3]}" fill-opacity="0.8" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="5">${text.year}</text>
    ${lines.map((line, index) => `<text x="1006" y="${startY + index * fontSize * 1.01}" fill="#f8f3ff" fill-opacity="0.9" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-2">${esc(line)}</text>`).join('')}
    <text x="1010" y="${startY + lines.length * fontSize + 20}" fill="${colors[3]}" fill-opacity="0.58" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600" letter-spacing="3">${text.genres}</text>
    <text x="1010" y="834" fill="#f7f2ff" fill-opacity="0.32" font-family="Segoe UI, Arial, sans-serif" font-size="10" letter-spacing="3">MOCK PLEX · TEST ARTWORK</text>
    <text x="1436" y="820" fill="${colors[3]}" fill-opacity="0.5" font-family="Segoe UI, Arial, sans-serif" font-size="48">✦</text>
    <rect width="1600" height="900" filter="url(#noise-${id})" opacity="0.4"/>
  </svg>`
}

function still(subject) {
  const id = `s${hash(subject.seed)}`
  const colors = palette(subject.seed)
  const rawTitle = String(subject.subtitle || subject.title)
  const title = rawTitle.startsWith('S')
    ? rawTitle.split(' · ').slice(2).join(' · ')
    : rawTitle
  const lines = wrap(title, 25)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    ${defs(id, colors)}
    <rect width="640" height="360" fill="url(#bg-${id})"/>
    <rect width="640" height="360" fill="url(#glow-${id})"/>
    <circle cx="530" cy="90" r="180" fill="none" stroke="${colors[3]}" stroke-opacity="0.18"/>
    <ellipse cx="520" cy="96" rx="72" ry="170" fill="none" stroke="${colors[2]}" stroke-opacity="0.3" transform="rotate(38 520 96)"/>
    <text x="32" y="52" fill="${colors[3]}" fill-opacity="0.76" font-family="Segoe UI, Arial, sans-serif" font-size="9" font-weight="700" letter-spacing="2.6">${esc(subject.title).toUpperCase()}</text>
    <text x="32" y="82" fill="${colors[3]}" fill-opacity="0.5" font-family="Segoe UI, Arial, sans-serif" font-size="8" letter-spacing="2">${esc(subject.subtitle).toUpperCase()}</text>
    ${lines.map((line, index) => `<text x="30" y="${248 + index * 34}" fill="#f7f2ff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.5">${esc(line)}</text>`).join('')}
    <text x="32" y="326" fill="#f7f2ff" fill-opacity="0.3" font-family="Segoe UI, Arial, sans-serif" font-size="8" letter-spacing="2.4">MOCK PLEX · TEST STILL</text>
    <rect width="640" height="360" filter="url(#noise-${id})" opacity="0.45"/>
  </svg>`
}

export function renderArt(subject, kind) {
  if (!subject) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#0d0a13"/><text x="200" y="300" text-anchor="middle" fill="#8f7aa8" font-family="sans-serif" font-size="14">NOVA test artwork</text></svg>`
  }
  if (kind === 'still') return still(subject)
  if (kind === 'backdrop') return backdrop(subject)
  return poster(subject)
}
