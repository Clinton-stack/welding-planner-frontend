import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { demoUsers } from '../data/demoData'
import { UserContext } from './userContext'
import type { UserContextValue } from './userContext'

const storageKey = 'shift-plan-demo-user-id'

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUserId, setCurrentUserIdState] = useState(() => readStoredUserId())
  const currentUser = demoUsers.find((user) => user.id === currentUserId) ?? demoUsers[0]

  const setCurrentUserId = useCallback((userId: string) => {
    const nextUser = demoUsers.find((user) => user.id === userId)

    if (!nextUser) {
      return
    }

    localStorage.setItem(storageKey, nextUser.id)
    setCurrentUserIdState(nextUser.id)
  }, [])

  const value = useMemo<UserContextValue>(
    () => ({
      currentUser,
      setCurrentUserId,
      users: demoUsers,
    }),
    [currentUser, setCurrentUserId],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

function readStoredUserId() {
  try {
    const storedUserId = localStorage.getItem(storageKey)

    return demoUsers.some((user) => user.id === storedUserId) ? storedUserId : demoUsers[0].id
  } catch {
    return demoUsers[0].id
  }
}
