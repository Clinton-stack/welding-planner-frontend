import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  Copy,
  Pencil,
  Factory,
  Plus,
  Trash2,
  Save,
  Search,
  Sparkles,
  Timer,
  Upload,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { robots, type JobStatus, type ProductionJob, type ShiftCode } from '../data/demoData'
import {
  cardClassName,
  inputClassName,
  pageShellClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../styles/ui'
import { useCurrentUser } from '../users/useCurrentUser'

type PlannerDraft = {
  alreadyWelded: boolean
  isForced: boolean
  isHeld: boolean
  isPriority: boolean
  date: string
  shift: ShiftCode
  faNumber: string
  project: string
  articleNo: string
  step: string
  fixture: string
  optic: string
  wireNumber: string
  qty: string
  anlageMin: string
  schlosserMin: string
  ruestzeitMin: string
}

type PlannerShift = {
  date: string
  day: string
  id: string
  jobs: ProductionJob[]
  shift: ShiftCode
  shiftName: string
  time: string
}

type AutoPlanCandidate = PlannerDraft & {
  id: string
}

type AutoPlanPlacement = {
  candidate: AutoPlanCandidate
  job: ProductionJob
  shift: PlannerShift
}

type AutoPlanResult = {
  deferred: AutoPlanCandidate[]
  held: AutoPlanCandidate[]
  placements: AutoPlanPlacement[]
}

type ShiftCapacityDraft = Record<ShiftCode, { fixtures: string; welders: string }>

type ShiftSimulationState = {
  fixtureAssignments: Record<string, number>
  fixtureAvailableAt: number[]
  remainingCandidates: { candidate: AutoPlanCandidate; order: number }[]
  robotAvailableAt: number
  robotWorkMinutes: number
  shift: PlannerShift
  welderAvailableAt: number[]
}

type SimulatedPlacement = {
  fixtureIndex: number
  readyAt: number
  robotEnd: number
  welderIndex: number
}

const productiveShiftMinutes = 8 * 60

const weekDays = [
  { date: '08.06.2026', day: 'Montag' },
  { date: '09.06.2026', day: 'Dienstag' },
  { date: '10.06.2026', day: 'Mittwoch' },
  { date: '11.06.2026', day: 'Donnerstag' },
  { date: '12.06.2026', day: 'Freitag' },
]

const shifts: { label: string; name: string; time: string; value: ShiftCode }[] = [
  { label: 'F', name: 'Frueh', time: '06:00 - 14:00', value: 'F' },
  { label: 'S', name: 'Spaet', time: '14:00 - 22:00', value: 'S' },
  { label: 'N', name: 'Nacht', time: '22:00 - 06:00', value: 'N' },
]

const emptyDraft: PlannerDraft = {
  alreadyWelded: false,
  isForced: false,
  isHeld: false,
  isPriority: false,
  date: weekDays[0].date,
  shift: 'F',
  faNumber: 'FA-240611-104',
  project: 'Pesa 95',
  articleNo: '',
  step: 'Schritt 1',
  fixture: 'Vorrichtung A',
  optic: '',
  wireNumber: '',
  qty: '1',
  anlageMin: '30',
  schlosserMin: '40',
  ruestzeitMin: '0',
}

const defaultShiftCapacity: ShiftCapacityDraft = {
  F: { fixtures: '3', welders: '2' },
  S: { fixtures: '3', welders: '3' },
  N: { fixtures: '3', welders: '1' },
}

type EditingJob = {
  draft: PlannerDraft
  job: ProductionJob
}

export function WeeklyPlannerPage() {
  const { currentUser } = useCurrentUser()
  const backPath = currentUser.role === 'Supervisor' || currentUser.role === 'Admin' ? '/supervisor' : '/robots'
  const [selectedRobotId, setSelectedRobotId] = useState('ap2904')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(emptyDraft)
  const [addedJobs, setAddedJobs] = useState<Record<string, ProductionJob[]>>({})
  const [deletedJobIds, setDeletedJobIds] = useState<Set<string>>(new Set())
  const [openDates, setOpenDates] = useState<Set<string>>(() => new Set([weekDays[0].date]))
  const [savedMessage, setSavedMessage] = useState('')
  const [editingJob, setEditingJob] = useState<EditingJob | null>(null)
  const [autoTargetPercent, setAutoTargetPercent] = useState(95)
  const [autoIncludeNight, setAutoIncludeNight] = useState(true)
  const [jobPool, setJobPool] = useState<AutoPlanCandidate[]>([])
  const [shiftCapacity, setShiftCapacity] = useState<ShiftCapacityDraft>(defaultShiftCapacity)
  const selectedRobot = robots.find((robot) => robot.id === selectedRobotId) ?? robots[0]
  const selectedShiftId = getShiftId(draft.date, draft.shift)

  const weekPlan = useMemo(
    () =>
      weekDays.map((day) => ({
        ...day,
        shifts: shifts.map((shift) => {
          const id = getShiftId(day.date, shift.value)

          return {
            date: day.date,
            day: day.day,
            id,
            jobs: [...(addedJobs[id] ?? [])].filter((job) => !deletedJobIds.has(job.id)),
            shift: shift.value,
            shiftName: shift.name,
            time: shift.time,
          }
        }),
      })),
    [addedJobs, deletedJobIds],
  )

  const flatShifts = weekPlan.flatMap((day) => day.shifts)
  const selectedShift = flatShifts.find((shift) => shift.id === selectedShiftId) ?? flatShifts[0]
  const filteredRobots = robots.filter((robot) =>
    [robot.name, robot.assetId, robot.location, robot.process].join(' ').toLowerCase().includes(query.toLowerCase()),
  )
  const weeklyAnlageMinutes = flatShifts.reduce((sum, shift) => sum + getShiftLoad(shift.jobs).anlageAndRuest, 0)
  const weeklySchlosserMinutes = flatShifts.reduce((sum, shift) => sum + getShiftLoad(shift.jobs).schlosser, 0)
  const averageLoad = Math.round(
    flatShifts.reduce((sum, shift) => sum + getLoadPercent(getShiftLoad(shift.jobs).anlageAndRuest), 0) / flatShifts.length,
  )
  const autoPlan = buildAutoPlan(
    flatShifts,
    jobPool,
    autoTargetPercent,
    autoIncludeNight,
    shiftCapacity,
  )
  const autoPreview = autoPlan.placements
  const autoPreviewMinutes = autoPreview.reduce((sum, item) => sum + getJobAnlageMinutes(item.job), 0)
  const allocationShifts = flatShifts.filter((shift) => autoPreview.some((placement) => placement.shift.id === shift.id))

  const addJobToPool = () => {
    if (!draft.faNumber.trim() || !draft.project.trim() || !draft.articleNo.trim()) {
      setSavedMessage('FA Nummer, Projekt und Art. Nr. sind Pflichtfelder.')
      return
    }

    const nextJob = {
      ...draft,
      alreadyWelded: draft.alreadyWelded && canMarkDraftAsTacked(draft, jobPool),
      id: `pool-${Date.now()}`,
    }

    setJobPool((current) => enforceTackedRules([...current, nextJob]))
    setDraft((current) => ({
      ...current,
      articleNo: '',
    }))
    setSavedMessage(`${nextJob.faNumber} wurde zur Jobliste hinzugefuegt.`)
  }

  const updateShiftCapacity = (shift: ShiftCode, key: keyof ShiftCapacityDraft[ShiftCode], value: string) => {
    setShiftCapacity((current) => ({
      ...current,
      [shift]: {
        ...current[shift],
        [key]: value,
      },
    }))
  }

  const updateJobPoolItem = (jobId: string, updates: Partial<PlannerDraft>) => {
    setJobPool((current) => enforceTackedRules(current.map((job) => (job.id === jobId ? { ...job, ...updates } : job))))
  }

  const moveJobPoolItem = (jobId: string, direction: -1 | 1) => {
    setJobPool((current) => {
      const currentIndex = current.findIndex((job) => job.id === jobId)
      const nextIndex = currentIndex + direction

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [item] = next.splice(currentIndex, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  const uploadJobList = async (file: File | undefined) => {
    if (!file) {
      return
    }

    try {
      const importedJobs = parseJobCsv(await file.text())

      if (importedJobs.length === 0) {
        setSavedMessage('Keine Jobs in der Datei gefunden.')
        return
      }

      setJobPool(enforceTackedRules(importedJobs))
      setSavedMessage(`${importedJobs.length} Jobs aus ${file.name} geladen.`)
    } catch {
      setSavedMessage('Jobliste konnte nicht gelesen werden. Bitte CSV-Spalten pruefen.')
    }
  }

  const loadSampleJobList = async () => {
    const response = await fetch('/sample-planner-jobs.csv')
    const importedJobs = parseJobCsv(await response.text())

    setJobPool(enforceTackedRules(importedJobs))
    setSavedMessage(`${importedJobs.length} Demo-Jobs geladen.`)
  }

  const editJob = (shift: PlannerShift, job: ProductionJob) => {
    setEditingJob({
      job,
      draft: {
        date: shift.date,
        shift: shift.shift,
        faNumber: job.faNumber,
        alreadyWelded: job.schlosserMin === 0,
        isForced: false,
        isHeld: false,
        isPriority: job.priority === 'carryover',
        project: job.project,
        articleNo: job.articleNo,
        step: job.step,
        fixture: job.fixture,
        optic: job.optic ?? '',
        wireNumber: job.wireNumber ?? '',
        qty: String(job.plannedQty),
        anlageMin: String(job.anlageMin),
        schlosserMin: String(job.schlosserMin),
        ruestzeitMin: String(job.ruestzeitMin),
      },
    })
    setSavedMessage('')
  }

  const saveEditedJob = () => {
    if (!editingJob) {
      return
    }

    if (!editingJob.draft.faNumber.trim() || !editingJob.draft.project.trim() || !editingJob.draft.articleNo.trim()) {
      setSavedMessage('FA Nummer, Projekt und Art. Nr. sind Pflichtfelder.')
      return
    }

    const targetShiftId = getShiftId(editingJob.draft.date, editingJob.draft.shift)
    const updatedJob = createJobFromDraft(editingJob.draft, `edited-${editingJob.job.id}-${Date.now()}`)

    setDeletedJobIds((current) => new Set(current).add(editingJob.job.id))
    setAddedJobs((current) => ({
      ...current,
      [targetShiftId]: [...(current[targetShiftId] ?? []), updatedJob],
    }))
    setEditingJob(null)
    setSavedMessage(`${updatedJob.faNumber} wurde aktualisiert.`)
  }

  const deleteJob = (job: ProductionJob) => {
    setDeletedJobIds((current) => new Set(current).add(job.id))
    setSavedMessage(`${job.faNumber} wurde aus dem Wochenplan geloescht.`)
  }

  const acceptPlacements = (placements: AutoPlanPlacement[], message: string) => {
    if (placements.length === 0) {
      setSavedMessage('Keine passenden Planpositionen fuer die aktuelle Kapazitaet gefunden.')
      return
    }

    setAddedJobs((current) => {
      const next = { ...current }

      placements.forEach((placement) => {
        next[placement.shift.id] = [...(next[placement.shift.id] ?? []), placement.job]
      })

      return next
    })
    setOpenDates((current) => {
      const next = new Set(current)
      placements.forEach((placement) => next.add(placement.shift.date))
      return next
    })
    const acceptedIds = new Set(placements.map((placement) => placement.candidate.id))

    setJobPool((current) => current.filter((job) => !acceptedIds.has(job.id)))
    setSavedMessage(message)
  }

  const applyAutoPlan = () => {
    acceptPlacements(autoPreview, `${autoPreview.length} Vorschlaege wurden fuer ${selectedRobot.name} uebernommen.`)
  }

  const acceptShiftPlan = (shiftId: string) => {
    const placements = autoPreview.filter((placement) => placement.shift.id === shiftId)
    const shift = placements[0]?.shift

    acceptPlacements(
      placements,
      `${placements.length} Jobs wurden fuer ${shift?.day ?? 'diese Schicht'} / ${shift?.shiftName ?? ''} uebernommen.`,
    )
  }

  const toggleDate = (date: string) => {
    setOpenDates((current) => {
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
            <h1 className="text-2xl font-black tracking-normal text-slate-950">Wochenplanung</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {currentUser.name} / {currentUser.role} / Woche 24
            </p>
          </div>
          <button
            className={primaryButtonClassName}
            type="button"
            onClick={() => setSavedMessage('Demo-Wochenplan gespeichert. In der echten App ersetzt das die Excel-Planung.')}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Wochenplan speichern
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={<Factory className="h-5 w-5" />} label="Anlage" value={selectedRobot.name} />
          <Metric icon={<CalendarDays className="h-5 w-5" />} label="Schlosser" value={`${weeklySchlosserMinutes}m`} />
          <Metric icon={<Timer className="h-5 w-5" />} label="Anlage+Ruest" value={`${weeklyAnlageMinutes}m`} />
          <Metric icon={<Timer className="h-5 w-5" />} label="Ø Auslastung" value={`${averageLoad}%`} />
        </div>

        {savedMessage && (
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            {savedMessage}
          </div>
        )}

        <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={`${cardClassName} h-fit p-5`}>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Anlagen</p>
            <label className="relative mt-4 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClassName} w-full pl-10`}
                placeholder="Suchen"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="mt-4 space-y-2">
              {filteredRobots.map((robot) => (
                <button
                  className={`w-full rounded-xl p-3 text-left transition ${
                    robot.id === selectedRobot.id ? 'bg-blue-700 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                  key={robot.id}
                  type="button"
                  onClick={() => setSelectedRobotId(robot.id)}
                >
                  <span className="block text-sm font-black">{robot.name}</span>
                  <span className={`mt-1 block text-xs font-bold ${robot.id === selectedRobot.id ? 'text-blue-100' : 'text-slate-500'}`}>
                    {robot.assetId} / {robot.location}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            <section className={`${cardClassName} overflow-hidden`}>
              <div className="border-b border-slate-100 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-blue-700">
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      Schichtplan-Assistent
                    </p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">Job Pool, Schichtkapazitaet und Empfehlung in einem Ablauf</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Der Assistent zeigt, welche Jobs bereit sind, welche erst geheftet werden muessen und was mit den verfuegbaren Schlossers und VR-Plaetzen wahrscheinlich in die Schicht passt.
                    </p>
                  </div>
                  <button className={primaryButtonClassName} type="button" onClick={applyAutoPlan}>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Alle uebernehmen
                  </button>
                </div>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid gap-5">
                  <section className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-black text-slate-950">Jobliste</p>
                      <div className="flex flex-wrap gap-2">
                        <button className={secondaryButtonClassName} type="button" onClick={() => void loadSampleJobList()}>
                          <Sparkles className="h-4 w-4" aria-hidden="true" />
                          Demo laden
                        </button>
                        <a className={secondaryButtonClassName} href="/sample-planner-jobs.csv" download>
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Beispiel CSV
                        </a>
                        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-sm font-black text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                          <Upload className="h-4 w-4" aria-hidden="true" />
                          Datei hochladen
                          <input
                            accept=".csv,text/csv"
                            className="sr-only"
                            type="file"
                            onChange={(event) => void uploadJobList(event.target.files?.[0])}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <TextField label="FA Nummer" value={draft.faNumber} onChange={(value) => setDraft((current) => ({ ...current, faNumber: value }))} />
                      <TextField label="Projekt" value={draft.project} onChange={(value) => setDraft((current) => ({ ...current, project: value }))} />
                      <TextField label="Art. Nr." value={draft.articleNo} onChange={(value) => setDraft((current) => ({ ...current, articleNo: value }))} />
                      <TextField label="Menge" type="number" value={draft.qty} onChange={(value) => setDraft((current) => ({ ...current, qty: value }))} />
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <TextField label="Schritt" value={draft.step} onChange={(value) => setDraft((current) => ({ ...current, step: value }))} />
                      <TextField label="Vorrichtung" value={draft.fixture} onChange={(value) => setDraft((current) => ({ ...current, fixture: value }))} />
                      <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
                        Optik
                        <select
                          className={inputClassName}
                          value={draft.optic}
                          onChange={(event) => setDraft((current) => ({ ...current, optic: event.target.value }))}
                        >
                          <option value="">-</option>
                          <option value="ALO">ALO</option>
                          <option value="BEO">BEO</option>
                        </select>
                      </label>
                      <TextField label="Draht Nr." value={draft.wireNumber} onChange={(value) => setDraft((current) => ({ ...current, wireNumber: value }))} />
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <TextField label="Anlage min" type="number" value={draft.anlageMin} onChange={(value) => setDraft((current) => ({ ...current, anlageMin: value }))} />
                      <TextField label="Schlosser min" type="number" value={draft.alreadyWelded ? '0' : draft.schlosserMin} onChange={(value) => setDraft((current) => ({ ...current, alreadyWelded: false, schlosserMin: value }))} />
                      <TextField label="Ruest min" type="number" value={draft.ruestzeitMin} onChange={(value) => setDraft((current) => ({ ...current, ruestzeitMin: value }))} />
                    </div>

                    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap gap-3">
                        <PlannerCheckbox
                          checked={draft.alreadyWelded}
                          disabled={!canMarkDraftAsTacked(draft, jobPool)}
                          label="Schon geheftet"
                          onChange={(checked) => setDraft((current) => ({ ...current, alreadyWelded: checked }))}
                        />
                        <PlannerCheckbox
                          checked={draft.isPriority}
                          label="Prioritaet"
                          onChange={(checked) => setDraft((current) => ({ ...current, isPriority: checked }))}
                        />
                        <PlannerCheckbox
                          checked={draft.isForced}
                          label="Erzwingen"
                          onChange={(checked) => setDraft((current) => ({ ...current, isForced: checked }))}
                        />
                        <PlannerCheckbox
                          checked={draft.isHeld}
                          label="Naechste Schicht"
                          onChange={(checked) => setDraft((current) => ({ ...current, isHeld: checked }))}
                        />
                      </div>
                      <button className={`${primaryButtonClassName} px-5 lg:w-fit`} type="button" onClick={addJobToPool}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Job aufnehmen
                      </button>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-100">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                        <span>Job Pool bearbeiten</span>
                        <span>{jobPool.length} Jobs</span>
                      </div>
                      <div className="max-h-[520px] space-y-3 overflow-y-auto p-3">
                        {jobPool.length === 0 ? (
                          <p className="px-1 py-2 text-sm font-bold text-slate-500">Noch keine Jobs in der Liste.</p>
                        ) : (
                          jobPool.map((candidate, index) => (
                            <JobPoolRow
                              candidate={candidate}
                              index={index}
                              isFirst={index === 0}
                              isLast={index === jobPool.length - 1}
                              key={candidate.id}
                              canMarkTacked={canMarkCandidateAsTacked(candidate, jobPool)}
                              onChange={(updates) => updateJobPoolItem(candidate.id, updates)}
                              onDelete={() => setJobPool((current) => current.filter((job) => job.id !== candidate.id))}
                              onMove={(direction) => moveJobPoolItem(candidate.id, direction)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-100 p-4">
                    <p className="text-sm font-black text-slate-950">Schichtkapazitaet</p>
                    <div className="mt-4 grid gap-3 xl:grid-cols-3">
                      {shifts.map((shift) => (
                        <ShiftCapacityRow
                          capacity={shiftCapacity[shift.value]}
                          key={shift.value}
                          onChange={(key, value) => updateShiftCapacity(shift.value, key, value)}
                          shift={shift}
                        />
                      ))}
                    </div>
                    <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
                      Zielauslastung Roboter: {autoTargetPercent}%
                      <input
                        className="accent-blue-700"
                        max="95"
                        min="70"
                        step="5"
                        type="range"
                        value={autoTargetPercent}
                        onChange={(event) => setAutoTargetPercent(Number(event.target.value))}
                      />
                    </label>
                    <label className="mt-4 flex items-center justify-between gap-3 text-sm font-bold text-slate-700">
                      Nachtschicht planen
                      <input
                        checked={autoIncludeNight}
                        className="h-5 w-5 accent-blue-700"
                        type="checkbox"
                        onChange={(event) => setAutoIncludeNight(event.target.checked)}
                      />
                    </label>
                  </section>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <SmartTile label="Jobs in Liste" value={`${jobPool.length}`} />
                  <SmartTile label="Empfohlen" value={`${autoPreview.length}`} tone={autoPlan.deferred.length === 0 && jobPool.length > 0 ? 'emerald' : 'blue'} />
                  <SmartTile label="Roboterzeit" value={`${autoPreviewMinutes}m`} />
                  <SmartTile label="Rollt weiter" value={`${autoPlan.deferred.length + autoPlan.held.length}`} tone={autoPlan.deferred.length + autoPlan.held.length > 0 ? 'rose' : 'emerald'} />
                </div>

                <section className="rounded-xl border border-slate-100">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-black text-slate-950">Empfehlung</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      Prozent zeigt nur die geplante Roboterlast gegen die Zielauslastung der Schicht. Erzwungene Jobs duerfen bewusst darueber gehen.
                    </p>
                  </div>
                  <div className="grid gap-3 p-3 xl:grid-cols-3">
                    {allocationShifts.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500 xl:col-span-3">
                        Noch kein berechneter Vorschlag. Jobs laden oder aufnehmen, dann erscheinen die passenden Schichten hier.
                      </p>
                    ) : allocationShifts.map((shift) => (
                      <ShiftAllocationColumn
                        key={shift.id}
                        placements={autoPreview.filter((placement) => placement.shift.id === shift.id)}
                        shift={shift}
                        targetPercent={autoTargetPercent}
                        onAccept={() => acceptShiftPlan(shift.id)}
                      />
                    ))}
                  </div>
                  {autoPlan.held.length > 0 && (
                    <div className="border-t border-amber-100">
                      {autoPlan.held.map((candidate) => (
                        <AutoDeferredRow candidate={candidate} key={candidate.id} reason="Vom Supervisor fuer eine spaetere Schicht gehalten." tone="amber" />
                      ))}
                    </div>
                  )}
                  {autoPlan.deferred.length > 0 && (
                    <div className="border-t border-rose-100">
                      {autoPlan.deferred.map((candidate) => (
                        <AutoDeferredRow candidate={candidate} key={candidate.id} reason={getDeferredReason(candidate, jobPool)} tone="rose" />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </section>

            <section className={`${cardClassName} overflow-hidden`}>
              <div className="border-b border-slate-100 p-5">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">
                  Uebernommener Plan
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Erst sichtbar, wenn Jobs aus dem Schichtplan-Assistenten uebernommen wurden</h2>
              </div>

              <div className="divide-y divide-slate-100">
                {weekPlan.map((day) => (
                  <section key={day.date}>
                    <button
                      className="flex w-full items-center justify-between gap-4 bg-white px-5 py-4 text-left transition hover:bg-slate-50"
                      type="button"
                      onClick={() => toggleDate(day.date)}
                    >
                      <div>
                        <p className="font-black text-slate-950">{day.day}</p>
                        <p className="mt-1 text-sm font-bold text-slate-500">{day.date}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                          {day.shifts.reduce((sum, shift) => sum + shift.jobs.length, 0)} Positionen
                        </span>
                        <ChevronDown
                          className={`h-5 w-5 text-slate-400 transition ${openDates.has(day.date) ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>

                    {openDates.has(day.date) && (
                      <div className="space-y-5 bg-slate-50 px-4 py-5">
                        {day.shifts.map((shift) => (
                          <ShiftDetailTable
                            isSelected={shift.id === selectedShift.id}
                            key={shift.id}
                            onDelete={deleteJob}
                            onEdit={editJob}
                            onSelect={() => setDraft((current) => ({ ...current, date: shift.date, shift: shift.shift }))}
                            shift={shift}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </section>
          </section>
        </div>
      </section>

      {editingJob && (
        <EditJobDialog
          draft={editingJob.draft}
          onCancel={() => setEditingJob(null)}
          onChange={(nextDraft) => setEditingJob((current) => (current ? { ...current, draft: nextDraft } : current))}
          onSave={saveEditedJob}
        />
      )}
    </main>
  )
}

function ShiftDetailTable({
  isSelected,
  onDelete,
  onEdit,
  onSelect,
  shift,
}: {
  isSelected: boolean
  onDelete: (job: ProductionJob) => void
  onEdit: (shift: PlannerShift, job: ProductionJob) => void
  onSelect: () => void
  shift: PlannerShift
}) {
  const load = getShiftLoad(shift.jobs)
  const percent = getLoadPercent(load.anlageAndRuest)

  return (
    <section className={`overflow-hidden rounded-xl border bg-white ${isSelected ? 'border-blue-400 ring-4 ring-blue-600/10' : 'border-slate-100'}`}>
      <button className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left" type="button" onClick={onSelect}>
        <div>
          <p className="text-sm font-black text-blue-700">
            {shift.shift} / {shift.shiftName} / {shift.time}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {shift.jobs.length} Positionen / Anlage+Ruest {load.anlageAndRuest}m / Schlosser {load.schlosser}m
          </p>
        </div>
        <span className={`rounded-xl px-3 py-1 text-xs font-black ${getLoadBadgeClass(percent)}`}>
          {percent}%
        </span>
      </button>

      <div className="h-1.5 bg-slate-100">
        <div className={`h-1.5 ${getLoadBarClass(percent)}`} style={{ width: `${Math.min(percent, 130)}%` }} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1360px] text-left text-xs">
          <thead className="border-b border-slate-100 bg-slate-50 uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-3 py-3">Prio</th>
              <th className="px-3 py-3">FA</th>
              <th className="px-3 py-3">Projekt</th>
              <th className="px-3 py-3">Art.</th>
              <th className="px-3 py-3">Schritt</th>
              <th className="px-3 py-3">Vorrichtung</th>
              <th className="px-3 py-3">Optik</th>
              <th className="px-3 py-3">Draht</th>
              <th className="px-3 py-3 text-right">Plan</th>
              <th className="px-3 py-3 text-right">Ist</th>
              <th className="px-3 py-3 text-right">Rest</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Bemerkung</th>
              <th className="px-3 py-3 text-right">Anlage</th>
              <th className="px-3 py-3 text-right">Schlosser</th>
              <th className="px-3 py-3 text-right">Ruest</th>
              <th className="px-3 py-3 text-right">Gesamt</th>
              <th className="px-3 py-3 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shift.jobs.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-sm font-bold text-slate-500" colSpan={18}>
                  Keine Positionen fuer diese Schicht geplant.
                </td>
              </tr>
            ) : (
              shift.jobs.map((job) => {
                const jobLoad = job.anlageMin * job.plannedQty + job.ruestzeitMin
                const restQty = Math.max(job.plannedQty - job.doneQty, 0)

                return (
                  <tr className={job.priority === 'carryover' ? 'bg-amber-50 hover:bg-amber-100/70' : 'bg-white hover:bg-slate-50'} key={job.id}>
                    <td className="px-3 py-3">
                      {job.priority === 'carryover' ? (
                        <span className="rounded-md bg-amber-200 px-2 py-1 text-xs font-black text-amber-950">
                          Rest {job.carriedFrom}
                        </span>
                      ) : (
                        <span className="text-slate-400">Normal</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-slate-700">{job.faNumber}</td>
                    <td className="px-3 py-3 font-bold text-slate-950">{job.project}</td>
                    <td className="px-3 py-3 font-mono text-slate-600">{job.articleNo}</td>
                    <td className="px-3 py-3 text-slate-700">{job.step}</td>
                    <td className="px-3 py-3 text-slate-700">{job.fixture}</td>
                    <td className="px-3 py-3 font-bold text-slate-700">{job.optic ?? '-'}</td>
                    <td className="px-3 py-3 font-mono text-slate-600">{job.wireNumber ?? '-'}</td>
                    <td className="px-3 py-3 text-right font-bold">{job.plannedQty}</td>
                    <td className="px-3 py-3 text-right font-bold">{job.doneQty}</td>
                    <td className="px-3 py-3 text-right font-black">{restQty}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-1 text-xs font-black ring-1 ${getPlannerStatusClass(job.status)}`}>
                        {getPlannerStatusLabel(job.status)}
                      </span>
                    </td>
                    <td className="max-w-56 px-3 py-3 text-slate-600">
                      {job.welderNote || job.operatorNote || '-'}
                    </td>
                    <td className="px-3 py-3 text-right">{job.anlageMin}m</td>
                    <td className="px-3 py-3 text-right">{job.schlosserMin}m</td>
                    <td className="px-3 py-3 text-right">{job.ruestzeitMin}m</td>
                    <td className="px-3 py-3 text-right font-black">{jobLoad}m</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                          type="button"
                          onClick={() => onEdit(shift, job)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Bearbeiten</span>
                        </button>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                          type="button"
                          onClick={() => onDelete(job)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Loeschen</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EditJobDialog({
  draft,
  onCancel,
  onChange,
  onSave,
}: {
  draft: PlannerDraft
  onCancel: () => void
  onChange: (draft: PlannerDraft) => void
  onSave: () => void
}) {
  const updateDraft = (key: keyof PlannerDraft, value: string) => {
    onChange({ ...draft, [key]: value })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4 py-6">
      <section className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Planposition bearbeiten</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{draft.faNumber}</h2>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Datum
              <select className={inputClassName} value={draft.date} onChange={(event) => updateDraft('date', event.target.value)}>
                {weekDays.map((day) => (
                  <option value={day.date} key={day.date}>
                    {day.day}, {day.date}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Schicht
              <select className={inputClassName} value={draft.shift} onChange={(event) => updateDraft('shift', event.target.value as ShiftCode)}>
                {shifts.map((shift) => (
                  <option value={shift.value} key={shift.value}>
                    {shift.label} / {shift.name}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="FA Nummer" value={draft.faNumber} onChange={(value) => updateDraft('faNumber', value)} />
            <TextField label="Menge" type="number" value={draft.qty} onChange={(value) => updateDraft('qty', value)} />
            <TextField label="Projekt" value={draft.project} onChange={(value) => updateDraft('project', value)} />
            <TextField label="Art. Nr." value={draft.articleNo} onChange={(value) => updateDraft('articleNo', value)} />
            <TextField label="Schritt" value={draft.step} onChange={(value) => updateDraft('step', value)} />
            <TextField label="Vorrichtung" value={draft.fixture} onChange={(value) => updateDraft('fixture', value)} />
            <label className="flex h-11 items-center gap-3 self-end rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700">
              <input
                checked={draft.alreadyWelded}
                className="h-5 w-5 accent-blue-700"
                type="checkbox"
                onChange={(event) => onChange({ ...draft, alreadyWelded: event.target.checked })}
              />
              Schon geheftet
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
              Optik
              <select className={inputClassName} value={draft.optic} onChange={(event) => updateDraft('optic', event.target.value)}>
                <option value="">-</option>
                <option value="ALO">ALO</option>
                <option value="BEO">BEO</option>
              </select>
            </label>
            <TextField label="Draht Nr." value={draft.wireNumber} onChange={(value) => updateDraft('wireNumber', value)} />
            <TextField label="Anlage min" type="number" value={draft.anlageMin} onChange={(value) => updateDraft('anlageMin', value)} />
            <TextField label="Schlosser min" type="number" value={draft.alreadyWelded ? '0' : draft.schlosserMin} onChange={(value) => onChange({ ...draft, alreadyWelded: false, schlosserMin: value })} />
            <TextField label="Ruest min" type="number" value={draft.ruestzeitMin} onChange={(value) => updateDraft('ruestzeitMin', value)} />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
          <button className={secondaryButtonClassName} type="button" onClick={onCancel}>
            Abbrechen
          </button>
          <button className={primaryButtonClassName} type="button" onClick={onSave}>
            Aenderungen speichern
          </button>
        </div>
      </section>
    </div>
  )
}

function JobPoolRow({
  canMarkTacked,
  candidate,
  index,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMove,
}: {
  canMarkTacked: boolean
  candidate: AutoPlanCandidate
  index: number
  isFirst: boolean
  isLast: boolean
  onChange: (updates: Partial<PlannerDraft>) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const anlageMinutes = getDraftAnlageMinutes(candidate)
  const schlosserMinutes = getDraftSchlosserMinutes(candidate)
  const statusChips = getCandidateStatusChips(candidate, canMarkTacked)

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="flex items-center gap-1 xl:w-24 xl:pt-5">
          <span className="w-8 text-xs font-black text-slate-400">#{index + 1}</span>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:opacity-40"
            disabled={isFirst}
            type="button"
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Prioritaet hoeher</span>
          </button>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:opacity-40"
            disabled={isLast}
            type="button"
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Prioritaet niedriger</span>
          </button>
        </div>

        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CompactField label="FA" value={candidate.faNumber} onChange={(value) => onChange({ faNumber: value })} />
          <CompactField label="Projekt" value={candidate.project} onChange={(value) => onChange({ project: value })} />
          <CompactField label="Art." value={candidate.articleNo} onChange={(value) => onChange({ articleNo: value })} />
          <CompactField label="Schritt" value={candidate.step} onChange={(value) => onChange({ step: value })} />
          <CompactField label="Fixture" value={candidate.fixture} onChange={(value) => onChange({ fixture: value })} />
          <CompactField label="Menge" type="number" value={candidate.qty} onChange={(value) => onChange({ qty: value })} />
          <CompactField label="Anlage" type="number" value={candidate.anlageMin} onChange={(value) => onChange({ anlageMin: value })} />
          <div className="grid gap-1">
            <CompactField
              label="Schlosser"
              type="number"
              value={candidate.alreadyWelded ? '0' : candidate.schlosserMin}
              onChange={(value) => onChange({ alreadyWelded: false, schlosserMin: value })}
            />
            <label className={`flex items-center gap-2 text-xs font-bold ${canMarkTacked ? 'text-slate-600' : 'text-slate-400'}`}>
              <input
                checked={candidate.alreadyWelded}
                className="h-4 w-4 accent-blue-700 disabled:opacity-40"
                disabled={!canMarkTacked}
                type="checkbox"
                onChange={(event) => onChange({ alreadyWelded: event.target.checked })}
              />
          geheftet
            </label>
          </div>
          <label className="flex items-end gap-2 pb-2 text-xs font-bold text-slate-600">
            <input
              checked={candidate.isPriority}
              className="h-4 w-4 accent-blue-700"
              type="checkbox"
              onChange={(event) => onChange({ isPriority: event.target.checked })}
            />
            Prioritaet
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs font-bold text-slate-600">
            <input
              checked={candidate.isForced}
              className="h-4 w-4 accent-blue-700"
              type="checkbox"
              onChange={(event) => onChange({ isForced: event.target.checked })}
            />
            Erzwingen
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs font-bold text-slate-600">
            <input
              checked={candidate.isHeld}
              className="h-4 w-4 accent-blue-700"
              type="checkbox"
              onChange={(event) => onChange({ isHeld: event.target.checked })}
            />
            Naechste Schicht
          </label>
        </div>

        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 transition hover:bg-rose-100 xl:mt-5"
          type="button"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Aus Jobliste entfernen</span>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {statusChips.map((chip) => (
          <span className={`rounded-md px-2 py-1 text-xs font-black ring-1 ${chip.className}`} key={chip.label}>
            {chip.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs font-bold text-slate-500">
        {candidate.fixture} / Roboter gesamt {anlageMinutes}m / Schlosser gesamt {schlosserMinutes}m
      </p>
    </div>
  )
}

function getCandidateStatusChips(candidate: PlannerDraft, canMarkTacked: boolean) {
  const chips: { className: string; label: string }[] = []

  if (!canMarkTacked) {
    chips.push({ className: 'bg-rose-50 text-rose-700 ring-rose-100', label: 'Blockiert: Schritt fehlt' })
  } else if (candidate.alreadyWelded) {
    chips.push({ className: 'bg-emerald-50 text-emerald-700 ring-emerald-100', label: 'Bereit' })
  } else {
    chips.push({ className: 'bg-slate-50 text-slate-600 ring-slate-200', label: 'Muss geheftet werden' })
  }

  if (candidate.isPriority) {
    chips.push({ className: 'bg-amber-50 text-amber-800 ring-amber-100', label: 'Prioritaet' })
  }

  if (candidate.isForced) {
    chips.push({ className: 'bg-blue-50 text-blue-700 ring-blue-100', label: 'Erzwungen' })
  }

  if (candidate.isHeld) {
    chips.push({ className: 'bg-slate-100 text-slate-700 ring-slate-200', label: 'Gehalten' })
  }

  return chips
}

function PlannerCheckbox({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={`flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
      <input
        checked={checked}
        className="h-5 w-5 shrink-0 accent-blue-700 disabled:opacity-40"
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="truncate">{label}</span>
    </label>
  )
}

function CompactField({
  label,
  onChange,
  type = 'text',
  value,
}: {
  label: string
  onChange: (value: string) => void
  type?: string
  value: string
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-black text-slate-500">
      {label}
      <input
        className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold normal-case text-slate-950 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function ShiftCapacityRow({
  capacity,
  onChange,
  shift,
}: {
  capacity: ShiftCapacityDraft[ShiftCode]
  onChange: (key: keyof ShiftCapacityDraft[ShiftCode], value: string) => void
  shift: { label: string; name: string; time: string; value: ShiftCode }
}) {
  return (
    <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_110px_110px] sm:items-end">
      <div>
        <p className="text-sm font-black text-slate-950">{shift.name}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">{shift.time}</p>
      </div>
      <TextField label="Schlosser" type="number" value={capacity.welders} onChange={(value) => onChange('welders', value)} />
      <TextField label="VR Plaetze" type="number" value={capacity.fixtures} onChange={(value) => onChange('fixtures', value)} />
    </div>
  )
}

function ShiftAllocationColumn({
  onAccept,
  placements,
  shift,
  targetPercent,
}: {
  onAccept: () => void
  placements: AutoPlanPlacement[]
  shift: PlannerShift
  targetPercent: number
}) {
  const existingLoad = getShiftLoad(shift.jobs)
  const addedAnlageLoad = placements.reduce((sum, placement) => sum + getJobAnlageMinutes(placement.job), 0)
  const totalAnlageLoad = existingLoad.anlageAndRuest + addedAnlageLoad
  const anlagePercent = getLoadPercent(totalAnlageLoad)
  const targetMinutes = Math.round((productiveShiftMinutes * targetPercent) / 100)

  return (
    <section className="min-w-0 rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-slate-950">{shift.day} / {shift.shiftName}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{shift.date} / {shift.time}</p>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-black ${getLoadBadgeClass(anlagePercent)}`}>{anlagePercent}%</span>
      </div>
      <button className={`${secondaryButtonClassName} mt-3 w-full`} type="button" onClick={onAccept}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Schicht uebernehmen
      </button>
      <p className="mt-3 text-xs font-bold text-slate-500">
        {placements.length} neue Jobs / {addedAnlageLoad}m Roboterlast / Ziel {targetMinutes}m
      </p>
      <div className="mt-3 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${getLoadBarClass(anlagePercent)}`} style={{ width: `${Math.min(anlagePercent, 100)}%` }} />
      </div>
      <div className="mt-4 space-y-2">
        {placements.length === 0 ? (
          <p className="py-3 text-sm font-bold text-slate-500">Keine neuen Jobs passen in diese Schicht.</p>
        ) : (
          placements.map((placement) => <AutoPlacementRow key={placement.job.id} placement={placement} />)
        )}
      </div>
    </section>
  )
}

function AutoPlacementRow({ placement }: { placement: AutoPlanPlacement }) {
  const job = placement.job

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm font-black text-slate-950">{job.faNumber}</p>
        <p className="mt-1 text-sm font-black text-slate-800">{job.project} / Art. {job.articleNo}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-black text-slate-600">
          <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">{job.step}</span>
          <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">Menge {job.plannedQty}</span>
          <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">{job.fixture}</span>
          {placement.candidate.alreadyWelded && (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 ring-1 ring-emerald-100">Schon geheftet</span>
          )}
          {placement.candidate.isPriority && (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800 ring-1 ring-amber-100">Prioritaet</span>
          )}
          {placement.candidate.isForced && (
            <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700 ring-1 ring-blue-100">Erzwungen</span>
          )}
        </div>
      </div>
    </div>
  )
}

function AutoDeferredRow({
  candidate,
  reason,
  tone,
}: {
  candidate: AutoPlanCandidate
  reason: string
  tone: 'amber' | 'rose'
}) {
  const toneClasses =
    tone === 'amber'
      ? {
          badge: 'bg-amber-100 text-amber-800',
          row: 'bg-amber-50',
          text: 'text-amber-950',
          subText: 'text-amber-800',
        }
      : {
          badge: 'bg-rose-100 text-rose-700',
          row: 'bg-rose-50',
          text: 'text-rose-950',
          subText: 'text-rose-700',
        }

  return (
    <div className={`grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center ${toneClasses.row}`}>
      <div className="min-w-0">
        <p className={`truncate font-mono text-sm font-black ${toneClasses.text}`}>{candidate.faNumber}</p>
        <p className={`mt-1 text-sm font-black ${toneClasses.text}`}>
          {candidate.project} / Art. {candidate.articleNo}
        </p>
        <p className={`mt-1 text-xs font-bold ${toneClasses.subText}`}>
          {candidate.step} / Menge {candidate.qty} / {candidate.fixture}
        </p>
      </div>
      <span className={`w-fit rounded-md px-2 py-1 text-xs font-black ${toneClasses.badge}`}>rollt weiter</span>
      <p className={`text-xs font-bold sm:col-span-2 ${toneClasses.subText}`}>
        {reason}
      </p>
    </div>
  )
}

function parseJobCsv(csvText: string): AutoPlanCandidate[] {
  const rows = csvText
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)

  const [headerRow, ...dataRows] = rows

  if (!headerRow) {
    return []
  }

  const headers = splitCsvRow(headerRow).map((header) => header.trim())

  return dataRows
    .map((row, index) => {
      const values = splitCsvRow(row)
      const record = headers.reduce<Record<string, string>>((current, header, headerIndex) => {
        current[header] = values[headerIndex]?.trim() ?? ''
        return current
      }, {})

      return {
        alreadyWelded: toBoolean(record.alreadyTacked || record.schonGeheftet || record.alreadyWelded),
        anlageMin: record.anlageMin || '30',
        articleNo: record.articleNo || record.article || '',
        date: weekDays[0].date,
        faNumber: record.faNumber || record.fa || `FA-IMPORT-${index + 1}`,
        fixture: record.fixture || record.vorrichtung || 'Vorrichtung A',
        id: `upload-${Date.now()}-${index}`,
        isForced: toBoolean(record.force || record.erzwingen || record.forced),
        isHeld: toBoolean(record.hold || record.zurueckhalten || record.naechsteSchicht),
        isPriority: toBoolean(record.priority || record.prioritaet),
        optic: record.optic || '',
        project: record.project || 'Pesa',
        qty: record.qty || record.menge || '1',
        ruestzeitMin: record.ruestzeitMin || record.ruestMin || '0',
        schlosserMin: record.schlosserMin || '45',
        shift: 'F' as ShiftCode,
        step: normalizeStep(record.step || record.schritt || '1'),
        wireNumber: record.wireNumber || record.drahtNr || '',
      }
    })
    .filter((job) => job.faNumber.trim() && job.articleNo.trim())
}

function splitCsvRow(row: string) {
  const values: string[] = []
  let current = ''
  let isQuoted = false

  row.split('').forEach((char) => {
    if (char === '"') {
      isQuoted = !isQuoted
      return
    }

    if (char === ',' && !isQuoted) {
      values.push(current)
      current = ''
      return
    }

    current += char
  })

  values.push(current)
  return values
}

function toBoolean(value: string) {
  return ['1', 'true', 'yes', 'ja', 'y'].includes(value.trim().toLowerCase())
}

function normalizeStep(step: string) {
  const cleanedStep = step.trim()
  return cleanedStep.toLowerCase().startsWith('schritt') ? cleanedStep : `Schritt ${cleanedStep}`
}

function getShiftId(date: string, shift: ShiftCode) {
  return `${date}-${shift}`
}

function buildAutoPlan(
  shiftsToPlan: PlannerShift[],
  candidates: AutoPlanCandidate[],
  targetPercent: number,
  includeNight: boolean,
  shiftCapacity: ShiftCapacityDraft,
): AutoPlanResult {
  const targetMinutes = Math.round((productiveShiftMinutes * targetPercent) / 100)
  const placements: AutoPlanPlacement[] = []
  const held = candidates.filter((candidate) => candidate.isHeld)
  const remainingCandidates = candidates
    .filter((candidate) => !candidate.isHeld)
    .map((candidate, order) => ({ candidate, order }))
  const scheduledIds = new Set<string>()
  const shiftStates = shiftsToPlan
    .filter((shift) => includeNight || shift.shift !== 'N')
    .map((shift) => {
      const shiftLoad = getShiftLoad(shift.jobs)
      const capacity = shiftCapacity[shift.shift]
      const fixtureCount = Math.max(Number(capacity.fixtures) || 0, 0)
      const welderCount = Math.max(Number(capacity.welders) || 0, 0)

      return {
        fixtureAssignments: {},
        fixtureAvailableAt: Array.from({ length: fixtureCount }, () => 0),
        remainingCandidates,
        robotAvailableAt: shiftLoad.anlageAndRuest,
        robotWorkMinutes: shiftLoad.anlageAndRuest,
        shift,
        welderAvailableAt: Array.from({ length: welderCount }, () => 0),
      }
    })

  shiftStates.forEach((state) => {
    let nextPlacement = findNextShiftPlacement(state, remainingCandidates, scheduledIds, targetMinutes)

    while (nextPlacement) {
      const [nextJob] = remainingCandidates.splice(nextPlacement.remainingIndex, 1)
      const job = createJobFromDraft(nextJob.candidate, `auto-${nextJob.candidate.id}-${nextJob.order}`)

      applySimulatedPlacement(state, nextJob.candidate, nextPlacement.placement)
      scheduledIds.add(nextJob.candidate.id)
      placements.push({
        candidate: nextJob.candidate,
        job,
        shift: state.shift,
      })
      nextPlacement = findNextShiftPlacement(state, remainingCandidates, scheduledIds, targetMinutes)
    }
  })

  return { deferred: remainingCandidates.map((item) => item.candidate), held, placements }
}

function findNextShiftPlacement(
  state: ShiftSimulationState,
  remainingCandidates: { candidate: AutoPlanCandidate; order: number }[],
  scheduledIds: Set<string>,
  targetMinutes: number,
) {
  const eligiblePlacements = remainingCandidates
    .map((item, remainingIndex) => ({
      ...item,
      remainingIndex,
      placement: isStepReady(item.candidate, remainingCandidates, scheduledIds)
        ? getSimulatedPlacement(state, item.candidate)
        : null,
    }))
    .filter((item): item is { candidate: AutoPlanCandidate; order: number; placement: SimulatedPlacement; remainingIndex: number } =>
      Boolean(item.placement && (item.candidate.isForced || item.placement.robotEnd <= targetMinutes)),
    )

  if (eligiblePlacements.length === 0) {
    return null
  }

  return eligiblePlacements.sort((a, b) => {
    if (a.candidate.isForced !== b.candidate.isForced) {
      return a.candidate.isForced ? -1 : 1
    }

    if (a.candidate.isPriority !== b.candidate.isPriority) {
      return a.candidate.isPriority ? -1 : 1
    }

    if (a.placement.robotEnd !== b.placement.robotEnd) {
      return a.placement.robotEnd - b.placement.robotEnd
    }

    return a.order - b.order
  })[0]
}

function applySimulatedPlacement(state: ShiftSimulationState, candidate: AutoPlanCandidate, placement: SimulatedPlacement) {
  const chainKey = getChainKey(candidate)

  if (placement.welderIndex >= 0) {
    state.welderAvailableAt[placement.welderIndex] = placement.readyAt
  }

  state.fixtureAvailableAt[placement.fixtureIndex] = placement.robotEnd
  state.fixtureAssignments[chainKey] = placement.fixtureIndex
  state.robotAvailableAt = placement.robotEnd
  state.robotWorkMinutes += getDraftAnlageMinutes(candidate)

  if (!hasLaterStepInChain(candidate, state.remainingCandidates)) {
    delete state.fixtureAssignments[chainKey]
  }
}

function getSimulatedPlacement(state: ShiftSimulationState, candidate: AutoPlanCandidate) {
  const fixtureIndex = getFixtureIndex(state, candidate)
  const robotMinutes = getDraftAnlageMinutes(candidate)
  const tackMinutes = getDraftSchlosserMinutes(candidate)

  if (fixtureIndex < 0 || robotMinutes <= 0) {
    return null
  }

  if (tackMinutes === 0) {
    const readyAt = state.fixtureAvailableAt[fixtureIndex]
    const robotStart = Math.max(state.robotAvailableAt, readyAt)

    return {
      fixtureIndex,
      readyAt,
      robotEnd: robotStart + robotMinutes,
      welderIndex: -1,
    }
  }

  const welderIndex = getEarliestAvailableIndex(state.welderAvailableAt)

  if (welderIndex < 0) {
    return null
  }

  const tackStart = Math.max(state.fixtureAvailableAt[fixtureIndex], state.welderAvailableAt[welderIndex])
  const readyAt = tackStart + tackMinutes
  const robotStart = Math.max(state.robotAvailableAt, readyAt)

  return {
    fixtureIndex,
    readyAt,
    robotEnd: robotStart + robotMinutes,
    welderIndex,
  }
}

function getFixtureIndex(state: ShiftSimulationState, candidate: AutoPlanCandidate) {
  const assignedFixtureIndex = state.fixtureAssignments[getChainKey(candidate)]

  if (assignedFixtureIndex !== undefined) {
    return assignedFixtureIndex
  }

  const usedIndexes = new Set(Object.values(state.fixtureAssignments))
  const availableFixtureIndexes = state.fixtureAvailableAt
    .map((availableAt, index) => ({ availableAt, index }))
    .filter((fixtureState) => !usedIndexes.has(fixtureState.index))

  if (availableFixtureIndexes.length === 0) {
    return -1
  }

  return availableFixtureIndexes.sort((a, b) => a.availableAt - b.availableAt)[0].index
}

function hasLaterStepInChain(candidate: AutoPlanCandidate, remainingCandidates: { candidate: AutoPlanCandidate }[]) {
  const candidateStep = getStepNumber(candidate.step)

  return remainingCandidates.some((item) => {
    const other = item.candidate

    return getChainKey(other) === getChainKey(candidate) && getStepNumber(other.step) > candidateStep
  })
}

function isStepReady(
  candidate: AutoPlanCandidate,
  remainingCandidates: { candidate: AutoPlanCandidate }[],
  scheduledIds: Set<string>,
) {
  const candidateStep = getStepNumber(candidate.step)

  if (candidateStep <= 0) {
    return true
  }

  return !remainingCandidates.some((item) => {
    const other = item.candidate

    return (
      other.id !== candidate.id &&
      !scheduledIds.has(other.id) &&
      getChainKey(other) === getChainKey(candidate) &&
      getStepNumber(other.step) < candidateStep
    )
  })
}

function canMarkDraftAsTacked(draft: PlannerDraft, jobPool: AutoPlanCandidate[]) {
  return !jobPool.some((candidate) => isBlockingEarlierStep(candidate, draft))
}

function canMarkCandidateAsTacked(candidate: AutoPlanCandidate, jobPool: AutoPlanCandidate[]) {
  return !jobPool.some((other) => other.id !== candidate.id && isBlockingEarlierStep(other, candidate))
}

function getDeferredReason(candidate: AutoPlanCandidate, jobPool: AutoPlanCandidate[]) {
  if (!canMarkCandidateAsTacked(candidate, jobPool)) {
    return 'Ein frueherer Schritt aus derselben Projekt-/Artikel-/VR-Kette fehlt noch.'
  }

  if (!candidate.alreadyWelded) {
    return 'Passt mit Heftzeit, Roboterziel, Schlossers und VR-Plaetzen nicht mehr in die offene Empfehlung.'
  }

  return 'Passt mit der aktuellen Roboter-Zielauslastung und den freien VR-Plaetzen nicht mehr in die offene Empfehlung.'
}

function enforceTackedRules(jobPool: AutoPlanCandidate[]) {
  return jobPool.map((candidate) => ({
    ...candidate,
    alreadyWelded: candidate.alreadyWelded && canMarkCandidateAsTacked(candidate, jobPool),
  }))
}

function isBlockingEarlierStep(candidate: PlannerDraft, target: PlannerDraft) {
  return getChainKey(candidate) === getChainKey(target) && getStepNumber(candidate.step) < getStepNumber(target.step)
}

function getChainKey(job: Pick<PlannerDraft, 'articleNo' | 'fixture' | 'project'>) {
  return [job.project, job.articleNo, job.fixture].map((value) => value.trim().toLowerCase()).join('|')
}

function getStepNumber(step: string) {
  const match = step.match(/\d+/)
  return match ? Number(match[0]) : 0
}

function getEarliestAvailableIndex(values: number[]) {
  if (values.length === 0) {
    return -1
  }

  return values.reduce((bestIndex, value, index) => (value < values[bestIndex] ? index : bestIndex), 0)
}

function getShiftLoad(jobs: ProductionJob[]) {
  return jobs.reduce(
    (load, job) => ({
      anlageAndRuest: load.anlageAndRuest + job.anlageMin * job.plannedQty + job.ruestzeitMin,
      schlosser: load.schlosser + job.schlosserMin * job.plannedQty,
      ruest: load.ruest + job.ruestzeitMin,
    }),
    { anlageAndRuest: 0, ruest: 0, schlosser: 0 },
  )
}

function createJobFromDraft(draft: PlannerDraft, id: string): ProductionJob {
  return {
    id,
    faNumber: draft.faNumber,
    project: draft.project,
    articleNo: draft.articleNo,
    step: draft.step,
    fixture: draft.fixture,
    optic: draft.optic === 'ALO' || draft.optic === 'BEO' ? draft.optic : undefined,
    wireNumber: draft.wireNumber || undefined,
    vr: 3,
    station: 1,
    plannedQty: Number(draft.qty),
    doneQty: 0,
    status: 'open',
    priority: draft.isPriority ? 'carryover' : 'normal',
    kapaBedienerMin: -getSinglePartSchlosserMinutes(draft),
    schlosserMin: getSinglePartSchlosserMinutes(draft),
    anlageMin: Number(draft.anlageMin),
    ruestzeitMin: Number(draft.ruestzeitMin),
  }
}

function getDraftAnlageMinutes(draft: PlannerDraft) {
  return Number(draft.anlageMin) * Number(draft.qty) + Number(draft.ruestzeitMin)
}

function getDraftSchlosserMinutes(draft: PlannerDraft) {
  return getSinglePartSchlosserMinutes(draft) * Number(draft.qty)
}

function getSinglePartSchlosserMinutes(draft: PlannerDraft) {
  return draft.alreadyWelded ? 0 : Number(draft.schlosserMin)
}

function getJobAnlageMinutes(job: ProductionJob) {
  return job.anlageMin * job.plannedQty + job.ruestzeitMin
}

function getLoadPercent(minutes: number) {
  return Math.round((minutes / productiveShiftMinutes) * 100)
}

function getLoadBadgeClass(percent: number) {
  if (percent > 110) {
    return 'bg-rose-100 text-rose-700'
  }

  if (percent >= 95) {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (percent >= 80) {
    return 'bg-amber-100 text-amber-800'
  }

  return 'bg-blue-100 text-blue-700'
}

function getLoadBarClass(percent: number) {
  if (percent > 110) {
    return 'bg-rose-500'
  }

  if (percent >= 95) {
    return 'bg-emerald-500'
  }

  if (percent >= 80) {
    return 'bg-amber-500'
  }

  return 'bg-blue-700'
}

function getPlannerStatusLabel(status: JobStatus) {
  const labels: Record<JobStatus, string> = {
    blocked: 'Blockiert',
    done: 'Fertig',
    open: 'Offen',
    running: 'Laeuft',
  }

  return labels[status]
}

function getPlannerStatusClass(status: JobStatus) {
  const classes: Record<JobStatus, string> = {
    blocked: 'bg-rose-50 text-rose-700 ring-rose-200',
    done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    open: 'bg-slate-100 text-slate-700 ring-slate-200',
    running: 'bg-sky-50 text-sky-700 ring-sky-200',
  }

  return classes[status]
}

function SmartTile({
  label,
  tone = 'blue',
  value,
}: {
  label: string
  tone?: 'blue' | 'emerald' | 'rose'
  value: string
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  }

  return (
    <div className={`rounded-xl p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-black uppercase tracking-[0.12em] opacity-80">{label}</p>
      <p className="mt-2 text-lg font-black">{value}</p>
    </div>
  )
}

function TextField({
  label,
  onChange,
  type = 'text',
  value,
}: {
  label: string
  onChange: (value: string) => void
  type?: string
  value: string
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
      {label}
      <input className={`${inputClassName} w-full min-w-0`} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className={`${cardClassName} p-4`}>
      <div className="flex items-center gap-2 text-blue-700">
        {icon}
        <span className="text-xs font-black uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mt-3 text-xl font-black text-slate-950">{value}</p>
    </div>
  )
}
