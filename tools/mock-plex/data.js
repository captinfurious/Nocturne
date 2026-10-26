const NOW = Math.floor(Date.now() / 1000)
const DAY = 86_400

const CAST = [
  ['Iris Vane', 'Elias North', 'Mara Voss', 'Theo Bell'],
  ['Nadia Kerr', 'Owen March', 'Lena Cho', 'Rafe Mercer'],
  ['Sana Idris', 'Milo Grant', 'June Harrow', 'Caspar Wren'],
  ['Ada Rook', 'Tomas Vale', 'Nell Avery', 'Ivo Dane'],
]

const movies = [
  {
    id: 101, title: 'Violet Horizon', year: 2024, rating: 8.4, audienceRating: 8.8,
    contentRating: 'PG-13', minutes: 138, genres: ['Science Fiction', 'Drama'],
    director: 'Mara Voss', addedDays: 2, viewCount: 42, resolution: '4k', studio: 'Northlight Pictures',
    tagline: 'Some horizons only appear after dark.',
    summary: 'A cartographer chasing a signal beyond the mapped world discovers a coastline that appears only at dusk — and a version of her own life she never chose. A patient, luminous science-fiction drama about the maps we make to avoid going home.',
    cast: CAST[0],
  },
  {
    id: 102, title: 'The Last Light', year: 2025, rating: 7.9, audienceRating: 8.2,
    contentRating: 'R', minutes: 121, genres: ['Drama', 'Mystery'],
    director: 'Owen March', addedDays: 1, viewCount: 31, resolution: '1080', studio: 'Paper Lantern',
    tagline: 'The town went dark. The truth stayed on.',
    summary: 'When a coastal town loses its power for a week, an estranged sisters’ reunion becomes an investigation into what their father left behind in the lighthouse. A slow-burning mystery with a devastating final act.',
    cast: CAST[1],
  },
  {
    id: 103, title: 'Static Bloom', year: 2023, rating: 7.4, audienceRating: 7.6,
    contentRating: 'R', minutes: 109, genres: ['Science Fiction', 'Thriller'],
    director: 'Lena Cho', addedDays: 14, viewCount: 65, resolution: '1080', studio: 'Glasshouse Films',
    tagline: 'Every frequency leaves a mark.',
    summary: 'A radio engineer begins hearing tomorrow’s broadcasts in the static of an abandoned relay station. As the predictions grow more personal, she has to decide whether to stop the future or let it happen. Tense, strange, and impossible to shake.',
    cast: CAST[2],
  },
  {
    id: 104, title: 'The Quiet Machine', year: 2022, rating: 7.7, audienceRating: 7.9,
    contentRating: 'PG-13', minutes: 116, genres: ['Drama', 'Science Fiction'],
    director: 'Theo Bell', addedDays: 40, viewCount: 12, resolution: '1080', studio: 'Meridian House',
    tagline: 'It never needed to be loud.',
    summary: 'A retired engineer builds a machine that can remember what people forget. His daughter returns home to dismantle it. A restrained family story about grief, memory, and the frightening comfort of starting over.',
    cast: CAST[3],
  },
  {
    id: 105, title: 'Midnight Cartography', year: 2025, rating: 8.1, audienceRating: 8.5,
    contentRating: 'PG-13', minutes: 132, genres: ['Adventure', 'Mystery'],
    director: 'Ada Rook', addedDays: 3, viewCount: 27, resolution: '4k', studio: 'Northlight Pictures',
    tagline: 'The city redraws itself at midnight.',
    summary: 'A night-shift courier discovers that the streets of her city rearrange themselves after 12 a.m. — and that someone has been leaving her a map. A romantic, vertiginous adventure through a metropolis that refuses to stay still.',
    cast: CAST[0],
  },
  {
    id: 106, title: 'A House of Glass', year: 2021, rating: 6.9, audienceRating: 7.1,
    contentRating: 'R', minutes: 104, genres: ['Drama', 'Thriller'],
    director: 'Tomas Vale', addedDays: 60, viewCount: 9, resolution: '1080', studio: 'Paper Lantern',
    tagline: 'You can see everything. You can touch nothing.',
    summary: 'An architect’s perfect glass house becomes the stage for a family’s slow unravelling during a summer heatwave. A sharp, claustrophobic chamber piece about the stories we build around ourselves.',
    cast: CAST[1],
  },
  {
    id: 107, title: 'Fault Lines', year: 2024, rating: 7.6, audienceRating: 7.8,
    contentRating: 'R', minutes: 118, genres: ['Thriller', 'Crime'],
    director: 'Nell Avery', addedDays: 7, viewCount: 46, resolution: '1080', studio: 'Glasshouse Films',
    tagline: 'One crack is all it takes.',
    summary: 'A geologist mapping a dormant fault line finds a car buried at the bottom of a reservoir — and a town willing to keep it there. A tightly wound crime drama about what happens when the ground finally moves.',
    cast: CAST[2],
  },
  {
    id: 108, title: 'The Long Return', year: 2020, rating: 7.8, audienceRating: 8.0,
    contentRating: 'PG-13', minutes: 127, genres: ['Drama', 'Romance'],
    director: 'June Harrow', addedDays: 90, viewCount: 18, resolution: '1080', studio: 'Meridian House',
    tagline: 'Home is the hardest place to get back to.',
    summary: 'After fifteen years at sea, a sailor comes home to a town that has learned to live without him. An unhurried, generous film about distance, forgiveness, and the small rituals that make a place home.',
    cast: CAST[3],
  },
  {
    id: 109, title: 'Neon Orchard', year: 2023, rating: 7.2, audienceRating: 7.4,
    contentRating: 'PG', minutes: 96, genres: ['Animation', 'Family', 'Adventure'],
    director: 'Ivo Dane', addedDays: 11, viewCount: 22, resolution: '4k', studio: 'Little Orbit Studio',
    tagline: 'Grow something impossible.',
    summary: 'In a city where nothing green has grown for a hundred years, a young inventor plants a seed that glows in the dark. A warm, hand-painted animated adventure about stubborn hope and very large vegetables.',
    cast: CAST[0],
  },
  {
    id: 110, title: 'Signal Fires', year: 2022, rating: 7.5, audienceRating: 7.7,
    contentRating: 'PG-13', minutes: 111, genres: ['Mystery', 'Drama'],
    director: 'Caspar Wren', addedDays: 25, viewCount: 15, resolution: '1080', studio: 'Paper Lantern',
    tagline: 'Someone out there is listening.',
    summary: 'Two strangers on opposite sides of a mountain begin exchanging messages through a chain of old signal fires. A quiet mystery about loneliness, coincidence, and the people we reach for in the dark.',
    cast: CAST[1],
  },
  {
    id: 111, title: 'The Little Orbit', year: 2025, rating: 7.8, audienceRating: 8.1,
    contentRating: 'G', minutes: 88, genres: ['Animation', 'Family'],
    director: 'Ada Rook', addedDays: 5, viewCount: 52, resolution: '1080', studio: 'Little Orbit Studio',
    tagline: 'Everyone needs a little space.',
    summary: 'A tiny moon decides it wants a friend and leaves its planet for the first time. A gentle animated film about courage, orbit, and the long way home, made for small viewers and tired grown-ups alike.',
    cast: CAST[2],
  },
  {
    id: 112, title: 'Ashes in the Snow', year: 2021, rating: 6.7, audienceRating: 6.9,
    contentRating: 'PG-13', minutes: 101, genres: ['Drama'],
    director: 'Elias North', addedDays: 120, viewCount: 8, resolution: '1080', studio: 'Glasshouse Films',
    tagline: 'Winter keeps what we leave behind.',
    summary: 'A winter caretaker at a remote mountain lodge finds a diary that rewrites the history of the valley. A somber, beautifully photographed drama about inheritance and the stories that outlive us.',
    cast: CAST[3],
  },
]

const shows = [
  {
    id: 201, title: 'Meridian', year: 2023, rating: 8.2, audienceRating: 8.6,
    contentRating: 'TV-14', genres: ['Science Fiction', 'Drama'],
    director: 'Mara Voss', addedDays: 4, studio: 'Northlight Television',
    summary: 'A survey crew maps an ocean that should not exist. What they find on the other side of the meridian changes the shape of every map they have ever made. A patient, character-first science-fiction series.',
    cast: CAST[0],
    seasons: [
      { index: 1, titles: ['First Light', 'The Meridian Line', 'Drift', 'A Quiet Signal', 'The Far Shore', 'Homecoming'] },
      { index: 2, titles: ['Afterimage', 'Dead Reckoning', 'The Hollow Sun', 'Tidal', 'The Other Side', 'All the Stars We Lost'] },
    ],
  },
  {
    id: 202, title: 'The Understory', year: 2022, rating: 7.9, audienceRating: 8.3,
    contentRating: 'TV-MA', genres: ['Mystery', 'Drama'],
    director: 'Owen March', addedDays: 9, studio: 'Meridian House',
    summary: 'A forest ranger returns to the old-growth woods where her sister disappeared. Beneath the canopy, the town’s stories grow thicker than the moss. An atmospheric mystery about grief and the things that take root.',
    cast: CAST[1],
    seasons: [
      { index: 1, titles: ['Roots', 'Canopy', 'The Clearing', 'Nightsoil', 'Fungal Bloom', 'Old Growth'] },
      { index: 2, titles: ['Firebreak', 'The Seam', 'Understory', 'Windfall', 'The Grove', 'Regrowth'] },
    ],
  },
  {
    id: 203, title: 'Night Frequency', year: 2024, rating: 7.6, audienceRating: 7.9,
    contentRating: 'TV-MA', genres: ['Thriller', 'Mystery'],
    director: 'Lena Cho', addedDays: 6, studio: 'Glasshouse Television',
    summary: 'A late-night radio host starts receiving calls from people who have not spoken to anyone in years. Some of them are calling from the same room. A lean, addictive thriller that lives in the space between voices.',
    cast: CAST[2],
    seasons: [
      { index: 1, titles: ['Carrier Wave', 'Dead Air', 'The Numbers Station', 'Interference', 'Blackout', 'Sign Off'] },
    ],
  },
  {
    id: 204, title: 'Harbor & Vale', year: 2021, rating: 7.4, audienceRating: 7.5,
    contentRating: 'TV-PG', genres: ['Drama', 'Romance'],
    director: 'June Harrow', addedDays: 21, studio: 'Paper Lantern',
    summary: 'A harbor master and a travel writer keep meeting in the same small coastal town, a season apart every time. A warm, episodic romance about timing, tides, and the courage to stay.',
    cast: CAST[3],
    seasons: [
      { index: 1, titles: ['Low Tide', 'The Breakwater', 'Salt', 'Fog Signal', 'The Lighthouse', 'High Water'] },
      { index: 2, titles: ['Driftwood', 'The Cove', 'Undertow', 'Anchor', 'The Crossing', 'Safe Harbor'] },
    ],
  },
  {
    id: 205, title: 'Field Notes', year: 2025, rating: 7.7, audienceRating: 8.0,
    contentRating: 'TV-G', genres: ['Documentary'],
    director: 'Nell Avery', addedDays: 13, studio: 'Northlight Documentary',
    summary: 'A quiet documentary series that follows naturalists, foragers, and keepers into the places they return to every year. No score, no narration — just patient observation and the sound of the living world.',
    cast: CAST[0],
    seasons: [
      { index: 1, titles: ['The Salt Flats', 'The Old Forest', 'Riverbend', 'The Migration', 'After the Fire'] },
    ],
  },
]

const genreSet = new Set()
for (const movie of movies) for (const genre of movie.genres) genreSet.add(genre)
for (const show of shows) for (const genre of show.genres) genreSet.add(genre)
const genreList = [...genreSet].sort()
const genreIds = new Map(genreList.map((genre, index) => [genre, String(index + 1)]))

const artSubjects = new Map()
const episodeRecords = []

function addedAt(days) {
  return NOW - Math.round(days * DAY)
}

function titleSort(title) {
  return title.replace(/^(The|A|An) /, '')
}

function movieRaw(movie, extra = {}) {
  return {
    ratingKey: String(movie.id),
    key: `/library/metadata/${movie.id}`,
    type: 'movie',
    title: movie.title,
    titleSort: titleSort(movie.title),
    year: movie.year,
    originallyAvailableAt: `${movie.year}-10-18`,
    contentRating: movie.contentRating,
    summary: movie.summary,
    tagline: movie.tagline,
    rating: movie.rating,
    audienceRating: movie.audienceRating,
    duration: movie.minutes * 60_000,
    studio: movie.studio,
    thumb: `/library/metadata/${movie.id}/thumb/${NOW}`,
    art: `/library/metadata/${movie.id}/art/${NOW}`,
    addedAt: addedAt(movie.addedDays),
    updatedAt: addedAt(movie.addedDays),
    viewCount: movie.viewCount,
    Genre: movie.genres.map((tag) => ({ tag })),
    Director: [{ tag: movie.director }],
    Role: movie.cast.map((name) => ({ tag: name, role: 'Cast' })),
    Media: [{
      id: String(movie.id),
      duration: movie.minutes * 60_000,
      videoResolution: movie.resolution,
      container: 'mkv',
      videoCodec: 'hevc',
      audioCodec: 'eac3',
      bitrate: movie.resolution === '4k' ? 18000 : 8200,
    }],
    ...extra,
  }
}

function showRaw(show) {
  const allEpisodes = show.seasons.flatMap((season) =>
    season.titles.map((title, index) => episodeRecord(show, season.index, title, index + 1)))
  return {
    ratingKey: String(show.id),
    key: `/library/metadata/${show.id}`,
    type: 'show',
    title: show.title,
    titleSort: titleSort(show.title),
    year: show.year,
    originallyAvailableAt: `${show.year}-09-12`,
    contentRating: show.contentRating,
    summary: show.summary,
    tagline: '',
    rating: show.rating,
    audienceRating: show.audienceRating,
    studio: show.studio,
    duration: 54 * 60_000,
    thumb: `/library/metadata/${show.id}/thumb/${NOW}`,
    art: `/library/metadata/${show.id}/art/${NOW}`,
    addedAt: addedAt(show.addedDays),
    updatedAt: addedAt(show.addedDays),
    childCount: show.seasons.length,
    leafCount: allEpisodes.length,
    viewedLeafCount: allEpisodes.filter((episode) => episode.viewCount > 0).length,
    Genre: show.genres.map((tag) => ({ tag })),
    Director: [{ tag: show.director }],
    Role: show.cast.map((name) => ({ tag: name, role: 'Cast' })),
    Media: [{
      id: String(show.id),
      videoResolution: '1080',
      container: 'mkv',
      videoCodec: 'h264',
      audioCodec: 'aac',
    }],
  }
}

function episodeRecord(show, seasonIndex, title, episodeIndex) {
  const ratingKey = show.id * 10_000 + seasonIndex * 100 + episodeIndex
  const seasonKey = show.id * 100 + seasonIndex
  const watched = (show.id === 201 && seasonIndex === 1 && episodeIndex <= 2)
    || (show.id === 202 && seasonIndex === 1 && episodeIndex <= 3)
    || (show.id === 204 && seasonIndex === 1 && episodeIndex <= 4)
    || (show.id === 205 && episodeIndex <= 2)
  const progress = (show.id === 201 && seasonIndex === 1 && episodeIndex === 3)
    || (show.id === 202 && seasonIndex === 2 && episodeIndex === 2)
    || (show.id === 203 && seasonIndex === 1 && episodeIndex === 1)
  const duration = (47 + ((show.id + seasonIndex + episodeIndex) % 9)) * 60_000
  const offset = progress ? Math.floor(duration * (0.18 + episodeIndex * 0.06)) : 0
  const addedDays = Math.max(0.4, show.addedDays + (6 - episodeIndex) * 0.8 + (2 - seasonIndex) * 3)

  const record = {
    ratingKey: String(ratingKey),
    key: `/library/metadata/${ratingKey}`,
    type: 'episode',
    title,
    titleSort: titleSort(title),
    year: show.year,
    grandparentTitle: show.title,
    grandparentRatingKey: String(show.id),
    grandparentThumb: `/library/metadata/${show.id}/thumb/${NOW}`,
    grandparentArt: `/library/metadata/${show.id}/art/${NOW}`,
    parentTitle: `Season ${seasonIndex}`,
    parentIndex: seasonIndex,
    parentRatingKey: String(seasonKey),
    index: episodeIndex,
    summary: `${show.title} continues with “${title}.” A chapter that pulls the story deeper into ${show.genres[0].toLowerCase()} territory, with consequences that reach well beyond ${seasonIndex === 1 ? 'the season opener' : 'the season’s central mystery'}.`,
    contentRating: show.contentRating,
    duration,
    viewCount: watched ? 1 : 0,
    viewOffset: offset,
    addedAt: Math.floor(NOW - addedDays * DAY),
    updatedAt: Math.floor(NOW - addedDays * DAY),
    thumb: `/library/metadata/${ratingKey}/thumb/${NOW}`,
    art: `/library/metadata/${show.id}/art/${NOW}`,
    Media: [{
      id: String(ratingKey),
      duration,
      videoResolution: '1080',
      container: 'mkv',
      videoCodec: 'h264',
      audioCodec: 'aac',
    }],
    Genre: show.genres.map((tag) => ({ tag })),
    Director: [{ tag: show.director }],
    Role: show.cast.map((name) => ({ tag: name, role: 'Cast' })),
  }

  episodeRecords.push({ record, show, seasonIndex, seasonKey, title, episodeIndex, offset })
  artSubjects.set(ratingKey, {
    kind: 'episode',
    title: show.title,
    subtitle: `S${seasonIndex} · E${episodeIndex} · ${title}`,
    genres: show.genres,
    year: show.year,
    seed: ratingKey,
  })
  return record
}

const movieRaws = movies.map((movie) => {
  artSubjects.set(movie.id, {
    kind: 'movie',
    title: movie.title,
    subtitle: `${movie.year} · ${movie.genres.join(' / ')}`,
    genres: movie.genres,
    year: movie.year,
    seed: movie.id,
  })
  return movieRaw(movie)
})

const showRaws = shows.map((show) => {
  artSubjects.set(show.id, {
    kind: 'show',
    title: show.title,
    subtitle: `${show.year} · ${show.genres.join(' / ')}`,
    genres: show.genres,
    year: show.year,
    seed: show.id,
  })
  for (const season of show.seasons) {
    const seasonKey = show.id * 100 + season.index
    artSubjects.set(String(seasonKey), {
      kind: 'season',
      title: show.title,
      subtitle: `Season ${season.index}`,
      genres: show.genres,
      year: show.year,
      seed: seasonKey,
    })
  }
  return showRaw(show)
})

const onDeckSeeds = [
  { type: 'movie', id: 101, fraction: 0.27 },
  { type: 'episode', id: 2010103, fraction: 0.28 },
  { type: 'episode', id: 2020202, fraction: 0.17 },
  { type: 'movie', id: 105, fraction: 0.33 },
  { type: 'episode', id: 2030101, fraction: 0.11 },
]

function findRaw(type, ratingKey) {
  if (type === 'movie') return movieRaws.find((item) => item.ratingKey === String(ratingKey))
  return episodeRecords.find((item) => item.record.ratingKey === String(ratingKey))?.record
}

const onDeck = onDeckSeeds
  .map((seed) => {
    const raw = findRaw(seed.type, seed.id)
    return raw ? { ...raw, viewOffset: Math.round(raw.duration * seed.fraction) } : null
  })
  .filter(Boolean)

const recentlyAdded = [
  ...movieRaws,
  ...episodeRecords.map((item) => item.record),
]
  .sort((a, b) => b.addedAt - a.addedAt)
  .slice(0, 26)

const allTitles = [...movieRaws, ...showRaws]

const sections = [
  { key: '1', type: 'movie', title: 'Movies' },
  { key: '2', type: 'show', title: 'TV Shows' },
]

const genres = genreList.map((title) => ({ key: genreIds.get(title), title }))

function sectionRaws(sectionKey) {
  return sectionKey === '1' ? movieRaws : sectionKey === '2' ? showRaws : []
}

function seasonRaw(show, season) {
  const seasonKey = show.id * 100 + season.index
  const episodes = episodeRecords.filter(
    (item) => item.show.id === show.id && item.seasonIndex === season.index,
  )
  return {
    ratingKey: String(seasonKey),
    key: `/library/metadata/${seasonKey}`,
    type: 'season',
    title: `Season ${season.index}`,
    index: season.index,
    year: show.year,
    summary: season.index === 1
      ? `The opening chapter of ${show.title}.`
      : `The story of ${show.title} deepens in its second season.`,
    parentTitle: show.title,
    parentRatingKey: String(show.id),
    parentThumb: `/library/metadata/${show.id}/thumb/${NOW}`,
    parentArt: `/library/metadata/${show.id}/art/${NOW}`,
    thumb: `/library/metadata/${seasonKey}/thumb/${NOW}`,
    art: `/library/metadata/${show.id}/art/${NOW}`,
    addedAt: addedAt(show.addedDays),
    leafCount: episodes.length,
    viewedLeafCount: episodes.filter((item) => item.record.viewCount > 0).length,
  }
}

function childrenFor(ratingKey) {
  const show = shows.find((item) => String(item.id) === String(ratingKey))
  if (show) return show.seasons.map((season) => seasonRaw(show, season))
  const seasonMeta = episodeRecords.find((item) => item.seasonKey === Number(ratingKey))
  if (seasonMeta) {
    return episodeRecords
      .filter((item) => item.seasonKey === Number(ratingKey))
      .map((item) => item.record)
  }
  return []
}

function metadataFor(ratingKey) {
  const movie = movieRaws.find((item) => item.ratingKey === String(ratingKey))
  if (movie) return movie
  const show = showRaws.find((item) => item.ratingKey === String(ratingKey))
  if (show) return show
  const episode = episodeRecords.find((item) => item.record.ratingKey === String(ratingKey))
  if (episode) return episode.record
  for (const showDef of shows) {
    for (const season of showDef.seasons) {
      if (String(showDef.id * 100 + season.index) === String(ratingKey)) {
        return seasonRaw(showDef, season)
      }
    }
  }
  return null
}

function similarFor(ratingKey) {
  const source = metadataFor(ratingKey)
  if (!source) return []
  const sourceGenres = new Set((source.Genre || []).map((genre) => genre.tag))
  const pool = source.type === 'show' ? showRaws : movieRaws
  const scored = pool
    .filter((item) => item.ratingKey !== String(ratingKey))
    .map((item) => ({
      item,
      score: (item.Genre || []).filter((genre) => sourceGenres.has(genre.tag)).length,
    }))
    .sort((a, b) => b.score - a.score || b.item.audienceRating - a.item.audienceRating)
  return scored.slice(0, 12).map((entry) => entry.item)
}

function search(query) {
  const needle = query.toLowerCase()
  const matches = (text) => String(text || '').toLowerCase().includes(needle)
  const movieHits = movieRaws.filter((item) =>
    matches(item.title)
    || matches(item.summary)
    || (item.Genre || []).some((genre) => matches(genre.tag))
    || (item.Role || []).some((role) => matches(role.tag)))
  const showHits = showRaws.filter((item) =>
    matches(item.title)
    || matches(item.summary)
    || (item.Genre || []).some((genre) => matches(genre.tag))
    || (item.Role || []).some((role) => matches(role.tag)))
  const episodeHits = episodeRecords
    .filter((item) => matches(item.record.title))
    .map((item) => item.record)
  return { movieHits, showHits, episodeHits }
}

function getArtSubject(id) {
  return artSubjects.get(Number(id)) || artSubjects.get(String(id)) || null
}

export {
  allTitles,
  childrenFor,
  genres,
  getArtSubject,
  metadataFor,
  movieRaws,
  movies,
  onDeck,
  recentlyAdded,
  search,
  sectionRaws,
  sections,
  showRaws,
  shows,
  similarFor,
}
