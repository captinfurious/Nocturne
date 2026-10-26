import { useCallback, useEffect, useState } from 'react'

export function useRemote(request) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setLoading(true)
    setError(null)

    Promise.resolve()
      .then(() => request(controller.signal))
      .then((result) => {
        if (!active) return
        setData(result)
        setLoading(false)
      })
      .catch((failure) => {
        if (!active || failure?.name === 'AbortError') return
        setError(failure)
        setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [request, nonce])

  const reload = useCallback(() => {
    setNonce((value) => value + 1)
  }, [])

  return { data, error, loading, reload, setData }
}
