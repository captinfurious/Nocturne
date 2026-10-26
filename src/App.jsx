import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Route, Routes } from 'react-router-dom'
import { api } from './api.js'
import { NovaContext } from './app-context.js'
import { AppShell } from './components/AppShell.jsx'
import { NovaMark } from './components/Logo.jsx'
import { useRemote } from './hooks/useRemote.js'
import { HomePage } from './pages/HomePage.jsx'
import { LibraryPage } from './pages/LibraryPage.jsx'
import { NotFoundPage } from './pages/NotFoundPage.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'
import { SetupPage } from './pages/SetupPage.jsx'
import { TitlePage } from './pages/TitlePage.jsx'

function Splash({ label = 'Preparing your cinema' }) {
  return (
    <div className="boot-screen" role="status" aria-live="polite">
      <div className="boot-screen__halo" aria-hidden="true">
        <NovaMark size={58} />
      </div>
      <p className="boot-screen__word">NOVA</p>
      <p className="boot-screen__label">{label}<span className="boot-screen__dots" aria-hidden="true">…</span></p>
    </div>
  )
}

function BootError({ error, onRetry }) {
  return (
    <div className="boot-screen boot-screen--error">
      <div className="boot-screen__halo" aria-hidden="true">
        <NovaMark size={50} />
      </div>
      <p className="eyebrow">Local server offline</p>
      <h1>NOVA can’t reach its own engine.</h1>
      <p>{error?.message || 'The NOVA API is not running.'}</p>
      <div className="boot-error__help">
        <p>Open PowerShell in the NOVA folder and run:</p>
        <code>npm run dev</code>
        <p>Then open <strong>http://127.0.0.1:5173</strong>.</p>
      </div>
      <button type="button" className="button button--primary" onClick={onRetry}>
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  )
}

export default function App() {
  const healthRequest = useCallback((signal) => api.health(signal), [])
  const {
    data: health,
    error: healthError,
    loading: healthLoading,
    reload: reloadHealth,
  } = useRemote(healthRequest)
  const [libraries, setLibraries] = useState([])
  const [librariesNonce, setLibrariesNonce] = useState(0)

  const reloadLibraries = useCallback(() => {
    setLibrariesNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!health?.configured || !health?.reachable) {
      setLibraries([])
      return undefined
    }

    const controller = new AbortController()
    let active = true
    api.libraries(controller.signal)
      .then((result) => {
        if (!active) return
        setLibraries(result.libraries || [])
      })
      .catch((failure) => {
        if (!active || failure?.name === 'AbortError') return
        setLibraries([])
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [health?.configured, health?.reachable, librariesNonce])

  const contextValue = useMemo(() => ({
    health,
    healthError,
    healthLoading,
    reloadHealth,
    libraries,
    reloadLibraries,
  }), [health, healthError, healthLoading, reloadHealth, libraries, reloadLibraries])

  if (!health && healthLoading) return <Splash />

  if (!health && healthError) {
    return <BootError error={healthError} onRetry={reloadHealth} />
  }

  if (!health) return <Splash />

  if (!health.configured) {
    return <SetupPage onConnected={reloadHealth} />
  }

  if (health.authError) {
    return (
      <SetupPage
        onConnected={reloadHealth}
        reason={health.connectionError || 'Plex rejected the saved sign-in token.'}
      />
    )
  }

  return (
    <NovaContext.Provider value={contextValue}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="library/:key" element={<LibraryPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="title/:key" element={<TitlePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </NovaContext.Provider>
  )
}
