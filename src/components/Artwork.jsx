import { useEffect, useState } from 'react'

export function Artwork({
  src,
  alt = '',
  className = '',
  loading = 'lazy',
  fetchPriority,
  fallbackLabel = '',
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return (
      <div className={`${className} artwork-fallback`.trim()} aria-hidden="true">
        <span className="artwork-fallback__star">✦</span>
        {fallbackLabel ? <span className="artwork-fallback__label">{fallbackLabel}</span> : null}
      </div>
    )
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      onError={() => setFailed(true)}
    />
  )
}
