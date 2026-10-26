import { createContext, useContext } from 'react'

export const NovaContext = createContext(null)

export function useNova() {
  const value = useContext(NovaContext)
  if (!value) {
    throw new Error('useNova must be used inside NovaContext.Provider')
  }
  return value
}
