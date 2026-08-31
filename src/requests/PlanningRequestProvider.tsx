import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { PlanningRequestContext } from './requestContext'
import type { NewPlanningRequest, PlanningRequest, PlanningRequestContextValue } from './requestContext'

const storageKey = 'shift-plan-demo-planning-requests'

const seedRequests: PlanningRequest[] = [
  {
    id: 'req-001',
    anlageId: 'ap2904',
    operator: 'M. Weber',
    shift: 'F',
    faNumber: 'FA-240611-108',
    project: 'Pesa',
    articleNo: '95',
    step: 'Schritt 1',
    fixture: 'Vorrichtung B',
    qty: 1,
    requestType: 'repair',
    reason: 'Schweissnaht reparieren',
    comment: 'Naht 10 bis 14 reparieren.',
    status: 'pending',
    createdAt: '08.06.2026 09:42',
  },
  {
    id: 'req-002',
    anlageId: 'ap2904',
    operator: 'L. Schmidt',
    shift: 'S',
    faNumber: 'FA-240611-109',
    project: 'BVG Radkasten',
    articleNo: '13-01',
    step: 'Schritt 2',
    fixture: 'Vorrichtung A',
    qty: 2,
    requestType: 'unplanned',
    reason: 'Material fehlt',
    comment: 'Planartikel nicht verfuegbar, Ersatzartikel ist vorbereitet.',
    status: 'pending',
    createdAt: '08.06.2026 14:18',
  },
  {
    id: 'req-003',
    anlageId: 'ap2904',
    operator: 'M. Weber',
    shift: 'F',
    faNumber: 'FA-240611-099',
    project: 'Pesa TB',
    articleNo: '101-44',
    step: 'Schritt 3',
    fixture: 'Vorrichtung C',
    qty: 1,
    requestType: 'pull_forward',
    reason: 'Material fehlt',
    comment: 'Teil fuer Spaetschicht ist schon geheftet und kann vorgezogen werden.',
    matchedJobId: 'job-007',
    plannedDate: '08.06.2026',
    plannedShift: 'S',
    plannedShiftName: 'Spaetschicht',
    status: 'pending',
    createdAt: '08.06.2026 10:06',
  },
]

export function PlanningRequestProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState(() => readStoredRequests())

  const persistRequests = useCallback((nextRequests: PlanningRequest[]) => {
    setRequests(nextRequests)
    localStorage.setItem(storageKey, JSON.stringify(nextRequests))
  }, [])

  const addRequest = useCallback(
    (request: NewPlanningRequest) => {
      const nextRequest: PlanningRequest = {
        ...request,
        id: `req-${Date.now()}`,
        status: 'pending',
        createdAt: new Intl.DateTimeFormat('de-DE', {
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date()),
      }

      persistRequests([nextRequest, ...requests])

      return nextRequest
    },
    [persistRequests, requests],
  )

  const updateRequest = useCallback(
    (requestId: string, nextRequest: Partial<PlanningRequest>) => {
      persistRequests(requests.map((request) => (request.id === requestId ? { ...request, ...nextRequest } : request)))
    },
    [persistRequests, requests],
  )

  const approveRequest = useCallback(
    (requestId: string, supervisorName: string, note?: string) => {
      updateRequest(requestId, {
        status: 'approved',
        reviewedAt: new Intl.DateTimeFormat('de-DE', {
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date()),
        reviewedBy: supervisorName,
        supervisorNote: note,
      })
    },
    [updateRequest],
  )

  const rejectRequest = useCallback(
    (requestId: string, supervisorName: string, note?: string) => {
      updateRequest(requestId, {
        status: 'rejected',
        reviewedAt: new Intl.DateTimeFormat('de-DE', {
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date()),
        reviewedBy: supervisorName,
        supervisorNote: note,
      })
    },
    [updateRequest],
  )

  const pendingCount = requests.filter((request) => request.status === 'pending').length

  const value = useMemo<PlanningRequestContextValue>(
    () => ({
      addRequest,
      approveRequest,
      pendingCount,
      rejectRequest,
      requests,
      updateRequest,
    }),
    [addRequest, approveRequest, pendingCount, rejectRequest, requests, updateRequest],
  )

  return <PlanningRequestContext.Provider value={value}>{children}</PlanningRequestContext.Provider>
}

function readStoredRequests() {
  try {
    const storedRequests = localStorage.getItem(storageKey)

    if (!storedRequests) {
      return seedRequests
    }

    const parsedRequests = JSON.parse(storedRequests)

    return Array.isArray(parsedRequests) ? parsedRequests.map(normalizeRequest) : seedRequests
  } catch {
    return seedRequests
  }
}

function normalizeRequest(request: PlanningRequest) {
  return {
    ...request,
    requestType: request.requestType ?? 'unplanned',
  }
}
