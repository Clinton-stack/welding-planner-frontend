import {
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
  Save,
  Sparkles,
  Timer,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Link } from 'react-router-dom'
import {
  applyPlannerRecommendation,
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

const plannerDate = '2026-06-08'

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
  const [planningStartShift, setPlanningStartShift] = useState<ShiftCode>('N')
  const [jobPoolIds, setJobPoolIds] = useState<Set<string>>(() => new Set())
  const [openPlanDates, setOpenPlanDates] = useState<Set<string>>(() => new Set([plannerDate]))
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)
  const [message, setMessage] = useState('')
  const attachJobsInputRef = useRef<HTMLInputElement>(null)

  const selectedRobot = robots.find((robot) => robot.id === selectedRobotId)

  const loadPlannerData = useCallback(async (robotId?: string) => {
    setIsLoading(true)
    setMessage('')

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
        getShiftCapacities({ robotId: nextRobotId, date: plannerDate }),
        getPlannerRecommendation(nextRobotId, plannerDate).catch(() => null),
      ])

      setJobs(sortJobs(nextJobs))
      setOpenPlanDates((current) => mergeOpenPlanDates(current, nextJobs))
      setCapacityForm(createCapacityForm(nextCapacities))
      setRecommendation(nextRecommendation)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [selectedRobotId])

  useEffect(() => {
    void loadPlannerData()
  }, [])

  const planDates = useMemo(() => createPlanDateGroups(jobs), [jobs])
  const jobPoolJobs = useMemo(() => sortJobs(jobs.filter((job) => jobPoolIds.has(job.id))), [jobPoolIds, jobs])
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

  useEffect(() => {
    setRecommendationDateIndex((current) => Math.min(current, Math.max(recommendationDateSlides.length - 1, 0)))
  }, [recommendationDateSlides.length])

  const activeJobs = jobs.filter((job) => job.status !== 'done' && job.status !== 'blocked' && !job.isHeld)
  const plannedRobotMinutes = activeJobs.reduce((sum, job) => sum + (job.remainingAnlageMinutes ?? job.anlageMinutes), 0)
  const readyJobs = activeJobs.filter((job) => job.schonGeheftet).length

  const handleSeedDemo = async () => {
    setIsWorking(true)
    setMessage('')

    try {
      const result = await seedDemoPlannerData(planningStartShift)
      setJobPoolIds(new Set(result.createdJobIds))
      setRecommendation(null)
      setMessage(`Demo gespeichert: ${result.createdJobs} Jobs und ${result.createdCapacities} Kapazitaeten neu angelegt.`)
      await loadPlannerData(result.robot.id)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const handleCreateJob = async () => {
    if (!selectedRobotId) {
      setMessage('Bitte zuerst eine Anlage waehlen oder Demo-Daten anlegen.')
      return
    }

    if (!draft.faNumber.trim() || !draft.projekt.trim() || !draft.artikelNummer.trim()) {
      setMessage('FA Nummer, Projekt und Artikelnummer sind Pflichtfelder.')
      return
    }

    setIsWorking(true)
    setMessage('')

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
        isHeld: draft.isHeld,
        status: 'open',
        date: plannerDate,
        shift: planningStartShift,
      })
      setJobPoolIds((current) => new Set(current).add(createdJob.id))
      setRecommendation(null)
      setDraft((current) => ({ ...emptyDraft, projekt: current.projekt }))
      setMessage('Job wurde in der Datenbank angelegt.')
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const handleAttachJobsFile = async (file: File | undefined) => {
    if (!file) return

    if (!selectedRobotId) {
      setMessage('Bitte zuerst eine Anlage waehlen oder Demo-Daten anlegen.')
      return
    }

    setIsWorking(true)
    setMessage('')

    try {
      const rows = JSON.parse(await file.text()) as Array<Partial<Job>>
      const createdJobIds: string[] = []
      let createdJobs = 0

      for (const row of rows) {
        if (!row.faNumber || !row.projekt || !row.artikelNummer || !row.schritt || !row.vorrichtung) {
          continue
        }

        const createdJob = await createJob({
          faNumber: row.faNumber,
          projekt: row.projekt,
          artikelNummer: String(row.artikelNummer),
          schritt: Number(row.schritt),
          vorrichtung: Number(row.vorrichtung),
          menge: Number(row.menge ?? 1),
          robotId: selectedRobotId,
          anlageMinutes: Number(row.anlageMinutes ?? 0),
          schlosserMinutes: row.schonGeheftet ? 0 : Number(row.schlosserMinutes ?? 0),
          ruestMinutes: 0,
          jobType: row.jobType ?? 'production',
          schonGeheftet: Boolean(row.schonGeheftet),
          isPriority: Boolean(row.isPriority),
          isForced: Boolean(row.isForced),
          isHeld: Boolean(row.isHeld),
          status: 'open',
          date: plannerDate,
          shift: planningStartShift,
        })
        createdJobIds.push(createdJob.id)
        createdJobs += 1
      }

      setJobPoolIds((current) => new Set([...current, ...createdJobIds]))
      setRecommendation(null)
      setMessage(`${createdJobs} Jobs aus ${file.name} angelegt.`)
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      setMessage(error instanceof SyntaxError ? 'Jobdatei konnte nicht gelesen werden. Bitte JSON pruefen.' : getErrorMessage(error))
    } finally {
      setIsWorking(false)
      if (attachJobsInputRef.current) {
        attachJobsInputRef.current.value = ''
      }
    }
  }

  const handleSaveCapacities = async () => {
    if (!selectedRobotId) {
      setMessage('Bitte zuerst eine Anlage waehlen oder Demo-Daten anlegen.')
      return
    }

    setIsWorking(true)
    setMessage('')

    try {
      for (const shift of shifts) {
        const form = capacityForm[shift.value]
        const payload = {
          robotId: selectedRobotId,
          date: plannerDate,
          shift: shift.value,
          schlosserCount: toNumber(form.schlosserCount, 0),
          vorrichtungCount: toNumber(form.vorrichtungCount, 0),
          targetRobotPercent: toNumber(form.targetRobotPercent, 100),
        }

        if (form.id) {
          await updateShiftCapacity(form.id, payload)
        } else {
          await createShiftCapacity(payload)
        }
      }

      setMessage('Schichtkapazitaeten gespeichert.')
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const handleRecommend = async () => {
    if (!selectedRobotId) return

    setIsWorking(true)
    setMessage('')

    try {
      const nextRecommendation = await getPlannerRecommendation(selectedRobotId, plannerDate)
      const nextJobs = await getJobs({ robotId: selectedRobotId })

      setRecommendation(nextRecommendation)
      setRecommendationDateIndex(0)
      setJobs(sortJobs(nextJobs))
      setMessage('Empfehlung neu berechnet.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const handleApplyPlan = async () => {
    if (!selectedRobotId) return

    setIsWorking(true)
    setMessage('')

    try {
      await applyPlannerRecommendation(selectedRobotId, plannerDate)
      setJobPoolIds(new Set())
      setRecommendation(null)
      setRecommendationDateIndex(0)
      setMessage('Empfehlung wurde auf die Jobs angewendet.')
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const handlePatchJob = async (job: Job, patch: Partial<Job>, successMessage: string) => {
    setIsWorking(true)
    setMessage('')

    try {
      await updateJob(job.id, patch)
      setMessage(successMessage)
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      setMessage(getErrorMessage(error))
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
  }

  const saveEditedJob = async () => {
    if (!editingJob || !editDraft) return

    setIsWorking(true)
    setMessage('')

    try {
      await updateJob(editingJob.id, {
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
      setRecommendation(null)
      setMessage(`${editingJob.faNumber} wurde aktualisiert.`)
      closeEditJob()
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const deleteEditedJob = async () => {
    if (!editingJob) return

    if (editingJob.status === 'done') {
      setMessage('Fertige Jobs werden nicht automatisch geloescht.')
      return
    }

    const jobsToDelete = jobs
      .filter((job) => {
        if (
          job.robotId !== editingJob.robotId ||
          job.faNumber !== editingJob.faNumber ||
          job.jobType !== editingJob.jobType ||
          job.status === 'done'
        ) {
          return false
        }

        if (editingJob.jobType === 'repair') {
          return job.id === editingJob.id
        }

        return job.schritt >= editingJob.schritt
      })
      .sort((first, second) => first.schritt - second.schritt)
    const skippedDoneJobs =
      editingJob.jobType === 'production'
        ? jobs.filter(
            (job) =>
              job.robotId === editingJob.robotId &&
              job.faNumber === editingJob.faNumber &&
              job.jobType === editingJob.jobType &&
              job.schritt >= editingJob.schritt &&
              job.status === 'done',
          )
        : []

    const confirmed = window.confirm(
      editingJob.jobType === 'repair'
        ? `${editingJob.faNumber} Reparatur Schritt ${editingJob.schritt} loeschen?\n\nEs wird nur dieser Reparatur-Job geloescht.`
        : `${editingJob.faNumber} Schritt ${editingJob.schritt} loeschen?\n\nEs werden ${jobsToDelete.length} offene/geplante Produktions-Schritt(e) geloescht: ${jobsToDelete
            .map((job) => `Schritt ${job.schritt}`)
            .join(', ')}.\n${skippedDoneJobs.length > 0 ? `${skippedDoneJobs.length} fertige Schritt(e) bleiben erhalten.` : ''}`,
    )

    if (!confirmed) return

    setIsWorking(true)
    setMessage('')

    try {
      for (const job of jobsToDelete) {
        await deleteJob(job.id)
      }

      const deletedJobIds = new Set(jobsToDelete.map((job) => job.id))
      setJobPoolIds((current) => new Set([...current].filter((jobId) => !deletedJobIds.has(jobId))))
      setRecommendation(null)
      setRecommendationDateIndex(0)
      closeEditJob()
      setMessage(
        editingJob.jobType === 'repair'
          ? `${jobsToDelete.length} Reparatur-Job geloescht.`
          : `${jobsToDelete.length} Job(s) geloescht. Spaetere Produktions-Schritte derselben FA wurden mit entfernt.${skippedDoneJobs.length > 0 ? ` ${skippedDoneJobs.length} fertige Schritt(e) wurden nicht geloescht.` : ''}`,
      )
      await loadPlannerData(selectedRobotId)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const handleMoveJobToShift = async (jobId: string, date: string, shift: ShiftCode) => {
    const job = jobs.find((item) => item.id === jobId)

    if (!job || (job.date === date && job.shift === shift)) return

    await handlePatchJob(
      job,
      { date, shift, isForced: true },
      `${job.faNumber} wurde manuell nach ${formatPlanDate(date)} / ${getShiftName(shift)} gezogen und erzwungen.`,
    )
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
        {message && (
          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            {message}
          </div>
        )}

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
                  kicker="1. Jobliste"
                  title="Job-Pool fuer den Planungslauf"
                  text="Alle neuen Jobs starten in der gewaehlten Start-Schicht. Ueberlauf geht zur naechsten Schicht und danach zum naechsten Datum."
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    accept=".json,application/json"
                    className="hidden"
                    ref={attachJobsInputRef}
                    type="file"
                    onChange={(event) => void handleAttachJobsFile(event.target.files?.[0])}
                  />
                  <button className={secondaryButtonClassName} type="button" onClick={() => attachJobsInputRef.current?.click()} disabled={isWorking}>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Jobs anhaengen
                  </button>
                  <button className={secondaryButtonClassName} type="button" onClick={handleSeedDemo} disabled={isWorking}>
                    <Database className="h-4 w-4" aria-hidden="true" />
                    Demo-Daten verwenden
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
                    Job speichern
                  </button>
                </div>
              </div>

              <div className="mt-5 max-h-[430px] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-[0.08em] text-slate-500 shadow-sm">
                    <tr>
                      <th className="px-3 py-3">FA</th>
                      <th className="px-3 py-3">Projekt</th>
                      <th className="px-3 py-3">Typ</th>
                      <th className="px-3 py-3">Art.</th>
                      <th className="px-3 py-3">Schritt</th>
                      <th className="px-3 py-3">VR</th>
                      <th className="px-3 py-3">Roboter</th>
                      <th className="px-3 py-3">Schlosser</th>
                      <th className="px-3 py-3">Schicht</th>
                      <th className="px-3 py-3">Force</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Aktion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobPoolJobs.map((job) => (
                      <tr key={job.id} className="align-top">
                        <td className="px-3 py-3 font-black text-slate-950">{job.faNumber}</td>
                        <td className="px-3 py-3 font-bold text-slate-600">{job.projekt}</td>
                        <td className="px-3 py-3"><JobTypeBadge jobType={job.jobType} /></td>
                        <td className="px-3 py-3 font-bold text-slate-600">{job.artikelNummer}</td>
                        <td className="px-3 py-3 font-bold text-slate-600">{job.schritt}</td>
                        <td className="px-3 py-3">
                          <select
                            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
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
                        <td className="px-3 py-3 font-bold text-slate-600">{job.remainingAnlageMinutes ?? job.anlageMinutes}m</td>
                        <td className="px-3 py-3 font-bold text-slate-600">{job.schonGeheftet ? 0 : job.schlosserMinutes}m</td>
                        <td className="px-3 py-3">
                          <select
                            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
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
                        <td className="px-3 py-3">
                          <input
                            checked={job.isForced}
                            className="h-4 w-4 accent-blue-700"
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
                        <td className="px-3 py-3">
                          <StatusPill job={job} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className={smallButtonClassName}
                              type="button"
                              disabled={isWorking}
                              onClick={() => openEditJob(job)}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Bearbeiten
                            </button>
                            <button
                              className={smallButtonClassName}
                              type="button"
                              disabled={job.schonGeheftet || isWorking}
                              onClick={() => void handlePatchJob(job, { schonGeheftet: true, schlosserMinutes: 0 }, `${job.faNumber} ist jetzt schon geheftet.`)}
                            >
                              Geheftet
                            </button>
                            <button
                              className={smallButtonClassName}
                              type="button"
                              disabled={job.status === 'done' || isWorking}
                              onClick={() => void handlePatchJob(job, { status: 'done' }, `${job.faNumber} wurde fertig gemeldet.`)}
                            >
                              Fertig
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {jobPoolJobs.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-sm font-bold text-slate-500" colSpan={12}>
                          Keine Jobs in der Vorbereitung. Job manuell speichern, Datei anhaengen oder Demo-Daten verwenden.
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
                text="100 Prozent bedeutet 450 Minuten Roboter-Arbeitszeit nach 30 Minuten Pause."
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
                <Save className="h-4 w-4" aria-hidden="true" />
                Kapazitaet speichern
              </button>
            </section>
            </div>

            <section className={`${cardClassName} overflow-hidden`}>
              <div className="border-b border-slate-100 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <SectionTitle
                    kicker="3. Empfehlung"
                    title="Backend berechnet die moegliche Schichtrotation"
                    text="Der Planner startet in der gewaehlten Start-Schicht. Was nicht passt, rollt nach vorne; nach Spaet geht der Rest auf den naechsten Produktionstag."
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className={secondaryButtonClassName} type="button" onClick={handleRecommend} disabled={isWorking || !selectedRobotId}>
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      Berechnen
                    </button>
                    <button className={primaryButtonClassName} type="button" onClick={handleApplyPlan} disabled={isWorking || !recommendation}>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Plan anwenden
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
                      <SmartTile label="Rollt weiter" value={`${recommendation.summary.finalRolloverJobs}`} tone={recommendation.summary.finalRolloverJobs > 0 ? 'rose' : 'emerald'} />
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
                      {currentRecommendationSlide && <RecommendationDatePreview dateSimulation={currentRecommendationSlide} />}
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
                    Noch keine Empfehlung. Kapazitaet speichern und berechnen.
                  </p>
                )}
              </div>
            </section>

            <section className={`${cardClassName} p-5`}>
              <SectionTitle kicker="4. Aktueller Plan" title="Jobs nach Datum und Schicht" text="Ueberlauf bleibt sichtbar, auch wenn Jobs auf den naechsten Produktionstag rollen." />
              <div className="mt-5 space-y-3">
                {planDates.map((dateGroup) => {
                  const isOpen = openPlanDates.has(dateGroup.date)

                  return (
                    <article className="overflow-hidden rounded-xl border border-slate-100" key={dateGroup.date}>
                      <button
                        className="flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-left"
                        type="button"
                        onClick={() => togglePlanDate(dateGroup.date)}
                      >
                        <div>
                          <p className="font-black text-slate-950">{formatPlanDate(dateGroup.date)}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{dateGroup.totalJobs} Jobs geplant</p>
                        </div>
                        <span className="rounded-lg bg-white px-2 py-1 text-xs font-black text-slate-600">{isOpen ? 'Schliessen' : 'Oeffnen'}</span>
                      </button>

                      {isOpen && (
                        <div className="grid gap-3 border-t border-slate-100 p-3 xl:grid-cols-3">
                          {shifts.map((shift) => (
                            <CurrentShiftCard
                              date={dateGroup.date}
                              isWorking={isWorking}
                              jobs={dateGroup.shifts[shift.value]}
                              key={shift.value}
                              onEditJob={openEditJob}
                              onDropJob={(jobId) => void handleMoveJobToShift(jobId, dateGroup.date, shift.value)}
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
          onDelete={() => void deleteEditedJob()}
          onSave={() => void saveEditedJob()}
        />
      )}
    </main>
  )
}

function RecommendationDatePreview({
  dateSimulation,
}: {
  dateSimulation: NonNullable<PlannerRecommendation['forwardShiftSimulations']>[number]
}) {
  const plannedJobs = dateSimulation.shiftSimulations.reduce((total, simulation) => total + simulation.plannedJobs.length, 0)
  const robotMinutes = dateSimulation.shiftSimulations.reduce((total, simulation) => total + simulation.robotUsedMinutes, 0)

  return (
    <article>
      <div className="border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-slate-950">{formatPlanDate(dateSimulation.date)}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{plannedJobs} Jobs / {robotMinutes}m Roboter geplant</p>
          </div>
          <span className="rounded-lg bg-white px-2 py-1 text-xs font-black text-slate-600">Prognose</span>
        </div>
      </div>
      <div className="grid gap-3 p-3 lg:grid-cols-3">
        {dateSimulation.shiftSimulations.map((simulation) => (
          <RecommendationColumn key={`${dateSimulation.date}-${simulation.shift}`} simulation={simulation} />
        ))}
      </div>
    </article>
  )
}

function RecommendationColumn({ simulation }: { simulation: PlannerRecommendation['shiftSimulations'][number] }) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-slate-950">{getShiftName(simulation.shift)}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {simulation.robotUsedMinutes}m / Ziel {simulation.targetRobotMinutes}m
            </p>
          </div>
          <span className="rounded-xl bg-blue-100 px-3 py-1 text-sm font-black text-blue-700">{simulation.robotUtilizationPercent}%</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {simulation.plannedJobs.map((item) => (
          <JobSummary key={item.job.id} job={item.job} suffix={`VR-${item.vorrichtung}`} />
        ))}
        {simulation.plannedJobs.length === 0 && <p className="p-4 text-sm font-bold text-slate-500">Keine Jobs geplant.</p>}
      </div>
      {simulation.rolloverJobs.length > 0 && (
        <div className="border-t border-rose-100 bg-rose-50 p-3">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Rollt weiter</p>
          {simulation.rolloverJobs.map((job) => (
            <JobSummary key={job.id} job={job} />
          ))}
        </div>
      )}
    </article>
  )
}

function CurrentShiftCard({
  date,
  isWorking,
  jobs,
  onEditJob,
  onDropJob,
  shift,
}: {
  date: string
  isWorking: boolean
  jobs: Job[]
  onEditJob: (job: Job) => void
  onDropJob: (jobId: string) => void
  shift: { name: string; time: string; value: ShiftCode }
}) {
  const robotMinutes = getJobsRobotMinutes(jobs)
  const utilizationPercent = getRobotUtilizationPercent(robotMinutes)

  return (
    <article
      className="overflow-hidden rounded-xl border border-slate-100"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const jobId = event.dataTransfer.getData('text/plain')

        if (jobId && !isWorking) {
          onDropJob(jobId)
        }
      }}
    >
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-slate-950">{shift.name}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{shift.time}</p>
          </div>
          <span className="rounded-xl bg-blue-100 px-3 py-1 text-sm font-black text-blue-700">{utilizationPercent}%</span>
        </div>
        <p className="mt-1 text-xs font-bold text-slate-400">{formatPlanDate(date)}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">{robotMinutes}m / 450m Roboter</p>
        <p className="mt-2 text-xs font-bold text-slate-400">Jobs hierhin ziehen = manuell erzwingen</p>
      </div>
      <div className="divide-y divide-slate-100">
        {jobs.map((job) => (
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
                <button className={smallButtonClassName} type="button" disabled={isWorking} onClick={() => onEditJob(job)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Bearbeiten
                </button>
              }
              job={job}
              suffix={`VR-${job.vorrichtung}`}
            />
          </div>
        ))}
        {jobs.length === 0 && <p className="p-4 text-sm font-bold text-slate-500">Keine Jobs.</p>}
      </div>
    </article>
  )
}

function JobSummary({ action, job, suffix }: { action?: React.ReactNode; job: Job; suffix?: string }) {
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-slate-950">{job.faNumber}</p>
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

function JobTypeBadge({ jobType }: { jobType: Job['jobType'] }) {
  const isRepair = jobType === 'repair'

  return (
    <span className={`inline-flex rounded-lg px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${isRepair ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
      {isRepair ? 'Reparatur' : 'Produktion'}
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
            <Save className="h-4 w-4" aria-hidden="true" />
            Speichern
          </button>
          </div>
        </div>
      </div>
    </div>
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

function sortJobs(jobs: Job[]) {
  const shiftOrder: Record<ShiftCode, number> = { N: 1, F: 2, S: 3 }

  return [...jobs].sort((first, second) => {
    if (first.date !== second.date) return first.date.localeCompare(second.date)
    if (first.shift !== second.shift) return shiftOrder[first.shift] - shiftOrder[second.shift]
    if (first.isPriority !== second.isPriority) return first.isPriority ? -1 : 1
    if (first.schonGeheftet !== second.schonGeheftet) return first.schonGeheftet ? -1 : 1
    if (first.faNumber !== second.faNumber) return first.faNumber.localeCompare(second.faNumber)
    return first.schritt - second.schritt
  })
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
  return Math.round((robotMinutes / 450) * 100)
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

function setDraftValue(key: keyof JobDraft, value: string, setDraft: React.Dispatch<React.SetStateAction<JobDraft>>) {
  setDraft((current) => ({ ...current, [key]: value }))
}

const smallButtonClassName =
  'inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'

const slideButtonClassName =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'
