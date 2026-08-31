import { createContext } from 'react'
import type { DemoUser } from '../data/demoData'

export type UserContextValue = {
  currentUser: DemoUser
  setCurrentUserId: (userId: string) => void
  users: DemoUser[]
}

export const UserContext = createContext<UserContextValue | undefined>(undefined)
