import { useContext } from 'react'
import { UserContext } from './userContext'

export function useCurrentUser() {
  const context = useContext(UserContext)

  if (!context) {
    throw new Error('useCurrentUser must be used inside UserProvider')
  }

  return context
}
