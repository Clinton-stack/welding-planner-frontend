import { useContext } from 'react'
import { PlanningRequestContext } from './requestContext'

export function usePlanningRequests() {
  const context = useContext(PlanningRequestContext)

  if (!context) {
    throw new Error('usePlanningRequests must be used inside PlanningRequestProvider')
  }

  return context
}
