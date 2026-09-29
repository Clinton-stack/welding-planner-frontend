export type ShiftCode = 'F' | 'S' | 'N'
export type JobStatus = 'open' | 'running' | 'done' | 'blocked'
export type JobType = 'production' | 'repair'
export type ApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected'

export type Robot = {
  id: string
  name: string
  assetId: string
  location: string
  process: string
  isActive: boolean
}

export type Job = {
  id: string
  faNumber: string
  projekt: string
  artikelNummer: string
  schritt: number
  vorrichtung: number
  menge: number
  robotId: string
  anlageMinutes: number
  schlosserMinutes: number
  ruestMinutes: number
  jobType: JobType
  progressPercent?: number | null
  remainingAnlageMinutes?: number | null
  carriedFromPreviousShift: boolean
  schonGeheftet: boolean
  isPriority: boolean
  isForced: boolean
  isHeld: boolean
  approvalStatus?: ApprovalStatus
  createdByName?: string | null
  createdByRole?: string | null
  approvedByName?: string | null
  approvedAt?: string | null
  rejectedByName?: string | null
  rejectedAt?: string | null
  approvalNote?: string | null
  status: JobStatus
  shift: ShiftCode
  date: string
}

export type ShiftCapacity = {
  id: string
  robotId: string
  date: string
  shift: ShiftCode
  schlosserCount: number
  vorrichtungCount: number
  targetRobotPercent: number
}

export type PlannerRecommendation = {
  robot: Robot
  robotId: string
  date: string
  capacities: ShiftCapacity[]
  jobs: Job[]
  readyJobs: Job[]
  needsHeftenJobs: Job[]
  sequenceWarnings: { job: Job; warning: string }[]
  heldJobs: Job[]
  blockedJobs: Job[]
  completedJobs: Job[]
  shiftSimulations: ShiftSimulation[]
  forwardShiftSimulations?: ForwardShiftSimulation[]
  rolloverJobs: Job[]
  finalRolloverJobs: Job[]
  missingCapacityWarnings: { shift: ShiftCode; jobs: number; message: string }[]
  summary: {
    totalJobs: number
    readyJobs: number
    needsHeftenJobs: number
    sequenceWarnings: number
    heldJobs: number
    blockedJobs: number
    completedJobs: number
    rolloverJobs: number
    finalRolloverJobs: number
    missingCapacityWarnings: number
    anlageMinutesRemaining: number
    ruestMinutesRemaining: number
  }
}

export type ForwardShiftSimulation = {
  date: string
  shiftSimulations: ShiftSimulation[]
}

export type ShiftSimulation = {
  shift: ShiftCode
  workingMinutes: number
  targetRobotMinutes: number
  lockedJobs?: Job[]
  lockedRobotMinutes?: number
  plannedJobs: PlannedJobTimeline[]
  rolloverJobs: Job[]
  warnings: string[]
  robotUsedMinutes: number
  robotIdleMinutes: number
  robotUtilizationPercent: number
}

export type PlannedJobTimeline = {
  job: Job
  vorrichtung: number
  schlosserStartMinute: number | null
  schlosserEndMinute: number | null
  robotStartMinute: number
  robotEndMinute: number
  robotMinutes: number
}

export type CreateJobPayload = Omit<
  Job,
  | 'id'
  | 'progressPercent'
  | 'remainingAnlageMinutes'
  | 'carriedFromPreviousShift'
>

export type CapacityDraft = {
  shift: ShiftCode
  schlosserCount: number
  vorrichtungCount: number
  targetRobotPercent: number
}

type DemoJobRow = {
  artikelNummer: string
  anlageMinutes: number
  faNumber: string
  isPriority?: boolean
  jobType?: JobType
  projekt: string
  schlosserMinutes: number
  schritt: number
  schonGeheftet?: boolean
  vorrichtung: number
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export async function getRobots(): Promise<Robot[]> {
  return apiFetch('/robots')
}

export async function createRobot(payload: Omit<Robot, 'id' | 'isActive'> & { isActive?: boolean }): Promise<Robot> {
  return apiFetch('/robots', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function ensureKnownRobots(): Promise<Robot[]> {
  const existingRobots = await getRobots()
  const existingAssetIds = new Set(existingRobots.map((robot) => robot.assetId.toUpperCase()))
  const createdRobots: Robot[] = []

  for (const robot of knownRobots) {
    if (existingAssetIds.has(robot.assetId.toUpperCase())) {
      continue
    }

    createdRobots.push(await createRobot({ ...robot, isActive: true }))
  }

  return [...existingRobots, ...createdRobots]
}

export async function getJobs(filters: { robotId?: string; date?: string } = {}): Promise<Job[]> {
  const params = new URLSearchParams()

  if (filters.robotId) params.set('robotId', filters.robotId)
  if (filters.date) params.set('date', filters.date)

  return apiFetch(`/jobs${params.size ? `?${params.toString()}` : ''}`)
}

export async function createJob(payload: CreateJobPayload): Promise<Job> {
  return apiFetch('/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateJob(id: string, payload: Partial<Job>): Promise<Job> {
  return apiFetch(`/jobs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function updateJobSuProgress(id: string, payload: { nextShift: ShiftCode; progressPercent: number }): Promise<Job> {
  return apiFetch(`/jobs/${id}/su-progress`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteJob(id: string): Promise<{ message: string }> {
  return apiFetch(`/jobs/${id}`, {
    method: 'DELETE',
  })
}

export async function getShiftCapacities(filters: { robotId?: string; date?: string } = {}): Promise<ShiftCapacity[]> {
  const params = new URLSearchParams()

  if (filters.robotId) params.set('robotId', filters.robotId)
  if (filters.date) params.set('date', filters.date)

  return apiFetch(`/shift-capacity${params.size ? `?${params.toString()}` : ''}`)
}

export async function createShiftCapacity(payload: Omit<ShiftCapacity, 'id'>): Promise<ShiftCapacity> {
  return apiFetch('/shift-capacity', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateShiftCapacity(id: string, payload: Partial<ShiftCapacity>): Promise<ShiftCapacity> {
  return apiFetch(`/shift-capacity/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function getPlannerRecommendation(robotId: string, date: string): Promise<PlannerRecommendation> {
  return apiFetch('/planner/recommendation', {
    method: 'POST',
    body: JSON.stringify({ robotId, date }),
  })
}

export async function applyPlannerRecommendation(robotId: string, date: string) {
  return apiFetch('/planner/apply', {
    method: 'POST',
    body: JSON.stringify({ robotId, date }),
  })
}

export async function seedDemoPlannerData(startShift: ShiftCode = 'N'): Promise<{ robot: Robot; createdJobs: number; createdJobIds: string[]; createdCapacities: number }> {
  const robots = await getRobots()
  const robot =
    robots.find((item) => item.assetId === 'AP2904') ??
    (await createRobot({
      name: 'Pesa',
      assetId: 'AP2904',
      location: 'Halle 2',
      process: 'Laser welding',
      isActive: true,
    }))

  const existingCapacities = await getShiftCapacities({ robotId: robot.id, date: demoDate })
  let createdCapacities = 0

  for (const capacity of demoCapacities) {
    const existing = existingCapacities.find((item) => item.shift === capacity.shift)

    if (existing) {
      await updateShiftCapacity(existing.id, capacity)
    } else {
      await createShiftCapacity({ ...capacity, robotId: robot.id, date: demoDate })
      createdCapacities += 1
    }
  }

  const demoJobs = await getDemoJobs(startShift)
  const demoFaNumbers = new Set(demoJobs.map((job) => job.faNumber))
  const existingJobs = await getJobs({ robotId: robot.id })
  const createdJobIds: string[] = []
  let createdJobs = 0

  for (const job of existingJobs.filter((item) => demoFaNumbers.has(item.faNumber))) {
    await deleteJob(job.id)
  }

  for (const job of demoJobs) {
    const createdJob = await createJob({ ...job, robotId: robot.id, date: demoDate, shift: startShift })
    createdJobIds.push(createdJob.id)
    createdJobs += 1
  }

  return { robot, createdJobs, createdJobIds, createdCapacities }
}

async function getDemoJobs(startShift: ShiftCode): Promise<CreateJobPayload[]> {
  const response = await fetch('/demo-planner-jobs.json')

  if (!response.ok) {
    throw new Error('Demo-Jobdatei konnte nicht geladen werden.')
  }

  const rows = (await response.json()) as DemoJobRow[]

  return rows.map((row) => ({
    faNumber: row.faNumber,
    projekt: row.projekt,
    artikelNummer: row.artikelNummer,
    schritt: row.schritt,
    vorrichtung: row.vorrichtung,
    menge: 1,
    robotId: '',
    anlageMinutes: row.anlageMinutes,
    schlosserMinutes: row.schonGeheftet ? 0 : row.schlosserMinutes,
    ruestMinutes: 0,
    jobType: row.jobType ?? 'production',
    schonGeheftet: row.schonGeheftet ?? false,
    isPriority: row.isPriority ?? false,
    isForced: false,
    isHeld: true,
    status: 'open',
    shift: startShift,
    date: demoDate,
  }))
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    const message = await getApiErrorMessage(response)
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function getApiErrorMessage(response: Response) {
  const text = await response.text()

  if (!text) {
    return ''
  }

  try {
    const body = JSON.parse(text) as { error?: string; message?: string | string[]; statusCode?: number }

    if (Array.isArray(body.message)) {
      return body.message.join(' ')
    }

    return body.message || body.error || text
  } catch {
    return text
  }
}

const demoDate = '2026-06-08'

const demoCapacities: CapacityDraft[] = [
  { shift: 'N', schlosserCount: 1, vorrichtungCount: 3, targetRobotPercent: 100 },
  { shift: 'F', schlosserCount: 2, vorrichtungCount: 3, targetRobotPercent: 100 },
  { shift: 'S', schlosserCount: 3, vorrichtungCount: 3, targetRobotPercent: 100 },
]

const knownRobots: Array<Omit<Robot, 'id' | 'isActive'>> = [
  { assetId: 'AP2345', location: 'Halle 1', name: 'Freya', process: 'Laser welding' },
  { assetId: 'AP2418', location: 'Halle 1', name: 'Donna', process: 'Laser welding' },
  { assetId: 'AP2670', location: 'Halle 2', name: 'Jana', process: 'Laser welding' },
  { assetId: 'AP2904', location: 'Halle 2', name: 'Pesa', process: 'Laser welding' },
  { assetId: 'AP3159', location: 'Halle 3', name: 'Kabine B', process: 'Laser welding' },
  { assetId: 'AP3286', location: 'Halle 2', name: 'Kabine C', process: 'Laser welding' },
  { assetId: 'AP3374', location: 'Halle 3', name: 'Kabine D', process: 'Laser welding' },
  { assetId: 'AP3421', location: 'Halle 3', name: 'Kabine V', process: 'Laser welding' },
  { assetId: 'AP3562', location: 'Halle 1', name: 'Gina', process: 'Laser welding' },
  { assetId: 'AP3617', location: 'Halle 2', name: 'Emma', process: 'Laser welding' },
  { assetId: 'AP3740', location: 'Halle 2', name: 'Kabine A', process: 'Laser welding' },
]
