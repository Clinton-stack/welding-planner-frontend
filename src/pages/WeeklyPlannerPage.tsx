import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Factory,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Link } from 'react-router-dom'
import {
  createJob,
  createShiftCapacity,
  deleteJob,
  getJobs,
  getPlannerRecommendation,
  getRobots,
  getShiftCapacities,
  seedDemoPlannerData,
  updateJob,
  updateShiftCapacity,
  type Job,
  type PlannerRecommendation,
  type Robot,
  type ShiftCapacity,
  type ShiftCode,
} from '../api/plannerApi'
import {
  cardClassName,
  inputClassName,
  pageShellClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../styles/ui'
import { useCurrentUser } from '../users/useCurrentUser'

type JobDraft = {
  faNumber: string
  projekt: string
  artikelNummer: string
  jobType: Job['jobType']
  schritt: string
  vorrichtung: string
  menge: string
  anlageMinutes: string
  schlosserMinutes: string
  schonGeheftet: boolean
  isPriority: boolean
  isForced: boolean
  isHeld: boolean
}

type CapacityForm = Record<
  ShiftCode,
  {
    id?: string
    schlosserCount: string
    vorrichtungCount: string
    targetRobotPercent: string
  }
>

type JobEditDraft = {
  anlageMinutes: string
  artikelNummer: string
  date: string
  faNumber: string
  jobType: Job['jobType']
  isForced: boolean
  isHeld: boolean
  isPriority: boolean
  menge: string
  projekt: string
  schlosserMinutes: string
  schonGeheftet: boolean
  schritt: string
  shift: ShiftCode
  status: Job['status']
  vorrichtung: string
}

type ToastMessage = {
  id: string
  text: string
  tone: 'error' | 'info' | 'success'
}

type DeleteConfirmation = {
  editingJob: Job
  jobsToDelete: Job[]
  skippedDoneJobs: Job[]
}

type PendingPlanChange = {
  date: string
  shift: ShiftCode
}

const plannerDate = '2026-06-08'
const jobPoolStorageKey = 'weekly-planner-job-pool-ids'
const robotShiftWorkingMinutes = 430

const shifts: { label: string; name: string; time: string; value: ShiftCode }[] = [
  { label: 'N', name: 'Nacht', time: '22:00 - 06:00', value: 'N' },
  { label: 'F', name: 'Frueh', time: '06:00 - 14:00', value: 'F' },
  { label: 'S', name: 'Spaet', time: '14:00 - 22:00', value: 'S' },
]

const emptyDraft: JobDraft = {
  faNumber: '',
  projekt: 'PESA',
  artikelNummer: '95',
  jobType: 'production',
  schritt: '1',
  vorrichtung: '1',
  menge: '1',
  anlageMinutes: '60',
  schlosserMinutes: '80',
  schonGeheftet: false,
  isPriority: false,
  isForced: false,
  isHeld: false,
}

const emptyCapacityForm: CapacityForm = {
  N: { schlosserCount: '1', vorrichtungCount: '3', targetRobotPercent: '100' },
  F: { schlosserCount: '2', vorrichtungCount: '3', targetRobotPercent: '100' },
  S: { schlosserCount: '3', vorrichtungCount: '3', targetRobotPercent: '100' },
}

export function WeeklyPlannerPage() {
  const { currentUser } = useCurrentUser()
  const backPath = currentUser.role === 'Supervisor' || currentUser.role === 'Admin' ? '/supervisor' : '/robots'
  const [robots, setRobots] = useState<Robot[]>([])
  const [selectedRobotId, setSelectedRobotId] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [capacityForm, setCapacityForm] = useState<CapacityForm>(emptyCapacityForm)
  const [recommendation, setRecommendation] = useState<PlannerRecommendation | null>(null)
  const [recommendationDateIndex, setRecommendationDateIndex] = useState(0)
  const [draft, setDraft] = useState<JobDraft>(emptyDraft)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [editDraft, setEditDraft] = useState<JobEditDraft | null>(null)
  const [planningStartDate, setPlanningStartDate] = useState(plannerDate)
  const [planningStartShift, setPlanningStartShift] = useState<ShiftCode>('N')
  const [jobPoolIds, setJobPoolIds] = useState<Set<string>>(() => readStoredJobPoolIds())
  const [pendingPlanChanges, setPendingPlanChanges] = useState<Map<string, PendingPlanChange>>(() => new Map())
  const [openPlanDates, setOpenPlanDates] = useState<Set<string>>(() => new Set([plannerDate]))
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null)
  const attachJobsInputRef = useRef<HTMLInputElement>(null)

  const selectedRobot = robots.find((robot) => robot.id === selectedRobotId)

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const clearToasts = useCallback(() => {
    setToasts([])
  }, [])

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    if (!text) return

    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

    setToasts((current) => [...current.slice(-2), { id, text, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4800)
  }, [])

  const loadPlannerData = useCallback(async (robotId?: string, options: { loadRecommendation?: boolean } = {}) => {
    setIsLoading(true)
    clearToasts()
    const shouldLoadRecommendation = options.loadRecommendation ?? false

    try {
      const robotList = await getRobots()
      const nextRobotId = robotId || selectedRobotId || robotList[0]?.id || ''

      setRobots(robotList)
      setSelectedRobotId(nextRobotId)

      if (!nextRobotId) {
        setJobs([])
        setJobPoolIds(new Set())
        setRecommendation(null)
        return
      }

      const [nextJobs, nextCapacities, nextRecommendation] = await Promise.all([
        getJobs({ robotId: nextRobotId }),
        getShiftCapacities({ robotId: nextRobotId, date: planningStartDate }),
        shouldLoadRecommendation ? getPlannerRecommendation(nextRobotId, plannerDate).catch(() => null) : Promise.resolve(null),
      ])
      setJobs(sortJobs(nextJobs))
      setPendingPlanChanges(new Map())
      setJobPoolIds(new Set(nextJobs.filter((job) => job.isHeld).map((job) => job.id)))
      setOpenPlanDates((current) => mergeOpenPlanDates(current, nextJobs))
      setCapacityForm(createCapacityForm(nextCapacities))
      if (shouldLoadRecommendation) {
        setRecommendation(nextRecommendation)
      } else {
        setRecommendation(null)
        setRecommendationDateIndex(0)
      }
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [clearToasts, planningStartDate, selectedRobotId, showToast])

  useEffect(() => {
    void loadPlannerData()
  }, [])

  useEffect(() => {
    storeJobPoolIds(jobPoolIds)
  }, [jobPoolIds])

  useEffect(() => {
    if (!selectedRobotId) return

    let isCurrent = true

    getShiftCapacities({ robotId: selectedRobotId, date: planningStartDate })
      .then((nextCapacities) => {
        if (isCurrent) {
          setCapacityForm(createCapacityForm(nextCapacities))
        }
      })
      .catch((error) => showToast(getErrorMessage(error), 'error'))

    return () => {
      isCurrent = false
    }
  }, [planningStartDate, selectedRobotId, showToast])

  const jobPoolJobs = useMemo(() => sortJobs(jobs.filter((job) => job.isHeld)), [jobs])
  const jobPoolJobIds = useMemo(() => new Set(jobPoolJobs.map((job) => job.id)), [jobPoolJobs])
  const recommendationDateSlides = useMemo(
    () =>
      recommendation?.forwardShiftSimulations?.length
        ? recommendation.forwardShiftSimulations
        : recommendation
          ? [{ date: recommendation.date, shiftSimulations: recommendation.shiftSimulations }]
          : [],
    [recommendation],
  )
  const effectiveRecommendationDateIndex = Math.min(recommendationDateIndex, Math.max(recommendationDateSlides.length - 1, 0))
  const currentRecommendationSlide = recommendationDateSlides[effectiveRecommendationDateIndex]
  const recommendationLaterJobs = useMemo(
    () => (recommendation ? countRecommendationJobsAfterDate(recommendation, jobPoolJobIds, recommendation.date) : 0),
    [jobPoolJobIds, recommendation],
  )

  useEffect(() => {
    setRecommendationDateIndex((current) => Math.min(current, Math.max(recommendationDateSlides.length - 1, 0)))
  }, [recommendationDateSlides.length])

  const approvalJobs = useMemo(
    () => sortJobs(jobs.filter((job) => isPendingApproval(job) || job.approvalStatus === 'rejected')),
    [jobs],
  )
  const normalPlanJobs = useMemo(
    () =>
      jobs
        .filter((job) => !job.isHeld && !isPendingApproval(job) && job.approvalStatus !== 'rejected')
        .map((job) => {
          const pendingChange = pendingPlanChanges.get(job.id)

          return pendingChange ? { ...job, date: pendingChange.date, isForced: true, shift: pendingChange.shift } : job
        }),
    [jobs, pendingPlanChanges],
  )
  const planDates = useMemo(() => createPlanDateGroups(normalPlanJobs), [normalPlanJobs])
  const activeJobs = normalPlanJobs.filter((job) => job.status !== 'done' && job.status !== 'blocked')
  const plannedRobotMinutes = activeJobs.reduce((sum, job) => sum + (job.remainingAnlageMinutes ?? job.anlageMinutes), 0)
  const readyJobs = activeJobs.filter((job) => job.schonGeheftet).length

  const handleSeedDemo = async () => {
    setIsWorking(true)
    clearToasts()

    try {
      const result = await seedDemoPlannerData(planningStartShift)
      setJobPoolIds(new Set(result.createdJobIds))
      setRecommendation(null)
      showToast(`Demo gespeichert: ${result.createdJobs} Jobs und ${result.createdCapacities} Kapazitaeten neu angelegt.`)
      await loadPlannerData(result.robot.id)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const handleCreateJob = async () => {
    if (!selectedRobotId) {
      showToast('Bitte zuerst eine Anlage waehlen oder Demo-Daten anlegen.', 'error')
      return
    }

    if (!draft.faNumber.trim() || !draft.projekt.trim() || !draft.artikelNummer.trim()) {
      showToast('FA Nummer, Projekt und Artikelnummer sind Pflichtfelder.', 'error')
      return
    }

    setIsWorking(true)
    clearToasts()

    try {
      const createdJob = await createJob({
        faNumber: draft.faNumber.trim(),
        projekt: draft.projekt.trim(),
        artikelNummer: draft.artikelNummer.trim(),
        schritt: toNumber(draft.schritt, 1),
        vorrichtung: toNumber(draft.vorrichtung, 1),
        menge: toNumber(draft.menge, 1),
        robotId: selectedRobotId,
        anlageMinutes: toNumber(draft.anlageMinutes, 0),
        schlosserMinutes: draft.schonGeheftet ? 0 : toNumber(draft.schlosserMinutes, 0),
        ruestMinutes: 0,
        jobType: draft.jobType,
        schonGeheftet: draft.schonGeheftet,
        isPriority: draft.isPriority,
        isForced: draft.isForced,
        isHeld: true,
        status: 'open',
        date: planningStartDate,
        shift: planningStartShift,
      })
      setJobPoolIds((current) => new Set(current).add(createdJob.id))
      setRecommendation(null)
      setDraft((current) => ({ ...emptyDraft, projekt: current.projekt }))
      showToast('Job wurde in die Vorliste gelegt.')
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const handleAttachJobsFile = async (file: File | undefined) => {
    if (!file) return

    if (!selectedRobotId) {
      showToast('Bitte zuerst eine Anlage waehlen oder Demo-Daten anlegen.', 'error')
      return
    }

    setIsWorking(true)
    clearToasts()

    try {
      const fileText = await file.text()
      const rows = parseJobUploadFile(file.name, fileText)
      const createdJobIds: string[] = []
      let createdJobs = 0

      for (const row of rows) {
        if (!row.faNumber || !row.projekt || !row.artikelNummer || !row.schritt || !row.vorrichtung) {
          continue
        }

        const schonGeheftet = parseBoolean(row.schonGeheftet)
        const isPriority = parseBoolean(row.isPriority)
        const isForced = parseBoolean(row.isForced)

        const createdJob = await createJob({
          faNumber: row.faNumber,
          projekt: row.projekt,
          artikelNummer: String(row.artikelNummer),
          schritt: Number(row.schritt),
          vorrichtung: Number(row.vorrichtung),
          menge: Number(row.menge ?? 1),
          robotId: selectedRobotId,
          anlageMinutes: Number(row.anlageMinutes ?? 0),
          schlosserMinutes: schonGeheftet ? 0 : Number(row.schlosserMinutes ?? 0),
          ruestMinutes: 0,
          jobType: row.jobType ?? 'production',
          schonGeheftet,
          isPriority,
          isForced,
          isHeld: true,
          status: 'open',
          date: planningStartDate,
          shift: planningStartShift,
        })
        createdJobIds.push(createdJob.id)
        createdJobs += 1
      }

      setJobPoolIds((current) => new Set([...current, ...createdJobIds]))
      setRecommendation(null)
      showToast(`${createdJobs} Jobs aus ${file.name} in die Vorliste gelegt.`)
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      showToast(error instanceof SyntaxError ? 'Jobdatei konnte nicht gelesen werden. Bitte JSON oder CSV pruefen.' : getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
      if (attachJobsInputRef.current) {
        attachJobsInputRef.current.value = ''
      }
    }
  }

  const handleSaveCapacities = async () => {
    if (!selectedRobotId) {
      showToast('Bitte zuerst eine Anlage waehlen oder Demo-Daten anlegen.', 'error')
      return
    }

    setIsWorking(true)
    clearToasts()

    try {
      await upsertVisibleCapacities(planningStartDate)
      showToast('Schichtkapazitaeten gespeichert.')
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const handleRecommend = async () => {
    if (!selectedRobotId || !selectedRobot) return

    if (jobPoolJobs.length === 0) {
      showToast('Keine Jobs in der Vorliste. Bitte erst neue Jobs importieren oder anlegen.', 'error')
      return
    }

    setIsWorking(true)
    clearToasts()

    try {
      await upsertVisibleCapacities(planningStartDate)
      const nextRecommendation = createAppendOnlyRecommendation({
        capacityForm,
        date: planningStartDate,
        lockedJobs: normalPlanJobs,
        robot: selectedRobot,
        robotId: selectedRobotId,
        stagedJobs: jobPoolJobs,
        startShift: planningStartShift,
      })

      setRecommendation(nextRecommendation)
      setRecommendationDateIndex(0)
      showToast('Append-Empfehlung berechnet. Bestehende Plan-Jobs bleiben unveraendert.')
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const upsertVisibleCapacities = async (date: string) => {
    if (!selectedRobotId) return

    for (const shift of shifts) {
      const form = capacityForm[shift.value]
      const payload = {
        robotId: selectedRobotId,
        date,
        shift: shift.value,
        schlosserCount: toNumber(form.schlosserCount, 0),
        vorrichtungCount: toNumber(form.vorrichtungCount, 0),
        targetRobotPercent: toNumber(form.targetRobotPercent, 100),
      }

      if (form.id) {
        await updateShiftCapacity(form.id, payload)
      } else {
        const createdCapacity = await createShiftCapacity(payload)

        setCapacityForm((current) => ({
          ...current,
          [shift.value]: {
            ...current[shift.value],
            id: createdCapacity.id,
          },
        }))
      }
    }
  }

  const handleApplyPlan = async () => {
    if (!selectedRobotId) return

    setIsWorking(true)
    clearToasts()

    try {
      if (!recommendation) return

      const placedJobs = getRecommendationPlacements(recommendation)
      const unplacedJobs = jobPoolJobs.filter((job) => !placedJobs.has(job.id))

      for (const job of jobPoolJobs) {
        const placement = placedJobs.get(job.id)

        if (!placement) continue

        await updateJob(job.id, {
          date: placement.date,
          shift: placement.shift,
          isForced: false,
          isHeld: false,
        })
      }

      setJobPoolIds(new Set(unplacedJobs.map((job) => job.id)))
      setPendingPlanChanges(new Map())
      setRecommendation(null)
      setRecommendationDateIndex(0)
      showToast(
        unplacedJobs.length > 0
          ? `${jobPoolJobs.length - unplacedJobs.length} Job(s) wurden aus der Empfehlung uebernommen. ${unplacedJobs.length} Job(s) bleiben offen.`
          : `${jobPoolJobs.length} Job(s) wurden aus der Empfehlung in den Plan uebernommen.`,
        unplacedJobs.length > 0 ? 'info' : 'success',
      )
      await loadPlannerData(selectedRobotId, { loadRecommendation: false })
      setRecommendation(null)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const handleAddStagedJobsToPlan = async () => {
    if (!selectedRobotId || jobPoolJobs.length === 0) return

    setIsWorking(true)
    clearToasts()

    try {
      await upsertVisibleCapacities(planningStartDate)

      const result = simulateSingleShiftAppend({
        capacityForm: capacityForm[planningStartShift],
        date: planningStartDate,
        lockedJobs: normalPlanJobs,
        shift: planningStartShift,
        stagedJobs: jobPoolJobs,
      })

      if (result.plannedJobs.length === 0) {
        showToast('Keine Vorlisten-Jobs passen noch in diese Schicht. Bitte Empfehlung nutzen oder eine andere Schicht waehlen.', 'error')
        return
      }

      for (const item of result.plannedJobs) {
        const job = item.job

        await updateJob(job.id, {
          date: planningStartDate,
          shift: planningStartShift,
          isForced: false,
          isHeld: false,
        })
      }

      const unplacedJobIds = new Set(result.rolloverJobs.map((job) => job.id))

      setJobPoolIds(unplacedJobIds)
      setRecommendation(null)
      setRecommendationDateIndex(0)
      showToast(
        result.rolloverJobs.length > 0
          ? `${result.plannedJobs.length} Job(s) passen in ${formatPlanDate(planningStartDate)} / ${getShiftName(planningStartShift)}. ${result.rolloverJobs.length} bleiben in der Vorliste.`
          : `${result.plannedJobs.length} Job(s) wurden zu ${formatPlanDate(planningStartDate)} / ${getShiftName(planningStartShift)} hinzugefuegt.`,
        result.rolloverJobs.length > 0 ? 'info' : 'success',
      )
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const handleSaveCurrentPlan = async () => {
    if (pendingPlanChanges.size === 0) return

    setIsWorking(true)
    clearToasts()

    try {
      for (const [jobId, change] of pendingPlanChanges) {
        await updateJob(jobId, { date: change.date, shift: change.shift, isForced: true })
      }

      setPendingPlanChanges(new Map())
      setRecommendation(null)
      setRecommendationDateIndex(0)
      showToast('Aktueller Plan wurde gespeichert.', 'success')
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const handlePatchJob = async (job: Job, patch: Partial<Job>, successMessage: string) => {
    setIsWorking(true)
    clearToasts()

    try {
      if (patch.isPriority !== undefined && job.jobType === 'production') {
        await updatePriorityForFa(job, patch.isPriority)
      } else {
        await updateJob(job.id, patch)
      }
      showToast(successMessage)
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const updatePriorityForFa = async (sourceJob: Job, isPriority: boolean) => {
    const sameFaProductionJobs = jobs.filter((job) => job.robotId === sourceJob.robotId && job.faNumber === sourceJob.faNumber && job.jobType === 'production')

    for (const job of sameFaProductionJobs) {
      await updateJob(job.id, { isPriority })
    }
  }

  const handleReopenJob = async (job: Job) => {
    await handlePatchJob(job, { status: 'open' }, `${job.faNumber} wurde wieder geoeffnet.`)
  }

  const approveJob = async (job: Job) => {
    setIsWorking(true)
    clearToasts()

    try {
      await updateJob(job.id, {
        approvalStatus: 'approved',
        approvedAt: new Date().toISOString(),
        approvedByName: currentUser.name,
        isForced: true,
        isHeld: false,
        isPriority: true,
      })
      showToast(`${job.faNumber} wurde freigegeben und bleibt im angefragten Planfenster.`, 'success')
      await loadPlannerData(selectedRobotId, { loadRecommendation: false })
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const rejectJob = async (job: Job) => {
    setIsWorking(true)
    clearToasts()

    try {
      await updateJob(job.id, {
        approvalNote: 'Vom Supervisor abgelehnt.',
        approvalStatus: 'rejected',
        isHeld: true,
        rejectedAt: new Date().toISOString(),
        rejectedByName: currentUser.name,
      })
      showToast(`${job.faNumber} wurde abgelehnt.`, 'success')
      await loadPlannerData(selectedRobotId, { loadRecommendation: false })
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const openEditJob = (job: Job) => {
    setEditingJob(job)
    setEditDraft({
      anlageMinutes: String(job.remainingAnlageMinutes ?? job.anlageMinutes),
      artikelNummer: job.artikelNummer,
      date: job.date,
      faNumber: job.faNumber,
      jobType: job.jobType,
      isForced: job.isForced,
      isHeld: job.isHeld,
      isPriority: job.isPriority,
      menge: String(job.menge),
      projekt: job.projekt,
      schlosserMinutes: String(job.schonGeheftet ? 0 : job.schlosserMinutes),
      schonGeheftet: job.schonGeheftet,
      schritt: String(job.schritt),
      shift: job.shift,
      status: job.status,
      vorrichtung: String(job.vorrichtung),
    })
  }

  const closeEditJob = () => {
    setEditingJob(null)
    setEditDraft(null)
    setDeleteConfirmation(null)
  }

  const saveEditedJob = async () => {
    if (!editingJob || !editDraft) return

    setIsWorking(true)
    clearToasts()

    try {
      const savedJob = await updateJob(editingJob.id, {
        anlageMinutes: toNumber(editDraft.anlageMinutes, editingJob.anlageMinutes),
        artikelNummer: editDraft.artikelNummer.trim(),
        date: editDraft.date,
        faNumber: editDraft.faNumber.trim(),
        jobType: editDraft.jobType,
        isForced: editDraft.isForced,
        isHeld: editDraft.isHeld,
        isPriority: editDraft.isPriority,
        menge: toNumber(editDraft.menge, editingJob.menge),
        projekt: editDraft.projekt.trim(),
        schlosserMinutes: editDraft.schonGeheftet ? 0 : toNumber(editDraft.schlosserMinutes, editingJob.schlosserMinutes),
        schonGeheftet: editDraft.schonGeheftet,
        schritt: toNumber(editDraft.schritt, editingJob.schritt),
        shift: editDraft.shift,
        status: editDraft.status,
        vorrichtung: toNumber(editDraft.vorrichtung, editingJob.vorrichtung),
      })

      if (editingJob.jobType === 'production' && editDraft.isPriority !== editingJob.isPriority) {
        await updatePriorityForFa(savedJob, editDraft.isPriority)
      }

      setRecommendation(null)
      showToast(`${editingJob.faNumber} wurde aktualisiert.`)
      closeEditJob()
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const requestDeleteJob = (jobToDelete: Job) => {
    if (jobToDelete.status === 'done') {
      showToast('Fertige Jobs werden nicht automatisch geloescht.', 'error')
      return
    }

    const jobsToDelete = jobs
      .filter((job) => {
        if (
          job.robotId !== jobToDelete.robotId ||
          job.faNumber !== jobToDelete.faNumber ||
          job.jobType !== jobToDelete.jobType ||
          job.status === 'done'
        ) {
          return false
        }

        if (jobToDelete.jobType === 'repair') {
          return job.id === jobToDelete.id
        }

        return job.schritt >= jobToDelete.schritt
      })
      .sort((first, second) => first.schritt - second.schritt)
    const skippedDoneJobs =
      jobToDelete.jobType === 'production'
        ? jobs.filter(
            (job) =>
              job.robotId === jobToDelete.robotId &&
              job.faNumber === jobToDelete.faNumber &&
              job.jobType === jobToDelete.jobType &&
              job.schritt >= jobToDelete.schritt &&
              job.status === 'done',
          )
        : []

    setDeleteConfirmation({ editingJob: jobToDelete, jobsToDelete, skippedDoneJobs })
  }

  const requestDeleteEditedJob = () => {
    if (!editingJob) return
    requestDeleteJob(editingJob)
  }

  const clearJobPool = async () => {
    if (jobPoolJobs.length === 0) return

    setIsWorking(true)
    clearToasts()

    try {
      for (const job of jobPoolJobs) {
        await deleteJob(job.id)
      }

      const deletedJobIds = new Set(jobPoolJobs.map((job) => job.id))

      setJobs((current) => current.filter((job) => !deletedJobIds.has(job.id)))
      setJobPoolIds(new Set())
      setRecommendation(null)
      setRecommendationDateIndex(0)
      showToast(`${jobPoolJobs.length} vorbereitete Job(s) wurden verworfen.`, 'success')
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const confirmDeleteEditedJob = async () => {
    if (!deleteConfirmation) return

    const { editingJob: jobBeingDeleted, jobsToDelete, skippedDoneJobs } = deleteConfirmation

    setIsWorking(true)
    clearToasts()

    try {
      for (const job of jobsToDelete) {
        await deleteJob(job.id)
      }

      const deletedJobIds = new Set(jobsToDelete.map((job) => job.id))
      setJobPoolIds((current) => new Set([...current].filter((jobId) => !deletedJobIds.has(jobId))))
      setRecommendation(null)
      setRecommendationDateIndex(0)
      setDeleteConfirmation(null)
      closeEditJob()
      showToast(
        jobBeingDeleted.jobType === 'repair'
          ? `${jobsToDelete.length} Reparatur-Job geloescht.`
          : `${jobsToDelete.length} Job(s) geloescht. Spaetere Produktions-Schritte derselben FA wurden mit entfernt.${skippedDoneJobs.length > 0 ? ` ${skippedDoneJobs.length} fertige Schritt(e) wurden nicht geloescht.` : ''}`,
        'success',
      )
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const handleMoveJobToShift = async (jobId: string, date: string, shift: ShiftCode) => {
    const job = jobs.find((item) => item.id === jobId)

    if (!job) return

    setPendingPlanChanges((current) => {
      const next = new Map(current)

      if (job.date === date && job.shift === shift) {
        next.delete(jobId)
      } else {
        next.set(jobId, { date, shift })
      }

      return next
    })
    setRecommendation(null)
    showToast(`${job.faNumber} wurde verschoben. Speichere den aktuellen Plan, um die Datenbank zu aktualisieren.`)
  }

  const togglePlanDate = (date: string) => {
    setOpenPlanDates((current) => {
      const next = new Set(current)

      if (next.has(date)) {
        next.delete(date)
      } else {
        next.add(date)
      }

      return next
    })
  }

  return (
    <main className={pageShellClassName}>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <Link to={backPath} className="mb-2 inline-flex items-center gap-2 text-sm font-black text-blue-700">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {backPath === '/supervisor' ? 'Schichtleiter-Zentrale' : 'Anlagen-Auswahl'}
            </Link>
            <h1 className="text-2xl font-black tracking-normal text-slate-950">Schichtplaner</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Backend verbunden / {plannerDate} / {currentUser.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClassName} type="button" onClick={() => void loadPlannerData(selectedRobotId)} disabled={isWorking}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Aktualisieren
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={<Factory className="h-5 w-5" />} label="Anlage" value={selectedRobot?.name ?? 'Keine'} />
          <Metric icon={<Timer className="h-5 w-5" />} label="Jobs aktiv" value={`${activeJobs.length}`} />
          <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Schon geheftet" value={`${readyJobs}`} />
          <Metric icon={<Timer className="h-5 w-5" />} label="Roboter offen" value={`${plannedRobotMinutes}m`} />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={`${cardClassName} h-fit p-5`}>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Anlage</p>
            <select
              className={`${inputClassName} mt-4 w-full`}
              value={selectedRobotId}
              onChange={(event) => {
                setSelectedRobotId(event.target.value)
                void loadPlannerData(event.target.value)
              }}
            >
              <option value="">Keine Anlage</option>
              {robots.map((robot) => (
                <option key={robot.id} value={robot.id}>
                  {robot.name} / {robot.assetId}
                </option>
              ))}
            </select>

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">{selectedRobot?.assetId ?? 'AP offen'}</p>
              <p className="mt-1 text-sm font-bold text-slate-500">{selectedRobot?.location ?? 'Noch keine Anlage in der Datenbank'}</p>
            </div>

            <p className="mt-5 text-xs font-bold leading-5 text-slate-500">
              Jobs, Kapazitaeten und Empfehlungen kommen direkt aus dem Backend.
            </p>
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="space-y-5">
            <section className={`${cardClassName} p-5`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <SectionTitle
                  kicker="1. Vorliste"
                  title="Neue Jobs sammeln"
                  text="Upload oder manuelle Eingabe landet zuerst hier. Danach speicherst du sie direkt in den Plan oder laesst die Empfehlung eine bessere Verteilung berechnen."
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    accept=".json,.csv,application/json,text/csv"
                    className="hidden"
                    ref={attachJobsInputRef}
                    type="file"
                    onChange={(event) => void handleAttachJobsFile(event.target.files?.[0])}
                  />
                  <button className={secondaryButtonClassName} type="button" onClick={() => attachJobsInputRef.current?.click()} disabled={isWorking}>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Datei importieren
                  </button>
                  <button className={secondaryButtonClassName} type="button" onClick={handleSeedDemo} disabled={isWorking}>
                    <Database className="h-4 w-4" aria-hidden="true" />
                    Demo-Daten verwenden
                  </button>
                  <button className={secondaryButtonClassName} type="button" onClick={handleAddStagedJobsToPlan} disabled={isWorking || jobPoolJobs.length === 0}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add to plan
                  </button>
                  <button className={dangerGhostButtonClassName} type="button" onClick={() => void clearJobPool()} disabled={isWorking || jobPoolJobs.length === 0}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Vorliste loeschen
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-6 xl:grid-cols-12">
                  <TextField className="md:col-span-3 xl:col-span-3" label="FA Nummer" value={draft.faNumber} onChange={(value) => setDraftValue('faNumber', value, setDraft)} />
                  <TextField className="md:col-span-3 xl:col-span-3" label="Projekt" value={draft.projekt} onChange={(value) => setDraftValue('projekt', value, setDraft)} />
                  <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700 md:col-span-2 xl:col-span-2">
                    Jobtyp
                    <select className={`${inputClassName} w-full`} value={draft.jobType} onChange={(event) => setDraft((current) => ({ ...current, jobType: event.target.value as Job['jobType'] }))}>
                      <option value="production">Produktion</option>
                      <option value="repair">Reparatur</option>
                    </select>
                  </label>
                  <TextField className="md:col-span-2 xl:col-span-2" label="Art. Nr." value={draft.artikelNummer} onChange={(value) => setDraftValue('artikelNummer', value, setDraft)} />
                  <TextField className="md:col-span-1 xl:col-span-1" label="Schritt" type="number" value={draft.schritt} onChange={(value) => setDraftValue('schritt', value, setDraft)} />
                  <TextField className="md:col-span-1 xl:col-span-1" label="VR" type="number" value={draft.vorrichtung} onChange={(value) => setDraftValue('vorrichtung', value, setDraft)} />
                  <TextField className="md:col-span-2 xl:col-span-1" label="Menge" type="number" value={draft.menge} onChange={(value) => setDraftValue('menge', value, setDraft)} />

                  <TextField className="md:col-span-2 xl:col-span-3" label="Roboter min" type="number" value={draft.anlageMinutes} onChange={(value) => setDraftValue('anlageMinutes', value, setDraft)} />
                  <TextField
                    className="md:col-span-2 xl:col-span-3"
                    label="Schlosser min"
                    type="number"
                    value={draft.schonGeheftet ? '0' : draft.schlosserMinutes}
                    onChange={(value) => setDraft((current) => ({ ...current, schlosserMinutes: value, schonGeheftet: false }))}
                  />
                  <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700 md:col-span-2 xl:col-span-3">
                    Start-Schicht
                    <select className={`${inputClassName} w-full`} value={planningStartShift} onChange={(event) => setPlanningStartShift(event.target.value as ShiftCode)}>
                      {shifts.map((shift) => (
                        <option key={shift.value} value={shift.value}>
                          {shift.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextField
                    className="md:col-span-2 xl:col-span-3"
                    label="Plan-Datum"
                    type="date"
                    value={planningStartDate}
                    onChange={(value) => {
                      setPlanningStartDate(value || plannerDate)
                      setRecommendation(null)
                      setRecommendationDateIndex(0)
                    }}
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Checkbox label="Schon geheftet" checked={draft.schonGeheftet} onChange={(checked) => setDraft((current) => ({ ...current, schonGeheftet: checked }))} />
                    <Checkbox label="Prioritaet" checked={draft.isPriority} onChange={(checked) => setDraft((current) => ({ ...current, isPriority: checked }))} />
                    <Checkbox label="Erzwingen" checked={draft.isForced} onChange={(checked) => setDraft((current) => ({ ...current, isForced: checked }))} />
                    <Checkbox label="Halten" checked={draft.isHeld} onChange={(checked) => setDraft((current) => ({ ...current, isHeld: checked }))} />
                  </div>
                  <button className={`${primaryButtonClassName} shrink-0 lg:w-fit`} type="button" onClick={handleCreateJob} disabled={isWorking}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    In Vorliste legen
                  </button>
                </div>
              </div>

              <div className="mt-5 max-h-[360px] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500 shadow-sm">
                    <tr>
                      <th className="px-2.5 py-2">FA</th>
                      <th className="px-2.5 py-2">Projekt</th>
                      <th className="px-2.5 py-2">Typ</th>
                      <th className="px-2.5 py-2">Art.</th>
                      <th className="px-2.5 py-2">S</th>
                      <th className="px-2.5 py-2">VR</th>
                      <th className="px-2.5 py-2">Rob.</th>
                      <th className="px-2.5 py-2">Schl.</th>
                      <th className="px-2.5 py-2">Schicht</th>
                      <th className="px-2.5 py-2">Prio</th>
                      <th className="px-2.5 py-2">Fix</th>
                      <th className="px-2.5 py-2">Status</th>
                      <th className="px-2.5 py-2 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobPoolJobs.map((job) => (
                      <tr key={job.id} className="align-middle transition hover:bg-slate-50">
                        <td className="whitespace-nowrap px-2.5 py-2 font-black text-slate-950">{job.faNumber}</td>
                        <td className="px-2.5 py-2 font-bold text-slate-600">{job.projekt}</td>
                        <td className="px-2.5 py-2"><JobTypeBadge jobType={job.jobType} compact /></td>
                        <td className="px-2.5 py-2 font-bold text-slate-600">{job.artikelNummer}</td>
                        <td className="px-2.5 py-2 font-bold text-slate-600">{job.schritt}</td>
                        <td className="px-2.5 py-2">
                          <select
                            className={miniSelectClassName}
                            value={job.vorrichtung}
                            onChange={(event) =>
                              void handlePatchJob(
                                job,
                                { vorrichtung: toNumber(event.target.value, job.vorrichtung), isForced: true },
                                `${job.faNumber} wurde manuell auf VR-${event.target.value} gesetzt und erzwungen.`,
                              )
                            }
                          >
                            {Array.from({ length: 6 }, (_, index) => index + 1).map((fixture) => (
                              <option key={fixture} value={fixture}>
                                VR-{fixture}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2.5 py-2 font-bold text-slate-600">{job.remainingAnlageMinutes ?? job.anlageMinutes}m</td>
                        <td className="px-2.5 py-2 font-bold text-slate-600">{job.schonGeheftet ? 0 : job.schlosserMinutes}m</td>
                        <td className="px-2.5 py-2">
                          <select
                            className={miniSelectClassName}
                            value={job.shift}
                            onChange={(event) =>
                              void handlePatchJob(
                                job,
                                { shift: event.target.value as ShiftCode },
                                `${job.faNumber} wurde manuell nach ${getShiftName(event.target.value as ShiftCode)} verschoben.`,
                              )
                            }
                          >
                            {shifts.map((shift) => (
                              <option key={shift.value} value={shift.value}>
                                {shift.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2.5 py-2">
                          <button
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                              job.isPriority
                                ? 'border-amber-200 bg-amber-100 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-400 hover:border-amber-200 hover:text-amber-700'
                            }`}
                            disabled={isWorking}
                            title={job.isPriority ? 'Prioritaet fuer ganze FA entfernen' : 'Ganze FA als Prioritaet markieren'}
                            type="button"
                            onClick={() =>
                              void handlePatchJob(
                                job,
                                { isPriority: !job.isPriority },
                                !job.isPriority
                                  ? `${job.faNumber} wurde als Prioritaet fuer alle Schritte markiert.`
                                  : `${job.faNumber} ist nicht mehr priorisiert.`,
                              )
                            }
                          >
                            <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            checked={job.isForced}
                            className="h-3.5 w-3.5 accent-blue-700"
                            type="checkbox"
                            onChange={(event) =>
                              void handlePatchJob(
                                job,
                                { isForced: event.target.checked },
                                event.target.checked ? `${job.faNumber} wird erzwungen.` : `${job.faNumber} wird nicht mehr erzwungen.`,
                              )
                            }
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <StatusPill job={job} />
                        </td>
                        <td className="px-2.5 py-2">
                          <div className="flex justify-end gap-1.5">
                            <IconButton label="Bearbeiten" disabled={isWorking} onClick={() => openEditJob(job)} size="sm">
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                            <IconButton label="Loeschen" disabled={isWorking || job.status === 'done'} onClick={() => requestDeleteJob(job)} size="sm" tone="rose">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label="Schon geheftet"
                              disabled={job.schonGeheftet || isWorking}
                              onClick={() => void handlePatchJob(job, { schonGeheftet: true, schlosserMinutes: 0 }, `${job.faNumber} ist jetzt schon geheftet.`)}
                              size="sm"
                              tone="emerald"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label="Fertig melden"
                              disabled={job.status === 'done' || isWorking}
                              onClick={() => void handlePatchJob(job, { status: 'done' }, `${job.faNumber} wurde fertig gemeldet.`)}
                              size="sm"
                              tone="slate"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {jobPoolJobs.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-sm font-bold text-slate-500" colSpan={12}>
                          Keine Jobs in der Vorliste. Job manuell hinzufuegen, Datei importieren oder Demo-Daten verwenden.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${cardClassName} p-5`}>
              <SectionTitle
                kicker="2. Schichtkapazitaet"
                title="Schlosser, VR Plaetze und Roboterziel pro Schicht"
                text="Diese Werte sind die Tagesregeln fuer die Berechnung. Aendere sie nur, wenn sich Besetzung, VR Plaetze oder Zielauslastung fuer den Tag aendern."
              />
              <div className="mt-5 grid gap-3 xl:grid-cols-3">
                {shifts.map((shift) => (
                  <CapacityCard
                    form={capacityForm[shift.value]}
                    key={shift.value}
                    onChange={(key, value) =>
                      setCapacityForm((current) => ({
                        ...current,
                        [shift.value]: { ...current[shift.value], [key]: value },
                      }))
                    }
                    shift={shift}
                  />
                ))}
              </div>
              <button className={`${primaryButtonClassName} mt-4 lg:w-fit`} type="button" onClick={handleSaveCapacities} disabled={isWorking}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Schichtregeln uebernehmen
              </button>
            </section>
            </div>

            <section className={`${cardClassName} overflow-hidden`}>
              <div className="border-b border-slate-100 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <SectionTitle
                    kicker="3. Empfehlung"
                    title="Vorliste einsortieren"
                    text="Die Empfehlung sucht Plaetze fuer neue Jobs aus der Vorliste. Bereits live geplante Jobs werden beim Uebernehmen nicht verschoben."
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className={secondaryButtonClassName} type="button" onClick={handleRecommend} disabled={isWorking || !selectedRobotId}>
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      Empfehlung berechnen
                    </button>
                    <button className={primaryButtonClassName} type="button" onClick={handleApplyPlan} disabled={isWorking || !recommendation || jobPoolJobs.length === 0}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Empfehlung uebernehmen
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-5">
                {isLoading ? (
                  <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Lade Backend-Daten...
                  </div>
                ) : recommendation ? (
                  <div className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-4">
                      <SmartTile label="Alle Jobs" value={`${recommendation.summary.totalJobs}`} />
                      <SmartTile label="Bereit" value={`${recommendation.summary.readyJobs}`} tone="emerald" />
                      <SmartTile label="Heften noetig" value={`${recommendation.summary.needsHeftenJobs}`} tone="amber" />
                      <SmartTile label="Naechste Tage" value={`${recommendationLaterJobs}`} tone={recommendationLaterJobs > 0 ? 'amber' : 'emerald'} />
                    </div>

                    <div className="rounded-xl border border-slate-100">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                        <button
                          className={slideButtonClassName}
                          disabled={recommendationDateIndex === 0}
                          type="button"
                          onClick={() => setRecommendationDateIndex((current) => Math.max(0, current - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <div className="text-center">
                          <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Prognose Tag {effectiveRecommendationDateIndex + 1} / {recommendationDateSlides.length}</p>
                          <p className="mt-1 font-black text-slate-950">{currentRecommendationSlide ? formatPlanDate(currentRecommendationSlide.date) : '-'}</p>
                        </div>
                        <button
                          className={slideButtonClassName}
                          disabled={effectiveRecommendationDateIndex >= recommendationDateSlides.length - 1}
                          type="button"
                          onClick={() => setRecommendationDateIndex((current) => Math.min(recommendationDateSlides.length - 1, current + 1))}
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {currentRecommendationSlide && (
                        <RecommendationDatePreview
                          dateSimulation={currentRecommendationSlide}
                          stagedJobIds={jobPoolJobIds}
                        />
                      )}
                    </div>

                    {recommendation.sequenceWarnings.length > 0 && (
                      <WarningList title="Schritt-Hinweise" warnings={recommendation.sequenceWarnings.map((item) => item.warning)} />
                    )}
                    {recommendation.missingCapacityWarnings.length > 0 && (
                      <WarningList title="Kapazitaet fehlt" warnings={recommendation.missingCapacityWarnings.map((item) => item.message)} />
                    )}
                    {recommendation.finalRolloverJobs.length > 0 && (
                      <section className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                        <p className="font-black text-rose-900">Rollt auf den naechsten Produktionstag / Nacht</p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {recommendation.finalRolloverJobs.map((job) => (
                            <JobSummary key={job.id} job={job} suffix="Naechster Tag" />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                    Noch keine Empfehlung. Schichtregeln pruefen und Empfehlung berechnen.
                  </p>
                )}
              </div>
            </section>

            <ApprovalSection
              isWorking={isWorking}
              jobs={approvalJobs}
              onApprove={(job) => void approveJob(job)}
              onEdit={openEditJob}
              onReject={(job) => void rejectJob(job)}
            />

            <section className={`${cardClassName} p-5`}>
              <SectionTitle kicker="5. Aktueller Plan" title="Jobs nach Datum und Schicht" text="Ueberlauf bleibt sichtbar, auch wenn Jobs auf den naechsten Produktionstag rollen." />
              <div className="mt-5 space-y-3">
                {planDates.map((dateGroup) => {
                  const isOpen = openPlanDates.has(dateGroup.date)
                  const hasDatePendingChanges = [...pendingPlanChanges.values()].some((change) => change.date === dateGroup.date)

                  return (
                    <article className="overflow-hidden rounded-xl border border-slate-100" key={dateGroup.date}>
                      <div className="flex flex-col gap-3 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <button className="min-w-0 text-left" type="button" onClick={() => togglePlanDate(dateGroup.date)}>
                          <p className="font-black text-slate-950">{formatPlanDate(dateGroup.date)}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{dateGroup.totalJobs} Jobs geplant</p>
                        </button>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <button
                            className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              hasDatePendingChanges ? 'bg-blue-700 text-white shadow-sm shadow-blue-700/20 hover:bg-blue-800' : 'bg-white text-slate-400 ring-1 ring-slate-100'
                            }`}
                            disabled={!hasDatePendingChanges || isWorking}
                            onClick={() => void handleSaveCurrentPlan()}
                            type="button"
                          >
                            <Save className="h-4 w-4" aria-hidden="true" />
                            Plan speichern
                          </button>
                          <button className="rounded-lg bg-white px-2 py-1 text-xs font-black text-slate-600" type="button" onClick={() => togglePlanDate(dateGroup.date)}>
                            {isOpen ? 'Schliessen' : 'Oeffnen'}
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="grid gap-3 border-t border-slate-100 p-3 xl:grid-cols-3">
                          {shifts.map((shift) => (
                            <CurrentShiftCard
                              date={dateGroup.date}
                              isWorking={isWorking}
                              jobs={dateGroup.shifts[shift.value]}
                              key={shift.value}
                              onDeleteJob={requestDeleteJob}
                              onEditJob={openEditJob}
                              onDropJob={(jobId) => void handleMoveJobToShift(jobId, dateGroup.date, shift.value)}
                              onReopenJob={(job) => void handleReopenJob(job)}
                              shift={shift}
                            />
                          ))}
                        </div>
                      )}
                    </article>
                  )
                })}
                {planDates.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Noch keine Jobs geplant.</p>}
              </div>
            </section>
          </section>
        </div>
      </section>
      {editingJob && editDraft && (
        <JobEditPanel
          draft={editDraft}
          isWorking={isWorking}
          onChange={(patch) => setEditDraft((current) => (current ? { ...current, ...patch } : current))}
          onClose={closeEditJob}
          onDelete={requestDeleteEditedJob}
          onSave={() => void saveEditedJob()}
        />
      )}
      {deleteConfirmation && (
        <DeleteConfirmationDialog
          confirmation={deleteConfirmation}
          isWorking={isWorking}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={() => void confirmDeleteEditedJob()}
        />
      )}
      <ToastStack onDismiss={dismissToast} toasts={toasts} />
    </main>
  )
}

function RecommendationDatePreview({
  dateSimulation,
  stagedJobIds,
}: {
  dateSimulation: NonNullable<PlannerRecommendation['forwardShiftSimulations']>[number]
  stagedJobIds: Set<string>
}) {
  const plannedJobs = dateSimulation.shiftSimulations.reduce(
    (total, simulation) => total + simulation.plannedJobs.filter((item) => stagedJobIds.has(item.job.id)).length,
    0,
  )
  const robotMinutes = dateSimulation.shiftSimulations.reduce(
    (total, simulation) =>
      total +
      simulation.plannedJobs
        .filter((item) => stagedJobIds.has(item.job.id))
        .reduce((shiftTotal, item) => shiftTotal + item.robotMinutes, 0),
    0,
  )

  return (
    <article>
      <div className="border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-slate-950">{formatPlanDate(dateSimulation.date)}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{plannedJobs} neue Jobs / {robotMinutes}m Roboter</p>
          </div>
          <span className="rounded-lg bg-white px-2 py-1 text-xs font-black text-slate-600">Nur Vorliste</span>
        </div>
      </div>
      <div className="grid gap-3 p-3 lg:grid-cols-3">
        {dateSimulation.shiftSimulations.map((simulation) => (
          <RecommendationColumn key={`${dateSimulation.date}-${simulation.shift}`} simulation={simulation} stagedJobIds={stagedJobIds} />
        ))}
      </div>
    </article>
  )
}

function RecommendationColumn({
  simulation,
  stagedJobIds,
}: {
  simulation: PlannerRecommendation['shiftSimulations'][number]
  stagedJobIds: Set<string>
}) {
  const plannedJobs = simulation.plannedJobs.filter((item) => stagedJobIds.has(item.job.id))
  const rolloverJobs = simulation.rolloverJobs.filter((job) => stagedJobIds.has(job.id))
  const newRobotMinutes = plannedJobs.reduce((total, item) => total + item.robotMinutes, 0)
  const lockedJobs = simulation.lockedJobs ?? []
  const lockedRobotMinutes = simulation.lockedRobotMinutes ?? Math.max(0, simulation.robotUsedMinutes - newRobotMinutes)
  const remainingRobotMinutes = Math.max(0, simulation.targetRobotMinutes - lockedRobotMinutes - newRobotMinutes)

  return (
    <article className="overflow-hidden rounded-xl border border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-slate-950">{getShiftName(simulation.shift)}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {lockedRobotMinutes}m vorhanden + {newRobotMinutes}m neu / Ziel {simulation.targetRobotMinutes}m
            </p>
          </div>
          <span className="rounded-xl bg-blue-100 px-3 py-1 text-sm font-black text-blue-700">{simulation.robotUtilizationPercent}%</span>
        </div>
        <div className="mt-3 grid gap-2 text-xs font-black text-slate-500 sm:grid-cols-3">
          <span className="rounded-lg bg-white px-2 py-1">{lockedJobs.length} geplant</span>
          <span className="rounded-lg bg-white px-2 py-1">{plannedJobs.length} neu</span>
          <span className="rounded-lg bg-white px-2 py-1">{remainingRobotMinutes}m frei</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {plannedJobs.map((item) => (
          <JobSummary key={item.job.id} job={item.job} suffix={`VR-${item.vorrichtung}`} />
        ))}
        {plannedJobs.length === 0 && <p className="p-4 text-sm font-bold text-slate-500">Keine neuen Jobs.</p>}
      </div>
      {rolloverJobs.length > 0 && (
        <div className="border-t border-rose-100 bg-rose-50 p-3">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Rollt weiter</p>
          {rolloverJobs.map((job) => (
            <JobSummary key={job.id} job={job} />
          ))}
        </div>
      )}
    </article>
  )
}

function ApprovalSection({
  isWorking,
  jobs,
  onApprove,
  onEdit,
  onReject,
}: {
  isWorking: boolean
  jobs: Job[]
  onApprove: (job: Job) => void
  onEdit: (job: Job) => void
  onReject: (job: Job) => void
}) {
  const pendingJobs = jobs.filter((job) => isPendingApproval(job))
  const rejectedJobs = jobs.filter((job) => job.approvalStatus === 'rejected')

  return (
    <section className={`${cardClassName} overflow-hidden`}>
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle
            kicker="4. Freigabe"
            title="Bediener-Meldungen pruefen"
            text="Pending Jobs werden nicht automatisch geplant, bis der Supervisor sie freigibt."
          />
          <span className="rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-700">{pendingJobs.length} offen</span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {pendingJobs.map((job) => (
          <ApprovalJobRow
            isWorking={isWorking}
            job={job}
            key={job.id}
            onApprove={onApprove}
            onEdit={onEdit}
            onReject={onReject}
          />
        ))}
        {pendingJobs.length === 0 && (
          <p className="p-5 text-sm font-bold text-emerald-700">Keine Jobs warten auf Freigabe.</p>
        )}
      </div>

      {rejectedJobs.length > 0 && (
        <div className="border-t border-rose-100 bg-rose-50/70 p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.08em] text-rose-700">Abgelehnt</p>
          <div className="grid gap-3 md:grid-cols-2">
            {rejectedJobs.map((job) => (
              <JobSummary
                action={
                  <div className="flex gap-2">
                    <IconButton label="Bearbeiten" disabled={isWorking} onClick={() => onEdit(job)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton label="Freigeben" disabled={isWorking} onClick={() => onApprove(job)} tone="emerald">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                  </div>
                }
                job={job}
                key={job.id}
                suffix={getShiftName(job.shift)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ApprovalJobRow({
  isWorking,
  job,
  onApprove,
  onEdit,
  onReject,
}: {
  isWorking: boolean
  job: Job
  onApprove: (job: Job) => void
  onEdit: (job: Job) => void
  onReject: (job: Job) => void
}) {
  return (
    <article className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <JobSummary job={job} suffix={`${formatPlanDate(job.date)} / ${getShiftName(job.shift)}`} />
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <IconButton label="Bearbeiten" disabled={isWorking} onClick={() => onEdit(job)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </IconButton>
        <IconButton label="Ablehnen" disabled={isWorking} onClick={() => onReject(job)} tone="rose">
          <X className="h-4 w-4" aria-hidden="true" />
        </IconButton>
        <IconButton label="Freigeben" disabled={isWorking} onClick={() => onApprove(job)} tone="emerald">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>
    </article>
  )
}

function CurrentShiftCard({
  date,
  isWorking,
  jobs,
  onDeleteJob,
  onEditJob,
  onDropJob,
  onReopenJob,
  shift,
}: {
  date: string
  isWorking: boolean
  jobs: Job[]
  onDeleteJob: (job: Job) => void
  onEditJob: (job: Job) => void
  onDropJob: (jobId: string) => void
  onReopenJob: (job: Job) => void
  shift: { name: string; time: string; value: ShiftCode }
}) {
  const robotMinutes = getJobsRobotMinutes(jobs)
  const utilizationPercent = getRobotUtilizationPercent(robotMinutes)
  const activeJobs = jobs.filter((job) => job.status !== 'done')
  const doneJobs = jobs.filter((job) => job.status === 'done')

  return (
    <article
      className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm shadow-slate-200/60"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const jobId = event.dataTransfer.getData('text/plain')

        if (jobId && !isWorking) {
          onDropJob(jobId)
        }
      }}
    >
      <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-950">{shift.name}</p>
              <span className="text-[11px] font-bold text-slate-400">{shift.time}</span>
            </div>
            <p className="mt-0.5 text-[11px] font-bold text-slate-500">
              {formatPlanDate(date)} / {robotMinutes}m Roboter
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">{utilizationPercent}%</span>
          </div>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {activeJobs.map((job) => (
          <div
            draggable={!isWorking}
            key={job.id}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', job.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <JobSummary
              action={
                <div className="flex gap-1.5">
                  <IconButton label="Bearbeiten" disabled={isWorking} onClick={() => onEditJob(job)} size="sm">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                  <IconButton label="Loeschen" disabled={isWorking || job.status === 'done'} onClick={() => onDeleteJob(job)} size="sm" tone="rose">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                </div>
              }
              job={job}
              suffix={`VR-${job.vorrichtung}`}
            />
          </div>
        ))}
        {doneJobs.length > 0 && (
          <div className="bg-emerald-50/70 p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Fertig gemeldet</p>
            <div className="space-y-2">
              {doneJobs.map((job) => (
                <JobSummary
                  action={
                    <div className="flex gap-2">
                      <IconButton label="Bearbeiten" disabled={isWorking} onClick={() => onEditJob(job)} size="sm">
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </IconButton>
                      <IconButton label="Wieder oeffnen" disabled={isWorking} onClick={() => onReopenJob(job)} size="sm" tone="emerald">
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      </IconButton>
                    </div>
                  }
                  job={job}
                  key={job.id}
                  suffix={`VR-${job.vorrichtung}`}
                />
              ))}
            </div>
          </div>
        )}
        {jobs.length === 0 && <p className="p-4 text-sm font-bold text-slate-500">Keine Jobs.</p>}
      </div>
    </article>
  )
}

function JobSummary({ action, job, suffix }: { action?: React.ReactNode; job: Job; suffix?: string }) {
  return (
    <div className={`p-3 transition ${job.status === 'done' ? 'rounded-xl border border-emerald-100 bg-white/80' : 'hover:bg-slate-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-slate-950">{job.faNumber}</p>
            <JobStatusBadge job={job} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <JobTypeBadge jobType={job.jobType} />
            <p className="text-xs font-bold text-slate-500">
              {job.projekt} / Art. {job.artikelNummer} / Schritt {job.schritt}
            </p>
          </div>
        </div>
        {suffix && <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{suffix}</span>}
      </div>
      <p className="mt-2 text-xs font-bold text-slate-500">
        Roboter {job.remainingAnlageMinutes ?? job.anlageMinutes}m / Schlosser {job.schonGeheftet ? 0 : job.schlosserMinutes}m
      </p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

function JobStatusBadge({ job }: { job: Job }) {
  if (job.status === 'done') {
    return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-700">Fertig</span>
  }

  if (isPendingApproval(job)) {
    return <span className="rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-violet-700">Freigabe</span>
  }

  if (job.approvalStatus === 'rejected') {
    return <span className="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-rose-700">Abgelehnt</span>
  }

  if (job.schonGeheftet || job.jobType === 'repair') {
    return <span className="rounded-lg bg-blue-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-blue-700">Bereit</span>
  }

  return <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-amber-800">Heften</span>
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
  size = 'md',
  tone = 'slate',
}: {
  children: React.ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  size?: 'md' | 'sm'
  tone?: 'emerald' | 'rose' | 'slate'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50'
      : tone === 'rose'
        ? 'border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50'
        : 'border-slate-200 text-slate-700 hover:border-blue-200 hover:bg-blue-50'

  return (
    <button
      aria-label={label}
      className={`inline-flex items-center justify-center border bg-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl'} ${toneClass}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function JobTypeBadge({ compact = false, jobType }: { compact?: boolean; jobType: Job['jobType'] }) {
  const isRepair = jobType === 'repair'

  return (
    <span
      className={`inline-flex rounded-lg font-black uppercase tracking-[0.08em] ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} ${
        isRepair ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {isRepair ? (compact ? 'Rep.' : 'Reparatur') : compact ? 'Prod.' : 'Produktion'}
    </span>
  )
}

function JobEditPanel({
  draft,
  isWorking,
  onChange,
  onClose,
  onDelete,
  onSave,
}: {
  draft: JobEditDraft
  isWorking: boolean
  onChange: (patch: Partial<JobEditDraft>) => void
  onClose: () => void
  onDelete: () => void
  onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30 px-4 py-6 backdrop-blur-sm">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <SectionTitle kicker="Job bearbeiten" title={draft.faNumber || 'Neuer Job'} text="Aenderungen wirken direkt auf Planung und naechste Berechnung." />
            <button className={smallButtonClassName} type="button" onClick={onClose} disabled={isWorking}>
              Schliessen
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="FA Nummer" value={draft.faNumber} onChange={(value) => onChange({ faNumber: value })} />
            <TextField label="Projekt" value={draft.projekt} onChange={(value) => onChange({ projekt: value })} />
            <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
              Jobtyp
              <select className={`${inputClassName} w-full`} value={draft.jobType} onChange={(event) => onChange({ jobType: event.target.value as Job['jobType'] })}>
                <option value="production">Produktion</option>
                <option value="repair">Reparatur</option>
              </select>
            </label>
            <TextField label="Art. Nr." value={draft.artikelNummer} onChange={(value) => onChange({ artikelNummer: value })} />
            <TextField label="Datum" type="date" value={draft.date} onChange={(value) => onChange({ date: value })} />
            <TextField label="Schritt" type="number" value={draft.schritt} onChange={(value) => onChange({ schritt: value })} />
            <TextField label="VR" type="number" value={draft.vorrichtung} onChange={(value) => onChange({ vorrichtung: value })} />
            <TextField label="Menge" type="number" value={draft.menge} onChange={(value) => onChange({ menge: value })} />
            <TextField label="Roboter min" type="number" value={draft.anlageMinutes} onChange={(value) => onChange({ anlageMinutes: value })} />
            <TextField
              label="Schlosser min"
              type="number"
              value={draft.schonGeheftet ? '0' : draft.schlosserMinutes}
              onChange={(value) => onChange({ schlosserMinutes: value, schonGeheftet: false })}
            />
            <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
              Schicht
              <select className={`${inputClassName} w-full`} value={draft.shift} onChange={(event) => onChange({ shift: event.target.value as ShiftCode })}>
                {shifts.map((shift) => (
                  <option key={shift.value} value={shift.value}>
                    {shift.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
              Status
              <select className={`${inputClassName} w-full`} value={draft.status} onChange={(event) => onChange({ status: event.target.value as Job['status'] })}>
                <option value="open">Offen</option>
                <option value="running">Laeuft</option>
                <option value="done">Fertig</option>
                <option value="blocked">Blockiert</option>
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Checkbox label="Schon geheftet" checked={draft.schonGeheftet} onChange={(checked) => onChange({ schonGeheftet: checked })} />
            <Checkbox label="Prioritaet" checked={draft.isPriority} onChange={(checked) => onChange({ isPriority: checked })} />
            <Checkbox label="Erzwingen" checked={draft.isForced} onChange={(checked) => onChange({ isForced: checked })} />
            <Checkbox label="Halten" checked={draft.isHeld} onChange={(checked) => onChange({ isHeld: checked })} />
          </div>

          <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50 p-4">
            <p className="font-black text-rose-900">Loeschen mit Schritt-Folge</p>
            <p className="mt-1 text-sm font-bold leading-6 text-rose-800">
              Produktion: offene spaetere Schritte derselben FA werden ebenfalls geloescht. Reparatur: nur dieser Reparatur-Job wird geloescht. Fertige Schritte bleiben erhalten.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-between">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={onDelete}
            disabled={isWorking || draft.status === 'done'}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Loeschen
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button className={secondaryButtonClassName} type="button" onClick={onClose} disabled={isWorking}>
            Abbrechen
          </button>
          <button className={primaryButtonClassName} type="button" onClick={onSave} disabled={isWorking}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Uebernehmen
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmationDialog({
  confirmation,
  isWorking,
  onCancel,
  onConfirm,
}: {
  confirmation: DeleteConfirmation
  isWorking: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { editingJob, jobsToDelete, skippedDoneJobs } = confirmation
  const isRepair = editingJob.jobType === 'repair'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/25">
        <div className="flex items-start gap-4 border-b border-slate-100 p-5">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-[0.12em] text-rose-700">Loeschen bestaetigen</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {isRepair ? `${editingJob.faNumber} Reparatur loeschen?` : `${editingJob.faNumber} ab Schritt ${editingJob.schritt} loeschen?`}
            </h2>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
              {isRepair
                ? 'Es wird nur dieser Reparatur-Job geloescht. Die Produktionskette bleibt unveraendert.'
                : 'Offene und geplante spaetere Produktions-Schritte derselben FA werden ebenfalls geloescht.'}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Betroffene Jobs</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {jobsToDelete.map((job) => (
                <span key={job.id} className="rounded-lg bg-white px-2 py-1 text-xs font-black text-slate-700 shadow-sm">
                  Schritt {job.schritt} / VR-{job.vorrichtung}
                </span>
              ))}
            </div>
          </div>

          {skippedDoneJobs.length > 0 && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-800">
              {skippedDoneJobs.length} fertige Schritt(e) bleiben erhalten.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
          <button className={secondaryButtonClassName} type="button" onClick={onCancel} disabled={isWorking}>
            Abbrechen
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-black text-white shadow-md shadow-rose-700/15 transition hover:-translate-y-0.5 hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={onConfirm}
            disabled={isWorking}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Jetzt loeschen
          </button>
        </div>
      </section>
    </div>
  )
}

function ToastStack({ onDismiss, toasts }: { onDismiss: (id: string) => void; toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-6">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} onDismiss={() => onDismiss(toast.id)} toast={toast} />
      ))}
    </div>
  )
}

function ToastCard({ onDismiss, toast }: { onDismiss: () => void; toast: ToastMessage }) {
  const toneClass = {
    error: 'border-rose-100 bg-rose-50 text-rose-900',
    info: 'border-blue-100 bg-blue-50 text-blue-900',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-900',
  }[toast.tone]
  const iconClass = {
    error: 'bg-rose-100 text-rose-700',
    info: 'bg-blue-100 text-blue-700',
    success: 'bg-emerald-100 text-emerald-700',
  }[toast.tone]

  return (
    <article className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xl shadow-slate-950/10 backdrop-blur ${toneClass}`}>
      <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        {toast.tone === 'error' ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
      </span>
      <p className="min-w-0 flex-1 text-sm font-bold leading-6">{toast.text}</p>
      <button
        aria-label="Meldung schliessen"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-current opacity-70 transition hover:bg-white/60 hover:opacity-100"
        type="button"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </article>
  )
}

function CapacityCard({
  form,
  onChange,
  shift,
}: {
  form: CapacityForm[ShiftCode]
  onChange: (key: keyof CapacityForm[ShiftCode], value: string) => void
  shift: { name: string; time: string }
}) {
  return (
    <article className="rounded-xl border border-slate-100 p-4">
      <p className="font-black text-slate-950">{shift.name}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{shift.time}</p>
      <div className="mt-4 grid gap-3">
        <TextField label="Schlosser" type="number" value={form.schlosserCount} onChange={(value) => onChange('schlosserCount', value)} />
        <TextField label="VR Plaetze" type="number" value={form.vorrichtungCount} onChange={(value) => onChange('vorrichtungCount', value)} />
        <TextField label="Roboter Ziel %" type="number" value={form.targetRobotPercent} onChange={(value) => onChange('targetRobotPercent', value)} />
      </div>
    </article>
  )
}

function WarningList({ title, warnings }: { title: string; warnings: string[] }) {
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
      <p className="font-black text-amber-900">{title}</p>
      <ul className="mt-2 space-y-1 text-sm font-bold text-amber-800">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  )
}

function StatusPill({ job }: { job: Job }) {
  const label = job.status === 'done' ? 'Fertig' : job.schonGeheftet ? 'Schon geheftet' : 'Heften noetig'
  const className =
    job.status === 'done'
      ? 'bg-emerald-100 text-emerald-700'
      : job.schonGeheftet
        ? 'bg-blue-100 text-blue-700'
        : 'bg-amber-100 text-amber-700'

  return <span className={`inline-flex rounded-xl px-3 py-1 text-xs font-black ${className}`}>{label}</span>
}

function SectionTitle({ kicker, text, title }: { kicker: string; text: string; title: string }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">{kicker}</p>
      <h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <article className={`${cardClassName} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
        </div>
        <span className="rounded-xl bg-blue-50 p-3 text-blue-700">{icon}</span>
      </div>
    </article>
  )
}

function SmartTile({ label, tone = 'blue', value }: { label: string; tone?: 'amber' | 'blue' | 'emerald' | 'rose'; value: string }) {
  const toneClass = {
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-800',
    emerald: 'bg-emerald-50 text-emerald-800',
    rose: 'bg-rose-50 text-rose-800',
  }[tone]

  return (
    <div className={`rounded-xl p-4 ${toneClass}`}>
      <p className="text-xs font-black uppercase tracking-[0.08em] opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  )
}

function TextField({
  className = '',
  label,
  onChange,
  type = 'text',
  value,
}: {
  className?: string
  label: string
  onChange: (value: string) => void
  type?: string
  value: string
}) {
  return (
    <label className={`grid min-w-0 gap-2 text-sm font-bold text-slate-700 ${className}`}>
      {label}
      <input className={`${inputClassName} w-full`} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function Checkbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
      <input className="h-4 w-4 accent-blue-700" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function createCapacityForm(capacities: ShiftCapacity[]): CapacityForm {
  return shifts.reduce<CapacityForm>((form, shift) => {
    const capacity = capacities.find((item) => item.shift === shift.value)

    return {
      ...form,
      [shift.value]: capacity
        ? {
            id: capacity.id,
            schlosserCount: String(capacity.schlosserCount),
            vorrichtungCount: String(capacity.vorrichtungCount),
            targetRobotPercent: String(capacity.targetRobotPercent),
          }
        : emptyCapacityForm[shift.value],
    }
  }, emptyCapacityForm)
}

function createPlanDateGroups(jobs: Job[]) {
  const sortedDates = Array.from(new Set(jobs.map((job) => job.date))).sort()

  return sortedDates.map((date) => {
    const dateJobs = jobs.filter((job) => job.date === date)
    const shiftsByDate = shifts.reduce<Record<ShiftCode, Job[]>>(
      (groups, shift) => ({
        ...groups,
        [shift.value]: dateJobs.filter((job) => job.shift === shift.value),
      }),
      { N: [], F: [], S: [] },
    )

    return {
      date,
      shifts: shiftsByDate,
      totalJobs: dateJobs.length,
    }
  })
}

function createAppendOnlyRecommendation({
  capacityForm,
  date,
  lockedJobs,
  robot,
  robotId,
  stagedJobs,
  startShift,
}: {
  capacityForm: CapacityForm
  date: string
  lockedJobs: Job[]
  robot: Robot
  robotId: string
  stagedJobs: Job[]
  startShift: ShiftCode
}): PlannerRecommendation {
  const shiftOrder: Record<ShiftCode, number> = { N: 1, F: 2, S: 3 }
  const appendStart = getAppendStart(lockedJobs, date, startShift)
  const lockedUsage = new Map<string, number>()
  const plannedByDate = new Map<string, Record<ShiftCode, PlannerRecommendation['shiftSimulations'][number]['plannedJobs']>>()
  const rolloverByDate = new Map<string, Record<ShiftCode, Job[]>>()
  const finalRolloverJobs: Job[] = []
  const simulatedDates: string[] = [appendStart.date]
  let pendingJobs = sortSimulationJobs(stagedJobs)
  const completedStepByFaNumber = createCompletedStepMap(lockedJobs)
  const maxStepByFaNumber = createMaxStepMap([...lockedJobs, ...stagedJobs])
  const prerequisiteStepByJobId = createPrerequisiteStepMap([...lockedJobs, ...stagedJobs])
  const fixtureOwnerByFixture = createFixtureOwnerMap(lockedJobs, maxStepByFaNumber)

  for (const job of lockedJobs.filter(isActivePlannedJob)) {
    const key = getShiftKey(job.date, job.shift)
    lockedUsage.set(key, (lockedUsage.get(key) ?? 0) + (job.remainingAnlageMinutes ?? job.anlageMinutes))
  }

  for (let dayIndex = 0, cursorDate = appendStart.date; dayIndex < 10 && pendingJobs.length > 0; dayIndex += 1, cursorDate = addDays(cursorDate, 1)) {
    if (!simulatedDates.includes(cursorDate)) {
      simulatedDates.push(cursorDate)
    }
    const availableShifts = shifts.filter((shift) => dayIndex > 0 || shiftOrder[shift.value] >= shiftOrder[appendStart.shift])

    for (const shift of availableShifts) {
      if (pendingJobs.length === 0) break

      const key = getShiftKey(cursorDate, shift.value)
      const lockedMinutes = lockedUsage.get(key) ?? 0
      const targetRobotMinutes = getTargetRobotMinutes(capacityForm[shift.value])
      const result = simulateAppendShift({
        capacityForm: capacityForm[shift.value],
        completedStepByFaNumber,
        fixtureOwnerByFixture,
        initialRobotMinute: lockedMinutes,
        jobs: pendingJobs,
        maxStepByFaNumber,
        prerequisiteStepByJobId,
        targetRobotMinutes,
      })

      if (result.plannedJobs.length > 0) {
        getPlannedJobsBucket(plannedByDate, cursorDate, shift.value).push(...result.plannedJobs)
      }

      if (result.rolloverJobs.length > 0) {
        getRolloverJobsBucket(rolloverByDate, cursorDate, shift.value).push(...result.rolloverJobs)
      }

      pendingJobs = result.rolloverJobs
    }

    if (pendingJobs.length > 0) {
      const nextDate = addDays(cursorDate, 1)

      if (!simulatedDates.includes(nextDate)) {
        simulatedDates.push(nextDate)
      }
    }
  }

  finalRolloverJobs.push(...pendingJobs)

  const simulationDates = Array.from(new Set([...simulatedDates, ...plannedByDate.keys(), ...rolloverByDate.keys()])).sort()
  const forwardShiftSimulations = simulationDates.map((simulationDate) => ({
    date: simulationDate,
    shiftSimulations: shifts.map((shift) => {
      const key = getShiftKey(simulationDate, shift.value)
      const targetRobotMinutes = getTargetRobotMinutes(capacityForm[shift.value])
      const lockedShiftJobs = lockedJobs.filter((job) => job.date === simulationDate && job.shift === shift.value && isActivePlannedJob(job))
      const lockedMinutes = lockedUsage.get(key) ?? 0
      const newMinutes = (plannedByDate.get(simulationDate)?.[shift.value] ?? []).reduce((total, item) => total + item.robotMinutes, 0)
      const robotUsedMinutes = lockedMinutes + newMinutes

      return {
        lockedJobs: lockedShiftJobs,
        lockedRobotMinutes: lockedMinutes,
        plannedJobs: plannedByDate.get(simulationDate)?.[shift.value] ?? [],
        robotIdleMinutes: Math.max(0, targetRobotMinutes - robotUsedMinutes),
        robotUsedMinutes,
        robotUtilizationPercent: targetRobotMinutes > 0 ? Math.min(100, Math.round((robotUsedMinutes / targetRobotMinutes) * 100)) : 0,
        rolloverJobs: rolloverByDate.get(simulationDate)?.[shift.value] ?? [],
        shift: shift.value,
        targetRobotMinutes,
        warnings: lockedMinutes > 0 ? [`${lockedMinutes}m sind bereits durch bestehende Plan-Jobs belegt.`] : [],
        workingMinutes: robotShiftWorkingMinutes,
      }
    }),
  }))
  const firstSlide = forwardShiftSimulations[0]
  const capacities = shifts.map((shift) => ({
    id: capacityForm[shift.value].id ?? `local-${date}-${shift.value}`,
    date,
    robotId,
    shift: shift.value,
    schlosserCount: toNumber(capacityForm[shift.value].schlosserCount, 0),
    targetRobotPercent: toNumber(capacityForm[shift.value].targetRobotPercent, 100),
    vorrichtungCount: toNumber(capacityForm[shift.value].vorrichtungCount, 0),
  }))
  const rolloverJobs = forwardShiftSimulations.flatMap((slide) => slide.shiftSimulations.flatMap((simulation) => simulation.rolloverJobs))

  return {
    blockedJobs: [],
    capacities,
    completedJobs: [],
    date,
    finalRolloverJobs,
    forwardShiftSimulations,
    heldJobs: [],
    jobs: stagedJobs,
    missingCapacityWarnings: [],
    needsHeftenJobs: stagedJobs.filter((job) => !job.schonGeheftet && job.jobType === 'production'),
    readyJobs: stagedJobs.filter((job) => job.schonGeheftet || job.jobType === 'repair'),
    robot,
    robotId,
    rolloverJobs,
    sequenceWarnings: [],
    shiftSimulations: firstSlide?.shiftSimulations ?? [],
    summary: {
      anlageMinutesRemaining: stagedJobs.reduce((total, job) => total + (job.remainingAnlageMinutes ?? job.anlageMinutes), 0),
      blockedJobs: 0,
      completedJobs: 0,
      finalRolloverJobs: finalRolloverJobs.length,
      heldJobs: 0,
      missingCapacityWarnings: 0,
      needsHeftenJobs: stagedJobs.filter((job) => !job.schonGeheftet && job.jobType === 'production').length,
      readyJobs: stagedJobs.filter((job) => job.schonGeheftet || job.jobType === 'repair').length,
      rolloverJobs: rolloverJobs.length,
      ruestMinutesRemaining: 0,
      sequenceWarnings: 0,
      totalJobs: stagedJobs.length,
    },
  }
}

function getShiftKey(date: string, shift: ShiftCode) {
  return `${date}:${shift}`
}

function getAppendStart(lockedJobs: Job[], fallbackDate: string, fallbackShift: ShiftCode): { date: string; shift: ShiftCode } {
  const appendableJobs = lockedJobs.filter(isActivePlannedJob)

  if (appendableJobs.length === 0) {
    return { date: fallbackDate, shift: fallbackShift }
  }

  const lastJob = appendableJobs.reduce((last, job) => (comparePlanPosition(job, last) > 0 ? job : last), appendableJobs[0])

  return { date: lastJob.date, shift: lastJob.shift }
}

function isActivePlannedJob(job: Job) {
  return !job.isHeld && job.status !== 'done' && job.status !== 'blocked'
}

function comparePlanPosition(first: Pick<Job, 'date' | 'shift'>, second: Pick<Job, 'date' | 'shift'>) {
  const shiftOrder: Record<ShiftCode, number> = { N: 1, F: 2, S: 3 }

  if (first.date !== second.date) {
    return first.date.localeCompare(second.date)
  }

  return shiftOrder[first.shift] - shiftOrder[second.shift]
}

function getTargetRobotMinutes(form: CapacityForm[ShiftCode]) {
  return Math.round(robotShiftWorkingMinutes * (Math.min(100, Math.max(0, toNumber(form.targetRobotPercent, 100))) / 100))
}

function simulateSingleShiftAppend({
  capacityForm,
  date,
  lockedJobs,
  shift,
  stagedJobs,
}: {
  capacityForm: CapacityForm[ShiftCode]
  date: string
  lockedJobs: Job[]
  shift: ShiftCode
  stagedJobs: Job[]
}) {
  const lockedJobsUntilShift = lockedJobs.filter((job) => comparePlanPosition(job, { date, shift }) <= 0)
  const lockedShiftMinutes = lockedJobs
    .filter((job) => job.date === date && job.shift === shift && job.status !== 'done' && job.status !== 'blocked')
    .reduce((total, job) => total + (job.remainingAnlageMinutes ?? job.anlageMinutes), 0)
  const maxStepByFaNumber = createMaxStepMap([...lockedJobs, ...stagedJobs])
  const prerequisiteStepByJobId = createPrerequisiteStepMap([...lockedJobs, ...stagedJobs])

  return simulateAppendShift({
    capacityForm,
    completedStepByFaNumber: createCompletedStepMap(lockedJobsUntilShift),
    fixtureOwnerByFixture: createFixtureOwnerMap(lockedJobsUntilShift, maxStepByFaNumber),
    initialRobotMinute: lockedShiftMinutes,
    jobs: sortSimulationJobs(stagedJobs),
    maxStepByFaNumber,
    prerequisiteStepByJobId,
    targetRobotMinutes: getTargetRobotMinutes(capacityForm),
  })
}

function simulateAppendShift({
  capacityForm,
  completedStepByFaNumber,
  fixtureOwnerByFixture,
  initialRobotMinute,
  jobs,
  maxStepByFaNumber,
  prerequisiteStepByJobId,
  targetRobotMinutes,
}: {
  capacityForm: CapacityForm[ShiftCode]
  completedStepByFaNumber: Map<string, number>
  fixtureOwnerByFixture: Map<number, string>
  initialRobotMinute: number
  jobs: Job[]
  maxStepByFaNumber: Map<string, number>
  prerequisiteStepByJobId: Map<string, number>
  targetRobotMinutes: number
}) {
  const plannedJobs: PlannerRecommendation['shiftSimulations'][number]['plannedJobs'] = []
  const plannedJobIds = new Set<string>()
  const fixtureAvailableAt = createFixtureAvailability(toNumber(capacityForm.vorrichtungCount, 0), initialRobotMinute)
  const schlosserAvailableAt = Array.from({ length: toNumber(capacityForm.schlosserCount, 0) }, () => initialRobotMinute)
  const availableRobotMinutes = Math.max(0, targetRobotMinutes - initialRobotMinute)
  let plannedRobotMinutes = 0
  let robotAvailableAt = initialRobotMinute

  while (plannedJobIds.size < jobs.length) {
    const candidates = jobs
      .filter((job) => !plannedJobIds.has(job.id))
      .filter((job) => canPlanStep(job, completedStepByFaNumber, prerequisiteStepByJobId))
      .filter((job) => canUseFixture(job, fixtureOwnerByFixture))
      .map((job) =>
        simulateCandidate({
          fixtureAvailableAt,
          job,
          robotAvailableAt,
          schlosserAvailableAt,
        }),
      )
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((first, second) => {
        if (first.robotStartMinute !== second.robotStartMinute) return first.robotStartMinute - second.robotStartMinute
        if (first.robotEndMinute !== second.robotEndMinute) return first.robotEndMinute - second.robotEndMinute
        if (first.job.schonGeheftet !== second.job.schonGeheftet) return first.job.schonGeheftet ? -1 : 1
        return getJobCreatedAt(first.job).localeCompare(getJobCreatedAt(second.job))
      })

    if (candidates.length === 0) break

    const nextCandidate = candidates.find(
      (candidate) =>
        candidate.robotEndMinute <= targetRobotMinutes &&
        plannedRobotMinutes + candidate.robotMinutes <= availableRobotMinutes,
    )

    if (!nextCandidate) {
      break
    }

    plannedJobs.push({
      job: nextCandidate.job,
      robotEndMinute: nextCandidate.robotEndMinute,
      robotMinutes: nextCandidate.robotMinutes,
      robotStartMinute: nextCandidate.robotStartMinute,
      schlosserEndMinute: nextCandidate.schlosserEndMinute,
      schlosserStartMinute: nextCandidate.schlosserStartMinute,
      vorrichtung: nextCandidate.job.vorrichtung,
    })
    plannedJobIds.add(nextCandidate.job.id)
    plannedRobotMinutes += nextCandidate.robotMinutes
    robotAvailableAt = nextCandidate.robotEndMinute
    fixtureAvailableAt.set(nextCandidate.job.vorrichtung, nextCandidate.robotEndMinute)

    if (nextCandidate.schlosserWorkerIndex !== null && nextCandidate.schlosserEndMinute !== null) {
      schlosserAvailableAt[nextCandidate.schlosserWorkerIndex] = nextCandidate.schlosserEndMinute
    }

    if (nextCandidate.job.jobType === 'production') {
      completedStepByFaNumber.set(nextCandidate.job.faNumber, nextCandidate.job.schritt)
      updateFixtureOwner(fixtureOwnerByFixture, maxStepByFaNumber, nextCandidate.job)
    }
  }

  return {
    plannedJobs,
    rolloverJobs: jobs.filter((job) => !plannedJobIds.has(job.id)),
  }
}

function simulateCandidate({
  fixtureAvailableAt,
  job,
  robotAvailableAt,
  schlosserAvailableAt,
}: {
  fixtureAvailableAt: Map<number, number>
  job: Job
  robotAvailableAt: number
  schlosserAvailableAt: number[]
}) {
  const fixtureReadyAt = fixtureAvailableAt.get(job.vorrichtung)

  if (fixtureReadyAt === undefined) return null

  const robotMinutes = job.remainingAnlageMinutes ?? job.anlageMinutes

  if (job.schonGeheftet || job.schlosserMinutes === 0 || job.jobType === 'repair') {
    const robotStartMinute = Math.max(robotAvailableAt, fixtureReadyAt)

    return {
      job,
      robotEndMinute: robotStartMinute + robotMinutes,
      robotMinutes,
      robotStartMinute,
      schlosserEndMinute: null,
      schlosserStartMinute: null,
      schlosserWorkerIndex: null,
    }
  }

  if (schlosserAvailableAt.length === 0) return null

  const schlosserWorkerIndex = findEarliestAvailableWorker(schlosserAvailableAt)
  const schlosserStartMinute = Math.max(schlosserAvailableAt[schlosserWorkerIndex], fixtureReadyAt)
  const schlosserEndMinute = schlosserStartMinute + job.schlosserMinutes
  const robotStartMinute = Math.max(robotAvailableAt, schlosserEndMinute)

  return {
    job,
    robotEndMinute: robotStartMinute + robotMinutes,
    robotMinutes,
    robotStartMinute,
    schlosserEndMinute,
    schlosserStartMinute,
    schlosserWorkerIndex,
  }
}

function canPlanStep(job: Job, completedStepByFaNumber: Map<string, number>, prerequisiteStepByJobId: Map<string, number>) {
  if (job.jobType !== 'production' || job.schritt <= 1 || job.schonGeheftet || job.isForced) return true

  const requiredStep = prerequisiteStepByJobId.get(job.id) ?? 0

  return requiredStep === 0 || (completedStepByFaNumber.get(job.faNumber) ?? 0) >= requiredStep
}

function canUseFixture(job: Job, fixtureOwnerByFixture: Map<number, string>) {
  if (job.jobType !== 'production') return true

  const owner = fixtureOwnerByFixture.get(job.vorrichtung)

  return !owner || owner === job.faNumber || job.isForced
}

function createCompletedStepMap(jobs: Job[]) {
  const completedStepByFaNumber = new Map<string, number>()

  for (const job of jobs) {
    if (job.jobType !== 'production') continue

    const currentStep = completedStepByFaNumber.get(job.faNumber) ?? 0

    if (job.schritt > currentStep) {
      completedStepByFaNumber.set(job.faNumber, job.schritt)
    }
  }

  return completedStepByFaNumber
}

function createMaxStepMap(jobs: Job[]) {
  const maxStepByFaNumber = new Map<string, number>()

  for (const job of jobs) {
    if (job.jobType !== 'production') continue

    const currentStep = maxStepByFaNumber.get(job.faNumber) ?? 0

    if (job.schritt > currentStep) {
      maxStepByFaNumber.set(job.faNumber, job.schritt)
    }
  }

  return maxStepByFaNumber
}

function createPrerequisiteStepMap(jobs: Job[]) {
  const productionJobs = jobs.filter((job) => job.jobType === 'production')
  const prerequisiteStepByJobId = new Map<string, number>()

  for (const job of productionJobs) {
    const highestExistingLowerStep = productionJobs
      .filter((otherJob) => otherJob.faNumber === job.faNumber && otherJob.schritt < job.schritt)
      .reduce((highestStep, otherJob) => Math.max(highestStep, otherJob.schritt), 0)

    prerequisiteStepByJobId.set(job.id, highestExistingLowerStep)
  }

  return prerequisiteStepByJobId
}

function createFixtureOwnerMap(jobs: Job[], maxStepByFaNumber: Map<string, number>) {
  const fixtureOwnerByFixture = new Map<number, string>()

  for (const job of sortJobs(jobs)) {
    if (job.jobType !== 'production') continue

    updateFixtureOwner(fixtureOwnerByFixture, maxStepByFaNumber, job)
  }

  return fixtureOwnerByFixture
}

function updateFixtureOwner(fixtureOwnerByFixture: Map<number, string>, maxStepByFaNumber: Map<string, number>, job: Job) {
  const maxStep = maxStepByFaNumber.get(job.faNumber) ?? job.schritt

  if (job.schritt >= maxStep || job.status === 'done') {
    fixtureOwnerByFixture.delete(job.vorrichtung)
    return
  }

  fixtureOwnerByFixture.set(job.vorrichtung, job.faNumber)
}

function createFixtureAvailability(vorrichtungCount: number, initialMinute: number) {
  const fixtureAvailableAt = new Map<number, number>()

  for (let fixture = 1; fixture <= vorrichtungCount; fixture += 1) {
    fixtureAvailableAt.set(fixture, initialMinute)
  }

  return fixtureAvailableAt
}

function findEarliestAvailableWorker(workerAvailableAt: number[]) {
  return workerAvailableAt.reduce((earliestIndex, availableAt, currentIndex) => (availableAt < workerAvailableAt[earliestIndex] ? currentIndex : earliestIndex), 0)
}

function sortSimulationJobs(jobs: Job[]) {
  return [...jobs].sort((first, second) => {
    if (first.isForced !== second.isForced) return first.isForced ? -1 : 1
    if (first.schonGeheftet !== second.schonGeheftet) return first.schonGeheftet ? -1 : 1
    if (first.schritt !== second.schritt) return first.schritt - second.schritt
    return getJobCreatedAt(first).localeCompare(getJobCreatedAt(second))
  })
}

function getPlannedJobsBucket(
  plannedByDate: Map<string, Record<ShiftCode, PlannerRecommendation['shiftSimulations'][number]['plannedJobs']>>,
  date: string,
  shift: ShiftCode,
) {
  let dateBucket = plannedByDate.get(date)

  if (!dateBucket) {
    dateBucket = { F: [], N: [], S: [] }
    plannedByDate.set(date, dateBucket)
  }

  return dateBucket[shift]
}

function getRolloverJobsBucket(rolloverByDate: Map<string, Record<ShiftCode, Job[]>>, date: string, shift: ShiftCode) {
  let dateBucket = rolloverByDate.get(date)

  if (!dateBucket) {
    dateBucket = { F: [], N: [], S: [] }
    rolloverByDate.set(date, dateBucket)
  }

  return dateBucket[shift]
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map((value) => Number(value))

  if (!year || !month || !day) return date

  const parsedDate = new Date(Date.UTC(year, month - 1, day))

  if (Number.isNaN(parsedDate.getTime())) return date

  parsedDate.setUTCDate(parsedDate.getUTCDate() + days)
  return parsedDate.toISOString().slice(0, 10)
}

function getRecommendationPlacements(recommendation: PlannerRecommendation) {
  const placements = new Map<string, { date: string; shift: ShiftCode }>()
  const slides = recommendation.forwardShiftSimulations?.length
    ? recommendation.forwardShiftSimulations
    : [{ date: recommendation.date, shiftSimulations: recommendation.shiftSimulations }]

  for (const slide of slides) {
    for (const shiftSimulation of slide.shiftSimulations) {
      for (const plannedJob of shiftSimulation.plannedJobs) {
        placements.set(plannedJob.job.id, {
          date: slide.date,
          shift: shiftSimulation.shift,
        })
      }
    }
  }

  return placements
}

function countRecommendationJobsAfterDate(recommendation: PlannerRecommendation, stagedJobIds: Set<string>, startDate: string) {
  const placements = getRecommendationPlacements(recommendation)
  let count = 0

  for (const [jobId, placement] of placements) {
    if (stagedJobIds.has(jobId) && placement.date > startDate) {
      count += 1
    }
  }

  return count
}

function parseJobUploadFile(fileName: string, fileText: string): Array<Partial<Job>> {
  if (fileName.toLowerCase().endsWith('.csv')) {
    return parseJobsCsv(fileText)
  }

  return JSON.parse(fileText) as Array<Partial<Job>>
}

function parseJobsCsv(fileText: string): Array<Partial<Job>> {
  const lines = fileText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim())

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    const row = headers.reduce<Record<string, string>>((current, header, index) => {
      current[header] = values[index]?.trim() ?? ''
      return current
    }, {})

    return {
      faNumber: row.faNumber,
      projekt: row.projekt,
      artikelNummer: row.artikelNummer,
      schritt: toNumber(row.schritt, 1),
      vorrichtung: toNumber(row.vorrichtung, 1),
      menge: toNumber(row.menge, 1),
      anlageMinutes: toNumber(row.anlageMinutes, 0),
      schlosserMinutes: toNumber(row.schlosserMinutes, 0),
      jobType: row.jobType === 'repair' ? 'repair' : 'production',
      schonGeheftet: parseBoolean(row.schonGeheftet),
      isPriority: parseBoolean(row.isPriority),
      isForced: parseBoolean(row.isForced),
      isHeld: parseBoolean(row.isHeld),
    }
  })
}

function splitCsvLine(line: string) {
  const values: string[] = []
  let currentValue = ''
  let isQuoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && nextCharacter === '"') {
      currentValue += '"'
      index += 1
      continue
    }

    if (character === '"') {
      isQuoted = !isQuoted
      continue
    }

    if (character === ',' && !isQuoted) {
      values.push(currentValue)
      currentValue = ''
      continue
    }

    currentValue += character
  }

  values.push(currentValue)
  return values
}

function parseBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false

  return ['true', '1', 'yes', 'ja', 'x'].includes(value.trim().toLowerCase())
}

function mergeOpenPlanDates(current: Set<string>, jobs: Job[]) {
  const next = new Set(current)

  if (next.size === 0) {
    next.add(plannerDate)
  }

  for (const job of jobs) {
    next.add(job.date)
  }

  return next
}

function readStoredJobPoolIds(): Set<string> {
  try {
    const rawValue = window.localStorage.getItem(jobPoolStorageKey)
    const parsedValue = rawValue ? JSON.parse(rawValue) : []

    return new Set<string>(typeof parsedValue === 'object' && Array.isArray(parsedValue) ? parsedValue.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function storeJobPoolIds(jobIds: Set<string>) {
  try {
    window.localStorage.setItem(jobPoolStorageKey, JSON.stringify([...jobIds]))
  } catch {
    // If local storage is unavailable, the UI still works for the current session.
  }
}

function sortJobs(jobs: Job[]) {
  const shiftOrder: Record<ShiftCode, number> = { N: 1, F: 2, S: 3 }

  return [...jobs].sort((first, second) => {
    if (first.date !== second.date) return first.date.localeCompare(second.date)
    if (first.shift !== second.shift) return shiftOrder[first.shift] - shiftOrder[second.shift]
    const firstCreatedAt = getJobCreatedAt(first)
    const secondCreatedAt = getJobCreatedAt(second)

    if (firstCreatedAt !== secondCreatedAt) return firstCreatedAt.localeCompare(secondCreatedAt)
    if (first.schonGeheftet !== second.schonGeheftet) return first.schonGeheftet ? -1 : 1
    if (first.faNumber !== second.faNumber) return first.faNumber.localeCompare(second.faNumber)
    return first.schritt - second.schritt
  })
}

function getJobCreatedAt(job: Job) {
  return (job as Job & { createdAt?: string }).createdAt ?? ''
}

function formatPlanDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate)
}

function getJobsRobotMinutes(jobs: Job[]) {
  return jobs.reduce((total, job) => total + (job.remainingAnlageMinutes ?? job.anlageMinutes), 0)
}

function getRobotUtilizationPercent(robotMinutes: number) {
  return Math.min(100, Math.round((robotMinutes / robotShiftWorkingMinutes) * 100))
}

function getShiftName(shift: ShiftCode) {
  return shifts.find((item) => item.value === shift)?.name ?? shift
}

function toNumber(value: string, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unbekannter Fehler'
}

function isPendingApproval(job: Job) {
  return job.approvalStatus === 'pending' || (!job.approvalStatus && job.isHeld)
}

function setDraftValue(key: keyof JobDraft, value: string, setDraft: React.Dispatch<React.SetStateAction<JobDraft>>) {
  setDraft((current) => ({ ...current, [key]: value }))
}

const smallButtonClassName =
  'inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'

const dangerGhostButtonClassName =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-100 bg-white px-4 text-sm font-black text-rose-700 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40'

const miniSelectClassName =
  'h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10'

const slideButtonClassName =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'
