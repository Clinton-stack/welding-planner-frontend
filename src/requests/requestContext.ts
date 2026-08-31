import { createContext } from 'react'
import type { ShiftCode } from '../data/demoData'

export type PlanningRequestStatus = 'pending' | 'approved' | 'rejected'
export type PlanningRequestType = 'pull_forward' | 'repair' | 'unplanned'

export type PlanningRequest = {
  id: string
  anlageId: string
  operator: string
  shift: ShiftCode
  faNumber: string
  project: string
  articleNo: string
  step: string
  fixture: string
  qty: number
  requestType: PlanningRequestType
  reason: string
  comment: string
  matchedJobId?: string
  plannedDate?: string
  plannedShift?: ShiftCode
  plannedShiftName?: string
  status: PlanningRequestStatus
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  supervisorNote?: string
}

export type NewPlanningRequest = Omit<PlanningRequest, 'createdAt' | 'id' | 'status'>

export type PlanningRequestContextValue = {
  addRequest: (request: NewPlanningRequest) => PlanningRequest
  approveRequest: (requestId: string, supervisorName: string, note?: string) => void
  pendingCount: number
  rejectRequest: (requestId: string, supervisorName: string, note?: string) => void
  requests: PlanningRequest[]
  updateRequest: (requestId: string, nextRequest: Partial<PlanningRequest>) => void
}

export const PlanningRequestContext = createContext<PlanningRequestContextValue | null>(null)
