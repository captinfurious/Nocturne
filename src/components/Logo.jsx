import { useId } from 'react'

export function NocturneMark({ size = 30, className = '' }) {
  const gradientId = useId().replace(/:/g, '')
  return (
    <svg
      className={`nocturne-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#ff4a50" />
          <stop offset="1" stopColor="#e50914" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="27" fill="rgba(229,9,20,0.08)" />
      <path
        d="M32 7.5 36.3 27.7 56.5 32 36.3 36.3 32 56.5 27.7 36.3 7.5 32 27.7 27.7Z"
        fill={`url(#${gradientId})`}
      />
      <circle cx="48.5" cy="15.5" r="2.2" fill="#ffffff" />
    </svg>
  )
}

export function NocturneBrand({ tagline = true, className = '' }) {
  return (
    <div className={`brand ${className}`.trim()}>
      <div className="brand__lockup">
        <NocturneMark size={26} />
        <span className="brand__word">NOCTURNE</span>
      </div>
      {tagline ? <span className="brand__tagline">Private cinema</span> : null}
    </div>
  )
}
