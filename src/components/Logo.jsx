import { useId } from 'react'

export function NovaMark({ size = 30, className = '' }) {
  const gradientId = useId().replace(/:/g, '')
  return (
    <svg
      className={`nova-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e4d9ff" />
          <stop offset="0.48" stopColor="#a281ff" />
          <stop offset="1" stopColor="#6440c4" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="27" fill="rgba(143,107,255,0.1)" />
      <path
        d="M32 7.5 36.3 27.7 56.5 32 36.3 36.3 32 56.5 27.7 36.3 7.5 32 27.7 27.7Z"
        fill={`url(#${gradientId})`}
      />
      <circle cx="48.5" cy="15.5" r="2.2" fill="#ede5ff" />
    </svg>
  )
}

export function NovaBrand({ tagline = true, className = '' }) {
  return (
    <div className={`brand ${className}`.trim()}>
      <div className="brand__lockup">
        <NovaMark size={30} />
        <span className="brand__word">NOVA</span>
      </div>
      {tagline ? <span className="brand__tagline">Private cinema</span> : null}
    </div>
  )
}
