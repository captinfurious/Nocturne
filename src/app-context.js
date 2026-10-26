import { createContext, useContext } from 'react'

export const NocturneContext = createContext(null)

export function useNocturne() {
  const value = useContext(NocturneContext)
  if (!value) {
    throw new Error('useNocturne must be used inside NocturneContext.Provider')
  }
  return value
}
