import { useCallback, useMemo, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'nocturne:my-list:v1'
const listeners = new Set()

function readStored() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && item.ratingKey && item.title)
  } catch {
    return []
  }
}

let snapshot = readStored()

function persist(next) {
  snapshot = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable in private browsing. The list still works for this session.
  }
  listeners.forEach((listener) => listener())
}

function summarize(item) {
  return {
    id: item.ratingKey,
    ratingKey: item.ratingKey,
    type: item.type || 'movie',
    title: item.title,
    episodeTitle: item.episodeTitle || null,
    episodeCode: item.episodeCode || null,
    year: item.year || null,
    contentRating: item.contentRating || null,
    rating: item.rating || null,
    audienceRating: item.audienceRating || null,
    duration: item.duration || 0,
    viewOffset: item.viewOffset || 0,
    progress: item.progress || 0,
    viewCount: item.viewCount || 0,
    leafCount: item.leafCount || 0,
    viewedLeafCount: item.viewedLeafCount || 0,
    showProgress: item.showProgress || 0,
    seriesRatingKey: item.seriesRatingKey || item.ratingKey,
    images: item.images || {},
    addedToListAt: Date.now(),
  }
}

export function subscribe(listener) {
  listeners.add(listener)

  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY) return
    snapshot = readStored()
    listener()
  }

  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function getSnapshot() {
  return snapshot
}

export function isInMyList(ratingKey) {
  const key = String(ratingKey)
  return snapshot.some((item) => String(item.ratingKey) === key)
}

export function toggleMyList(item) {
  if (!item?.ratingKey) return false
  const key = String(item.ratingKey)
  const existing = snapshot.find((entry) => String(entry.ratingKey) === key)

  if (existing) {
    persist(snapshot.filter((entry) => String(entry.ratingKey) !== key))
    return false
  }

  persist([summarize(item), ...snapshot])
  return true
}

export function removeFromMyList(ratingKey) {
  const key = String(ratingKey)
  const next = snapshot.filter((item) => String(item.ratingKey) !== key)
  if (next.length !== snapshot.length) persist(next)
}

export function useMyList() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const keys = useMemo(
    () => new Set(items.map((item) => String(item.ratingKey))),
    [items],
  )

  const has = useCallback((ratingKey) => keys.has(String(ratingKey)), [keys])

  return {
    items,
    count: items.length,
    has,
    toggle: toggleMyList,
    remove: removeFromMyList,
  }
}
