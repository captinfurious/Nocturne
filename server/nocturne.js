import {
  getChildren,
  getLibraries,
  getMetadata,
  getOnDeck,
  getRecentlyAdded,
  getSectionGenres,
  getSectionItems,
  getSimilar,
  searchPlex,
} from './plex.js'

const POSTER_WIDTH = 400
const POSTER_HEIGHT = 600
const WIDE_WIDTH = 960
const WIDE_HEIGHT = 540
const HERO_WIDTH = 1920
const HERO_HEIGHT = 1080

const SORT_MAP = {
  recent: 'addedAt:desc',
  title: 'titleSort:asc',
  rating: 'audienceRating:desc',
  year: 'year:desc',
  popular: 'viewCount:desc',
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function intOrZero(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function imageUrl(path, width, height) {
  if (!path || typeof path !== 'string') return null
  const params = new URLSearchParams({
    path,
    w: String(width),
    h: String(height),
  })
  return `/api/image?${params.toString()}`
}

function imagesFor(raw, { episode = false } = {}) {
  const posterPath = episode
    ? raw.grandparentThumb || raw.thumb
    : raw.thumb || raw.grandparentThumb
  const backdropPath = raw.grandparentArt || raw.art || raw.banner || raw.thumb

  return {
    poster: imageUrl(posterPath, POSTER_WIDTH, POSTER_HEIGHT),
    wide: imageUrl(backdropPath, WIDE_WIDTH, WIDE_HEIGHT),
    hero: imageUrl(backdropPath, HERO_WIDTH, HERO_HEIGHT),
    episode: episode ? imageUrl(raw.thumb || backdropPath, 640, 360) : null,
  }
}

function uniqueItems(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item || !item.ratingKey || seen.has(item.ratingKey)) return false
    seen.add(item.ratingKey)
    return true
  })
}

function latestPerSeries(items) {
  const seenSeries = new Set()
  return items.filter((item) => {
    if (!item || item.type === 'movie') return true
    const seriesKey = String(item.grandparentRatingKey || item.ratingKey || '')
    if (!seriesKey || seenSeries.has(seriesKey)) return false
    seenSeries.add(seriesKey)
    return true
  })
}

export function normalizeItem(raw) {
  if (!raw) return null

  const type = raw.type === 'show'
    ? 'show'
    : raw.type === 'episode'
      ? 'episode'
      : 'movie'
  const isEpisode = type === 'episode'
  const ratingKey = String(raw.ratingKey || '')
  if (!ratingKey) return null

  const duration = intOrZero(raw.duration)
  const viewOffset = intOrZero(raw.viewOffset)
  const leafCount = intOrZero(raw.leafCount)
  const viewedLeafCount = intOrZero(raw.viewedLeafCount)
  const media = Array.isArray(raw.Media) ? raw.Media[0] : null
  const title = isEpisode ? raw.grandparentTitle || raw.title || 'Untitled' : raw.title || 'Untitled'
  const episodeCode = isEpisode && raw.parentIndex != null && raw.index != null
    ? `S${raw.parentIndex} · E${raw.index}`
    : null

  return {
    id: ratingKey,
    ratingKey,
    type,
    title,
    episodeTitle: isEpisode ? raw.title || null : null,
    episodeCode,
    index: numberOrNull(raw.index),
    parentIndex: numberOrNull(raw.parentIndex),
    parentTitle: raw.parentTitle || null,
    seriesTitle: isEpisode ? raw.grandparentTitle || null : null,
    seriesRatingKey: isEpisode && raw.grandparentRatingKey
      ? String(raw.grandparentRatingKey)
      : ratingKey,
    year: numberOrNull(raw.year),
    summary: raw.summary || raw.tagline || '',
    tagline: raw.tagline || '',
    contentRating: raw.contentRating || null,
    rating: numberOrNull(raw.rating),
    audienceRating: numberOrNull(raw.audienceRating),
    duration,
    viewOffset,
    viewCount: intOrZero(raw.viewCount),
    progress: duration > 0 && viewOffset > 0 ? Math.min(1, viewOffset / duration) : 0,
    leafCount,
    viewedLeafCount,
    showProgress: leafCount > 0 ? Math.min(1, viewedLeafCount / leafCount) : 0,
    genres: Array.isArray(raw.Genre) ? raw.Genre.map((genre) => genre.tag).filter(Boolean) : [],
    directors: Array.isArray(raw.Director) ? raw.Director.map((person) => person.tag).filter(Boolean) : [],
    writers: Array.isArray(raw.Writer) ? raw.Writer.map((person) => person.tag).filter(Boolean) : [],
    cast: Array.isArray(raw.Role)
      ? raw.Role.slice(0, 12).map((person) => ({
          name: person.tag,
          role: person.role || null,
        })).filter((person) => person.name)
      : [],
    studio: raw.studio || null,
    addedAt: intOrZero(raw.addedAt),
    originallyAvailableAt: raw.originallyAvailableAt || null,
    videoResolution: media?.videoResolution || null,
    container: media?.container || null,
    videoCodec: media?.videoCodec || null,
    audioCodec: media?.audioCodec || null,
    images: imagesFor(raw, { episode: isEpisode }),
  }
}

function normalizeSeason(raw) {
  return {
    id: String(raw.ratingKey || ''),
    ratingKey: String(raw.ratingKey || ''),
    title: raw.title || (raw.index ? `Season ${raw.index}` : 'Season'),
    index: numberOrNull(raw.index),
    year: numberOrNull(raw.year),
    summary: raw.summary || '',
    leafCount: intOrZero(raw.leafCount),
    viewedLeafCount: intOrZero(raw.viewedLeafCount),
    images: {
      poster: imageUrl(raw.thumb || raw.parentThumb, POSTER_WIDTH, POSTER_HEIGHT),
      wide: imageUrl(raw.art || raw.parentArt, WIDE_WIDTH, WIDE_HEIGHT),
    },
  }
}

function normalizeSearchItems(hubs) {
  const items = []
  for (const hub of Array.isArray(hubs) ? hubs : []) {
    for (const raw of Array.isArray(hub.Metadata) ? hub.Metadata : []) {
      if (!['movie', 'show', 'episode'].includes(raw.type)) continue
      const normalized = normalizeItem(raw)
      if (normalized) items.push(normalized)
    }
  }
  return uniqueItems(items).slice(0, 48)
}

async function safe(promise, fallback) {
  try {
    return await promise
  } catch {
    return fallback
  }
}

function row(id, title, subtitle, layout, rawItems, limit = 24) {
  const items = uniqueItems(rawItems.map(normalizeItem).filter(Boolean)).slice(0, limit)
  return items.length ? { id, title, subtitle, layout, items } : null
}

function pickHero({ recent, popular, topRated }) {
  const pool = uniqueItems([
    ...recent.filter((item) => item.type === 'movie'),
    ...topRated,
    ...popular,
    ...recent.filter((item) => item.type === 'show'),
  ])
    .map(normalizeItem)
    .filter((item) => item && ['movie', 'show'].includes(item.type))

  const withArtworkAndStory = pool.find((item) =>
    item.images.hero && item.summary && item.summary.length > 40,
  )
  const withArtwork = pool.find((item) => item.images.hero)
  const hero = withArtworkAndStory || withArtwork || pool[0] || null
  if (!hero) return null

  return {
    ...hero,
    eyebrow: hero.type === 'movie' ? 'Featured film' : 'Featured series',
  }
}

function orderGenres(list) {
  return [...list].sort((a, b) => (b.count || 0) - (a.count || 0))
}

async function buildGenreRows(movieGenres, showGenres, movieSection, showSection) {
  const candidates = []
  if (movieSection) {
    for (const genre of orderGenres(movieGenres).slice(0, 6)) {
      candidates.push({ ...genre, type: 'movie', sectionKey: movieSection.key })
    }
  }
  if (showSection) {
    for (const genre of orderGenres(showGenres).slice(0, 6)) {
      candidates.push({ ...genre, type: 'show', sectionKey: showSection.key })
    }
  }

  const results = await Promise.allSettled(
    candidates.map(async (genre) => {
      const container = await getSectionItems(genre.sectionKey, {
        genre: genre.key,
        sort: 'audienceRating:desc',
        size: 20,
      })
      const items = uniqueItems((container.Metadata || []).map(normalizeItem).filter(Boolean))
      return { genre, items }
    }),
  )

  const rows = []
  const usedNames = new Set()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const { genre, items } = result.value
    if (items.length < 5) continue
    const nameKey = genre.title.toLowerCase()
    if (usedNames.has(nameKey)) continue
    usedNames.add(nameKey)
    rows.push({
      id: `genre-${genre.type}-${genre.key}`,
      title: genre.title,
      subtitle: genre.type === 'movie' ? 'Film collection' : 'Series collection',
      layout: 'landscape',
      items: items.slice(0, 20),
    })
    if (rows.length >= 4) break
  }
  return rows
}

export async function buildHome() {
  const libraries = await getLibraries()
  const movieSections = libraries.filter((library) => library.type === 'movie')
  const showSections = libraries.filter((library) => library.type === 'show')
  const movieSection = movieSections[0] || null
  const showSection = showSections[0] || null

  if (!movieSection && !showSection) {
    return {
      hero: null,
      rows: [],
      libraries: [],
      generatedAt: new Date().toISOString(),
    }
  }

  const [
    onDeck,
    recentlyAdded,
    popularContainers,
    topRatedContainers,
    showsContainers,
    movieGenres,
    showGenres,
  ] = await Promise.all([
    safe(getOnDeck(20), []),
    safe(getRecentlyAdded(30), []),
    Promise.all(
      movieSections.map((section) =>
        safe(getSectionItems(section.key, { sort: 'viewCount:desc', size: 20 }), {}),
      ),
    ),
    Promise.all(
      movieSections.map((section) =>
        safe(getSectionItems(section.key, { sort: 'audienceRating:desc', size: 20 }), {}),
      ),
    ),
    Promise.all(
      showSections.map((section) =>
        safe(getSectionItems(section.key, { sort: 'addedAt:desc', size: 20 }), {}),
      ),
    ),
    movieSection ? safe(getSectionGenres(movieSection.key), []) : Promise.resolve([]),
    showSection ? safe(getSectionGenres(showSection.key), []) : Promise.resolve([]),
  ])

  const popular = uniqueItems(popularContainers.flatMap((container) => container.Metadata || []))
  const topRated = uniqueItems(topRatedContainers.flatMap((container) => container.Metadata || []))
  const shows = uniqueItems(showsContainers.flatMap((container) => container.Metadata || []))
  const recent = latestPerSeries(
    recentlyAdded.filter((item) => ['movie', 'show', 'episode'].includes(item.type)),
  )
  const continueItems = onDeck.filter((item) => ['movie', 'episode'].includes(item.type))
  const ranked = uniqueItems([...popular, ...shows, ...topRated]).slice(0, 10)

  const rows = [
    row(
      'continue-watching',
      'Continue Watching',
      'Pick up exactly where you left off',
      'landscape',
      continueItems,
      18,
    ),
    row(
      'recently-added',
      'Recently Added',
      'The newest arrivals in your Plex library',
      'landscape',
      recent,
      24,
    ),
    row(
      'top-10',
      'Top 10 in Your Library Today',
      null,
      'ranked',
      ranked,
      10,
    ),
    row(
      'popular-movies',
      'Popular Movies',
      'What gets watched most on your server',
      'landscape',
      popular,
      20,
    ),
    row(
      'tv-shows',
      'TV Shows',
      showSection ? 'Series ready to binge' : null,
      'landscape',
      shows,
      20,
    ),
    row(
      'top-rated',
      'Top Rated',
      'The films your library rates highest',
      'landscape',
      topRated,
      20,
    ),
  ].filter(Boolean)

  const genreRows = await buildGenreRows(
    movieGenres.filter((genre) => !['Movie', 'TV Movie'].includes(genre.title)),
    showGenres.filter((genre) => !['TV Movie'].includes(genre.title)),
    movieSection,
    showSection,
  )

  const hero = pickHero({ recent, popular, topRated })

  return {
    hero,
    rows: [...rows, ...genreRows],
    libraries: libraries.filter((library) => ['movie', 'show'].includes(library.type)),
    generatedAt: new Date().toISOString(),
  }
}

export async function buildLibraryPage(sectionKey, { sort = 'recent', start = 0, size = 60 } = {}) {
  const libraries = await getLibraries()
  const library = libraries.find((entry) => entry.key === String(sectionKey))
  if (!library || !['movie', 'show'].includes(library.type)) {
    return null
  }

  const plexSort = SORT_MAP[sort] || SORT_MAP.recent
  const container = await getSectionItems(sectionKey, {
    sort: plexSort,
    start,
    size,
  })
  const items = uniqueItems((container.Metadata || []).map(normalizeItem).filter(Boolean))

  return {
    library: {
      key: library.key,
      title: library.title,
      type: library.type,
    },
    items,
    start: intOrZero(container.offset),
    size: items.length,
    totalSize: intOrZero(container.totalSize) || items.length,
    sort,
  }
}

export async function buildSearch(query) {
  const hubs = await searchPlex(query)
  const items = normalizeSearchItems(hubs)
  return {
    query,
    movies: items.filter((item) => item.type === 'movie'),
    shows: items.filter((item) => item.type === 'show' || item.type === 'episode'),
    total: items.length,
  }
}

export async function buildTitlePage(ratingKey) {
  const raw = await getMetadata(ratingKey)
  if (!raw) return null

  const item = normalizeItem(raw)
  if (!item) return null

  let seasons = []
  if (item.type === 'show') {
    const children = await safe(getChildren(ratingKey), [])
    seasons = children
      .filter((child) => child.type === 'season')
      .map(normalizeSeason)
      .filter((season) => season.ratingKey)
  }

  const [similar, onDeck] = await Promise.all([
    safe(getSimilar(ratingKey), []),
    safe(getOnDeck(50), []),
  ])
  const related = uniqueItems(similar.map(normalizeItem).filter(Boolean)).slice(0, 18)
  const resumeRaw = onDeck.find((entry) =>
    String(entry.ratingKey) === String(ratingKey)
    || String(entry.grandparentRatingKey) === String(ratingKey))
  const resumeItem = normalizeItem(resumeRaw)

  return {
    item,
    seasons,
    related,
    resumeItem,
    resumeEpisode: resumeItem?.type === 'episode' ? resumeItem : null,
  }
}

export async function buildSeasonEpisodes(seasonKey) {
  const raw = await getMetadata(seasonKey)
  if (!raw || raw.type !== 'season') return null

  const children = await getChildren(seasonKey)
  return {
    season: normalizeSeason(raw),
    episodes: uniqueItems(
      children
        .filter((child) => child.type === 'episode')
        .map(normalizeItem)
        .filter(Boolean),
    ),
  }
}

export { imageUrl }
