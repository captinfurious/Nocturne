export function formatRuntime(value) {
  const minutes = Math.max(0, Math.round(Number(value) / 60000))
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours && remainder) return `${hours}h ${remainder}m`
  if (hours) return `${hours}h`
  return `${remainder}m`
}

export function formatRemaining(item) {
  if (!item?.duration || !item?.viewOffset) return null
  const remaining = Math.max(0, item.duration - item.viewOffset)
  if (remaining < 60_000) return 'Almost finished'
  return `${formatRuntime(remaining)} left`
}

export function formatRating(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return number.toFixed(1)
}

export function formatYear(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? String(number) : null
}

export function formatCount(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '0'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(number)
}

export function formatAdded(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const date = new Date(seconds * 1000)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date)
}

export function formatDate(value) {
  if (!value) return null

  let date
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-').map(Number)
    date = new Date(year, month - 1, day)
  } else {
    date = new Date(value)
  }

  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatEpisodeCode(item) {
  if (!item) return null
  if (item.episodeCode) return item.episodeCode
  if (item.type === 'season' && item.index) return `Season ${item.index}`
  return null
}

export function itemLabel(item) {
  if (!item) return ''
  if (item.type === 'episode') {
    return [item.episodeCode, item.episodeTitle].filter(Boolean).join(' · ')
  }
  return [formatYear(item.year), item.contentRating].filter(Boolean).join(' · ')
}

export function initials(value, fallback = 'N') {
  if (!value) return fallback
  const parts = String(value).trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase()).join('') || fallback
}

export function detailHref(item) {
  if (!item) return '/'
  return `/title/${item.seriesRatingKey || item.ratingKey || item.id}`
}

export function isPlayable(item) {
  return item?.type === 'movie' || item?.type === 'episode'
}
