import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Factory,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  createJob,
  getJobs,
  getRobots,
  updateJobSuProgress,
  updateJob,
  type Job,
  type Robot,
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

type OperatorNotice = {
  text: string
  tone: 'error' | 'info' | 'success'
}

type RepairDraft = {
  faNumber: string
  projekt: string
  artikelNummer: string
  jobType: Job['jobType']
  schritt: string
  shift: ShiftCode
  vorrichtung: string
  anlageMinutes: string
  schlosserMinutes: string
  schonGeheftet: boolean
  comment: string
}

const plannerDate = '2026-06-08'

const shifts: { label: string; name: string; time: string; value: ShiftCode }[] = [
  { label: 'N', name: 'Nacht', time: '22:00 - 06:00', value: 'N' },
  { label: 'F', name: 'Frueh', time: '06:00 - 14:00', value: 'F' },
  { label: 'S', name: 'Spaet', time: '14:00 - 22:00', value: 'S' },
]

const emptyRepairDraft: RepairDraft = {
  faNumber: '',
  projekt: '',
  artikelNummer: '',
  jobType: 'production',
  schritt: '1',
  shift: 'F',
  vorrichtung: '1',
  anlageMinutes: '45',
  schlosserMinutes: '60',
  schonGeheftet: false,
  comment: '',
}

export function OperatorBoardPage() {
  const { robotId } = useParams()
  const { currentUser } = useCurrentUser()
  const [robots, setRobots] = useState<Robot[]>([])
  const [selectedRobotId, setSelectedRobotId] = useState('')
  const [selectedShiftCode, setSelectedShiftCode] = useState<ShiftCode>(currentUser.shift ?? 'F')
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)
  const [notice, setNotice] = useState<OperatorNotice | null>(null)
  const [suJob, setSuJob] = useState<Job | null>(null)
  const [suPercent, setSuPercent] = useState('50')
  const [isRepairPanelOpen, setIsRepairPanelOpen] = useState(false)
  const [repairDraft, setRepairDraft] = useState<RepairDraft>(emptyRepairDraft)
  const [duplicateJob, setDuplicateJob] = useState<Job | null>(null)

  const selectedRobot = robots.find((robot) => robot.id === selectedRobotId)

  const showNotice = (text: string, tone: OperatorNotice['tone'] = 'info') => {
    setNotice({ text, tone })
    window.setTimeout(() => {
      setNotice((current) => (current?.text === text ? null : current))
    }, 5600)
  }

  const loadBoard = useCallback(async () => {
    setIsLoading(true)

    try {
      const robotList = await getRobots()
      const nextRobot = findRobotFromRoute(robotList, robotId)

      setRobots(robotList)
      setSelectedRobotId(nextRobot?.id ?? '')

      if (!nextRobot) {
        setJobs([])
        return
      }

      const nextJobs = await getJobs({ robotId: nextRobot.id, date: plannerDate })
      setJobs(sortOperatorJobs(nextJobs))
    } catch (error) {
      showNotice(getErrorMessage(error), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [robotId])

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  const dayJobs = useMemo(() => jobs.filter((job) => job.date === plannerDate), [jobs])
  const doneJobs = dayJobs.filter((job) => job.status === 'done')
  const openDayJobs = dayJobs.filter((job) => job.status !== 'done')
  const readyJobs = openDayJobs.filter((job) => job.schonGeheftet || job.jobType === 'repair')
  const waitingForHeften = openDayJobs.filter((job) => !job.schonGeheftet && job.jobType === 'production')
  const repairJobs = dayJobs.filter((job) => job.jobType === 'repair')
  const robotMinutesOpen = openDayJobs.reduce((total, job) => total + (job.remainingAnlageMinutes ?? job.anlageMinutes), 0)

  const patchJob = async (job: Job, patch: Partial<Job>, successMessage: string) => {
    setIsWorking(true)
    setNotice(null)

    try {
      await updateJob(job.id, patch)
      showNotice(successMessage, 'success')
      await loadBoard()
    } catch (error) {
      showNotice(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const markGeheftet = (job: Job) => {
    void patchJob(job, { schlosserMinutes: 0, schonGeheftet: true }, `${job.faNumber} ist als schon geheftet markiert.`)
  }

  const markDone = (job: Job) => {
    void patchJob(job, { status: 'done' }, `${job.faNumber} wurde fertig gemeldet.`)
  }

  const markNotDone = (job: Job) => {
    const nextShift = getNextShift(job.shift)

    void patchJob(
      job,
      {
        date: getNextShiftDate(job.date, job.shift),
        isForced: true,
        isHeld: false,
        isPriority: true,
        shift: nextShift,
        status: 'open',
      },
      `${job.faNumber} wurde als nicht fertig markiert und nach ${getShiftName(nextShift)} als Prioritaet uebertragen.`,
    )
  }

  const saveSu = async () => {
    if (!suJob) return

    const percentDone = clampNumber(Number(suPercent), 0, 100)
    setIsWorking(true)
    setNotice(null)

    try {
      await updateJobSuProgress(suJob.id, {
        progressPercent: percentDone,
        nextShift: getNextShift(suJob.shift),
      })
      if (percentDone < 100) {
        await updateJob(suJob.id, {
          date: getNextShiftDate(suJob.date, suJob.shift),
          isForced: true,
          isHeld: false,
          isPriority: true,
        })
      }
      showNotice(
        percentDone === 100
          ? `${suJob.faNumber} wurde mit 100% SU als fertig gespeichert.`
          : `${suJob.faNumber} wurde mit ${percentDone}% SU gespeichert und bleibt als Prioritaet fuer die naechste Schicht sichtbar.`,
        'success',
      )
      setSuJob(null)
      setSuPercent('50')
      await loadBoard()
    } catch (error) {
      showNotice(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const createOperatorJob = async () => {
    if (!selectedRobot || !repairDraft.faNumber.trim() || !repairDraft.projekt.trim() || !repairDraft.artikelNummer.trim()) {
      showNotice('FA Nummer, Projekt und Art. Nr. sind Pflichtfelder.', 'error')
      return
    }

    setIsWorking(true)
    setNotice(null)

    try {
      if (repairDraft.jobType === 'production') {
        const robotJobs = await getJobs({ robotId: selectedRobot.id })
        const existingProductionJob = findExistingProductionJob(robotJobs, repairDraft)

        if (existingProductionJob) {
          setDuplicateJob(existingProductionJob)
          showNotice(`${existingProductionJob.faNumber} Schritt ${existingProductionJob.schritt} ist bereits geplant.`, 'info')
          return
        }
      }

      await createJob({
        faNumber: repairDraft.faNumber.trim(),
        projekt: repairDraft.projekt.trim(),
        artikelNummer: repairDraft.artikelNummer.trim(),
        schritt: toNumber(repairDraft.schritt, 1),
        vorrichtung: toNumber(repairDraft.vorrichtung, 1),
        menge: 1,
        robotId: selectedRobot.id,
        anlageMinutes: toNumber(repairDraft.anlageMinutes, 0),
        schlosserMinutes: repairDraft.schonGeheftet ? 0 : toNumber(repairDraft.schlosserMinutes, 0),
        ruestMinutes: 0,
        jobType: repairDraft.jobType,
        schonGeheftet: repairDraft.schonGeheftet,
        isPriority: true,
        isForced: true,
        isHeld: true,
        approvalStatus: 'pending',
        createdByName: currentUser.name,
        createdByRole: currentUser.role,
        status: 'open',
        date: plannerDate,
        shift: repairDraft.shift,
      })
      setDuplicateJob(null)
      setRepairDraft({ ...emptyRepairDraft, shift: selectedShiftCode })
      setIsRepairPanelOpen(false)
      showNotice('Job wurde angelegt und wartet auf Freigabe durch den Supervisor.', 'success')
      await loadBoard()
    } catch (error) {
      showNotice(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const moveExistingJobToRequestedShift = async () => {
    if (!duplicateJob || !selectedRobot) return

    setIsWorking(true)
    setNotice(null)

    try {
      await updateJob(duplicateJob.id, {
        date: plannerDate,
        shift: repairDraft.shift,
        isForced: true,
        isHeld: true,
        isPriority: true,
        approvalStatus: 'pending',
        createdByName: currentUser.name,
        createdByRole: currentUser.role,
        schonGeheftet: repairDraft.schonGeheftet || duplicateJob.schonGeheftet,
        schlosserMinutes: repairDraft.schonGeheftet ? 0 : duplicateJob.schlosserMinutes,
      })
      setDuplicateJob(null)
      setRepairDraft({ ...emptyRepairDraft, shift: selectedShiftCode })
      setIsRepairPanelOpen(false)
      showNotice(`${duplicateJob.faNumber} wurde in ${getShiftName(repairDraft.shift)} gezogen und wartet auf Supervisor-Freigabe.`, 'success')
      await loadBoard()
    } catch (error) {
      showNotice(getErrorMessage(error), 'error')
    } finally {
      setIsWorking(false)
    }
  }

  const createDuplicateAsRepair = () => {
    setDuplicateJob(null)
    setRepairDraft((current) => ({
      ...current,
      jobType: 'repair',
    }))
    showNotice('Typ wurde auf Reparatur gesetzt. Jetzt kann der Job als Nacharbeit gespeichert werden.', 'info')
  }

  if (!isLoading && !selectedRobot) {
    return <Navigate to="/robots" replace />
  }

  return (
    <main className={`${pageShellClassName} bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#f7f9fc_34rem)]`}>
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <Link to="/robots" className="mb-2 inline-flex items-center gap-2 text-sm font-black text-blue-700">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Anlagen-Auswahl
            </Link>
            <h1 className="text-2xl font-black tracking-normal text-slate-950">
              Bediener-Board{selectedRobot ? `: ${selectedRobot.name}` : ''}
            </h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {selectedRobot ? `${selectedRobot.assetId} / ${selectedRobot.location}` : 'Backend-Daten werden geladen'} / {currentUser.name}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!currentUser.shift && (
              <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
                Schicht
                <select
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black normal-case tracking-normal text-slate-950 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                  value={selectedShiftCode}
                  onChange={(event) => setSelectedShiftCode(event.target.value as ShiftCode)}
                >
                  {shifts.map((shift) => (
                    <option key={shift.value} value={shift.value}>
                      {shift.label} / {shift.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className={secondaryButtonClassName} type="button" onClick={() => void loadBoard()} disabled={isWorking}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Aktualisieren
            </button>
            <Link className={secondaryButtonClassName} to={selectedRobot ? `/robots/${selectedRobot.id}/day` : '/robots'}>
              Tagesplan
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        {isLoading ? (
          <div className={`${cardClassName} flex items-center gap-3 p-6 text-sm font-bold text-slate-500`}>
            <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
            Lade Bediener-Board...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Metric icon={<Factory className="h-5 w-5" />} label="Anlage" value={selectedRobot?.name ?? 'Keine'} />
              <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Fertig heute" value={`${doneJobs.length}/${dayJobs.length}`} />
              <Metric icon={<ShieldCheck className="h-5 w-5" />} label="Bereit" value={`${readyJobs.length}`} />
              <Metric icon={<Clock3 className="h-5 w-5" />} label="Roboter offen" value={`${robotMinutesOpen}m`} />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0 space-y-5">
                <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-2xl shadow-slate-200/70 backdrop-blur">
                  <div className="border-b border-slate-100 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Tagesaufgaben</p>
                        <h2 className="mt-1 text-xl font-black text-slate-950">Alle Schichten / {plannerDate}</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">Bediener koennen auch spaetere Schichten als schon geheftet melden. Danach wird der Tagesplan neu verteilt.</p>
                      </div>
                      <button
                        className={secondaryButtonClassName}
                        type="button"
                        onClick={() => {
                          setRepairDraft((current) => ({ ...current, shift: selectedShiftCode }))
                          setIsRepairPanelOpen((current) => !current)
                        }}
                      >
                        <Wrench className="h-4 w-4" aria-hidden="true" />
                        Job melden
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {shifts.map((shift) => (
                      <ShiftQueueSection
                        currentShiftCode={selectedShiftCode}
                        isWorking={isWorking}
                        jobs={dayJobs.filter((job) => job.shift === shift.value && job.status !== 'done')}
                        key={shift.value}
                        onDone={markDone}
                        onGeheftet={markGeheftet}
                        onNotDone={markNotDone}
                        onSu={(nextSuJob) => {
                          setSuJob(nextSuJob)
                          setSuPercent(String(nextSuJob.progressPercent ?? 50))
                        }}
                        shift={shift}
                      />
                    ))}
                    {openDayJobs.length === 0 && (
                      <p className="p-5 text-sm font-bold text-emerald-700">Keine offenen Jobs fuer diesen Tag.</p>
                    )}
                  </div>
                </section>

                {doneJobs.length > 0 && (
                  <section className={`${cardClassName} overflow-hidden`}>
                    <div className="border-b border-slate-100 p-5">
                      <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-700">Erledigt</p>
                      <h2 className="mt-1 text-xl font-black text-slate-950">Fertig gemeldete Jobs</h2>
                    </div>
                    <div className="grid gap-3 p-3 md:grid-cols-2">
                      {doneJobs.map((job) => (
                        <JobMiniCard key={job.id} job={job} />
                      ))}
                    </div>
                  </section>
                )}
              </section>

              <aside className="space-y-5">
                <section className={`${cardClassName} p-5`}>
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Status</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">Was steht an?</h2>
                  <div className="mt-4 space-y-3">
                    <SideStat label="Wartet auf Heften" value={waitingForHeften.length} tone="amber" />
                    <SideStat label="Reparaturen" value={repairJobs.length} tone="rose" />
                    <SideStat label="SU / Rest" value={openDayJobs.filter((job) => job.progressPercent && job.progressPercent > 0 && job.progressPercent < 100).length} tone="blue" />
                  </div>
                </section>

                {isRepairPanelOpen && (
                  <RepairPanel
                    duplicateJob={duplicateJob}
                    draft={repairDraft}
                    isWorking={isWorking}
                    onChange={(patch) => {
                      setDuplicateJob(null)
                      setRepairDraft((current) => ({ ...current, ...patch }))
                    }}
                    onCreate={() => void createOperatorJob()}
                    onCreateRepair={createDuplicateAsRepair}
                    onMoveExisting={() => void moveExistingJobToRequestedShift()}
                  />
                )}

                <section className={`${cardClassName} p-5`}>
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-blue-700" aria-hidden="true" />
                    <h2 className="text-lg font-black text-slate-950">Schichtuebergabe</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    SU-Jobs mit Prozent speichern. Jeder offene Job kann einzeln in die naechste Schicht uebertragen werden.
                  </p>
                  <button className={`${primaryButtonClassName} mt-4 w-full`} type="button" onClick={() => showNotice('Uebergabe gespeichert. Offene/SU Jobs bleiben fuer die naechste Planung sichtbar.', 'success')}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Uebergabe speichern
                  </button>
                </section>
              </aside>
            </div>
          </>
        )}
      </section>

      {suJob && (
        <SuDialog
          isWorking={isWorking}
          job={suJob}
          percent={suPercent}
          onCancel={() => setSuJob(null)}
          onChange={setSuPercent}
          onSave={() => void saveSu()}
        />
      )}
      {notice && <Toast notice={notice} onClose={() => setNotice(null)} />}
    </main>
  )
}

function ShiftQueueSection({
  currentShiftCode,
  isWorking,
  jobs,
  onDone,
  onGeheftet,
  onNotDone,
  onSu,
  shift,
}: {
  currentShiftCode: ShiftCode
  isWorking: boolean
  jobs: Job[]
  onDone: (job: Job) => void
  onGeheftet: (job: Job) => void
  onNotDone: (job: Job) => void
  onSu: (job: Job) => void
  shift: { label: string; name: string; time: string; value: ShiftCode }
}) {
  const isCurrentShift = shift.value === currentShiftCode
  const readyCount = jobs.filter((job) => job.schonGeheftet || job.jobType === 'repair').length

  return (
    <section className="scroll-mt-24">
      <div className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${isCurrentShift ? 'bg-blue-50/90' : 'bg-slate-50/90'}`}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-lg px-2 py-1 text-xs font-black ${isCurrentShift ? 'bg-blue-700 text-white' : 'bg-slate-900 text-white'}`}>
              {shift.label}
            </span>
            <p className="font-black text-slate-950">{shift.name}</p>
            {isCurrentShift && <span className="rounded-lg bg-white px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-blue-700">Aktuelle Schicht</span>}
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">{shift.time}</p>
        </div>
        <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
          {jobs.length} offen / {readyCount} bereit
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {jobs.map((job, index) => (
          <QueueJobRow
            index={index}
            isWorking={isWorking}
            job={job}
            key={job.id}
            onDone={onDone}
            onGeheftet={onGeheftet}
            onNotDone={onNotDone}
            onSu={onSu}
          />
        ))}
        {jobs.length === 0 && <p className="px-4 py-5 text-sm font-bold text-slate-400">Keine offenen Jobs in dieser Schicht.</p>}
      </div>
    </section>
  )
}

function QueueJobRow({
  index,
  isWorking,
  job,
  onDone,
  onGeheftet,
  onNotDone,
  onSu,
}: {
  index: number
  isWorking: boolean
  job: Job
  onDone: (job: Job) => void
  onGeheftet: (job: Job) => void
  onNotDone: (job: Job) => void
  onSu: (job: Job) => void
}) {
  return (
    <article className="group grid gap-3 p-4 transition hover:bg-slate-50/80 lg:grid-cols-[44px_minmax(0,1fr)_auto] lg:items-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-600 transition group-hover:bg-blue-700 group-hover:text-white">
        {index + 1}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black text-slate-950">{job.faNumber}</p>
          <JobStateBadge job={job} />
          {job.isPriority && <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-amber-800">Prio</span>}
          {job.isHeld && <span className="rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-violet-800">Freigabe</span>}
        </div>
        <p className="mt-1 text-sm font-bold text-slate-500">
          {job.projekt} / Art. {job.artikelNummer} / Schritt {job.schritt} / VR-{job.vorrichtung}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-black text-slate-500">
          <span className="rounded-lg bg-slate-100 px-2 py-1">Roboter {job.remainingAnlageMinutes ?? job.anlageMinutes}m</span>
          <span className="rounded-lg bg-slate-100 px-2 py-1">Schlosser {job.schonGeheftet ? 0 : job.schlosserMinutes}m</span>
          <span className="rounded-lg bg-slate-100 px-2 py-1">{job.jobType === 'repair' ? 'Reparatur' : 'Produktion'}</span>
        </div>
      </div>
      <JobActions compact isWorking={isWorking} job={job} onDone={onDone} onGeheftet={onGeheftet} onNotDone={onNotDone} onSu={onSu} />
    </article>
  )
}

function JobActions({
  compact = false,
  isWorking,
  job,
  onDone,
  onGeheftet,
  onNotDone,
  onSu,
}: {
  compact?: boolean
  isWorking: boolean
  job: Job
  onDone: (job: Job) => void
  onGeheftet: (job: Job) => void
  onNotDone: (job: Job) => void
  onSu: (job: Job) => void
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'lg:justify-end' : ''}`}>
      <button className={smallButtonClassName} type="button" disabled={isWorking || job.schonGeheftet || job.jobType === 'repair'} onClick={() => onGeheftet(job)}>
        Schon geheftet
      </button>
      <button className={smallButtonClassName} type="button" disabled={isWorking || job.status === 'done'} onClick={() => onSu(job)}>
        SU
      </button>
      <button className={smallButtonClassName} type="button" disabled={isWorking || job.status === 'done'} onClick={() => onNotDone(job)}>
        Nicht fertig
      </button>
      <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={isWorking || job.status === 'done'} onClick={() => onDone(job)}>
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Fertig
      </button>
    </div>
  )
}

function RepairPanel({
  duplicateJob,
  draft,
  isWorking,
  onChange,
  onCreate,
  onCreateRepair,
  onMoveExisting,
}: {
  duplicateJob: Job | null
  draft: RepairDraft
  isWorking: boolean
  onChange: (patch: Partial<RepairDraft>) => void
  onCreate: () => void
  onCreateRepair: () => void
  onMoveExisting: () => void
}) {
  return (
    <section className="rounded-3xl border border-violet-100 bg-white/95 p-5 shadow-xl shadow-violet-100/60">
      <div className="flex items-center gap-2">
        <Wrench className="h-5 w-5 text-violet-700" aria-hidden="true" />
        <h2 className="text-lg font-black text-slate-950">Job melden</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">Wird als Freigabe-Job gespeichert. Der Supervisor kann ihn spaeter bestaetigen oder freigeben.</p>
      <div className="mt-4 grid gap-3">
        <TextField label="FA Nummer" value={draft.faNumber} onChange={(value) => onChange({ faNumber: value })} />
        <TextField label="Projekt" value={draft.projekt} onChange={(value) => onChange({ projekt: value })} />
        {duplicateJob && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <p className="font-black text-amber-950">Diese FA / dieser Schritt ist schon geplant.</p>
                <p className="mt-1 text-sm font-bold leading-6 text-amber-900">
                  {duplicateJob.faNumber} / {duplicateJob.projekt} / Art. {duplicateJob.artikelNummer} / Schritt {duplicateJob.schritt} / {formatPlanDate(duplicateJob.date)} / {getShiftName(duplicateJob.shift)}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <button className={primaryButtonClassName} type="button" disabled={isWorking} onClick={onMoveExisting}>
                In diese Schicht ziehen
              </button>
              <button className={secondaryButtonClassName} type="button" disabled={isWorking} onClick={onCreateRepair}>
                Als Reparatur melden
              </button>
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
            Typ
            <select className={`${inputClassName} w-full`} value={draft.jobType} onChange={(event) => onChange({ jobType: event.target.value as Job['jobType'] })}>
              <option value="production">Produktion</option>
              <option value="repair">Reparatur</option>
            </select>
          </label>
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
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Art. Nr." value={draft.artikelNummer} onChange={(value) => onChange({ artikelNummer: value })} />
          <TextField label="Schritt" type="number" value={draft.schritt} onChange={(value) => onChange({ schritt: value })} />
          <TextField label="VR" type="number" value={draft.vorrichtung} onChange={(value) => onChange({ vorrichtung: value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Roboter min" type="number" value={draft.anlageMinutes} onChange={(value) => onChange({ anlageMinutes: value })} />
          <TextField label="Schlosser min" type="number" value={draft.schlosserMinutes} onChange={(value) => onChange({ schlosserMinutes: value })} />
        </div>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
          <input className="h-4 w-4 accent-blue-700" type="checkbox" checked={draft.schonGeheftet} onChange={(event) => onChange({ schonGeheftet: event.target.checked })} />
          Schon geheftet
        </label>
        <TextField label="Notiz" value={draft.comment} onChange={(value) => onChange({ comment: value })} />
        <button className={`${primaryButtonClassName} w-full`} type="button" disabled={isWorking} onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Job zur Freigabe speichern
        </button>
      </div>
    </section>
  )
}

function SuDialog({
  isWorking,
  job,
  onCancel,
  onChange,
  onSave,
  percent,
}: {
  isWorking: boolean
  job: Job
  onCancel: () => void
  onChange: (value: string) => void
  onSave: () => void
  percent: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/25">
        <div className="border-b border-slate-100 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">SU speichern</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{job.faNumber}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Prozent eingeben, der schon geschweisst wurde. Die Restzeit bleibt fuer die naechste Planung offen.
          </p>
        </div>
        <div className="p-5">
          <TextField label="Fertig in %" type="number" value={percent} onChange={onChange} />
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
          <button className={secondaryButtonClassName} type="button" disabled={isWorking} onClick={onCancel}>
            Abbrechen
          </button>
          <button className={primaryButtonClassName} type="button" disabled={isWorking} onClick={onSave}>
            <Save className="h-4 w-4" aria-hidden="true" />
            SU speichern
          </button>
        </div>
      </section>
    </div>
  )
}

function JobMiniCard({ job }: { job: Job }) {
  return (
    <article className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="font-black text-slate-950">{job.faNumber}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">
        {job.projekt} / Art. {job.artikelNummer} / Schritt {job.schritt} / VR-{job.vorrichtung}
      </p>
    </article>
  )
}

function JobStateBadge({ job }: { job: Job }) {
  const state = getJobState(job)

  return (
    <span className={`inline-flex rounded-lg px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${state.className}`}>
      {state.label}
    </span>
  )
}

function SideStat({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'rose'; value: number }) {
  const toneClass = {
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-800',
    rose: 'bg-rose-50 text-rose-800',
  }[tone]

  return (
    <div className={`flex items-center justify-between rounded-xl p-4 ${toneClass}`}>
      <span className="text-sm font-black">{label}</span>
      <span className="text-xl font-black">{value}</span>
    </div>
  )
}

function Toast({ notice, onClose }: { notice: OperatorNotice; onClose: () => void }) {
  const className = {
    error: 'border-rose-100 bg-rose-50/95 text-rose-950',
    info: 'border-blue-100 bg-blue-50/95 text-blue-950',
    success: 'border-emerald-100 bg-emerald-50/95 text-emerald-950',
  }[notice.tone]
  const iconClass = {
    error: 'bg-rose-100 text-rose-700',
    info: 'bg-blue-100 text-blue-700',
    success: 'bg-emerald-100 text-emerald-700',
  }[notice.tone]

  return (
    <article className={`fixed right-4 top-20 z-50 flex w-[calc(100%-2rem)] max-w-md items-start gap-3 rounded-2xl border p-4 shadow-2xl shadow-slate-950/15 backdrop-blur sm:right-6 ${className}`}>
      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        {notice.tone === 'error' ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">{notice.tone === 'error' ? 'Aktion nicht moeglich' : notice.tone === 'success' ? 'Gespeichert' : 'Hinweis'}</p>
        <p className="mt-1 text-sm font-bold leading-6">{notice.text}</p>
      </div>
      <button className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-70 transition hover:bg-white/70 hover:opacity-100" type="button" onClick={onClose} aria-label="Meldung schliessen">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </article>
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
      <input className={`${inputClassName} w-full`} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
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

function findRobotFromRoute(robots: Robot[], routeRobotId?: string) {
  const routeId = routeRobotId?.toLowerCase() ?? ''

  return (
    robots.find((robot) => robot.id === routeRobotId) ??
    robots.find((robot) => robot.assetId.toLowerCase() === routeId || robot.assetId.toLowerCase().replace(/[^a-z0-9]/g, '') === routeId)
  )
}

function sortOperatorJobs(jobs: Job[]) {
  return [...jobs].sort((first, second) => {
    if (first.shift !== second.shift) return shiftOrder[first.shift] - shiftOrder[second.shift]
    if (first.status === 'running' && second.status !== 'running') return -1
    if (second.status === 'running' && first.status !== 'running') return 1
    if (first.carriedFromPreviousShift !== second.carriedFromPreviousShift) return first.carriedFromPreviousShift ? -1 : 1
    if (first.isPriority !== second.isPriority) return first.isPriority ? -1 : 1
    if (first.schonGeheftet !== second.schonGeheftet) return first.schonGeheftet ? -1 : 1
    if (first.vorrichtung !== second.vorrichtung) return first.vorrichtung - second.vorrichtung
    if (first.faNumber !== second.faNumber) return first.faNumber.localeCompare(second.faNumber)
    return first.schritt - second.schritt
  })
}

function getJobState(job: Job) {
  if (job.status === 'done') {
    return { className: 'bg-emerald-100 text-emerald-700', label: 'Fertig' }
  }

  if (job.status === 'blocked') {
    return { className: 'bg-rose-100 text-rose-700', label: 'Blockiert' }
  }

  if (job.jobType === 'repair') {
    return { className: 'bg-rose-100 text-rose-700', label: 'Reparatur' }
  }

  if (job.progressPercent && job.progressPercent > 0 && job.progressPercent < 100) {
    return { className: 'bg-blue-100 text-blue-700', label: `SU ${job.progressPercent}%` }
  }

  if (job.schonGeheftet) {
    return { className: 'bg-blue-100 text-blue-700', label: 'Bereit' }
  }

  return { className: 'bg-amber-100 text-amber-800', label: 'Wartet auf Heften' }
}

function getNextShift(shift: ShiftCode): ShiftCode {
  if (shift === 'N') return 'F'
  if (shift === 'F') return 'S'
  return 'N'
}

function getNextShiftDate(date: string, shift: ShiftCode) {
  if (shift !== 'S') return date

  const parsedDate = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsedDate.getTime())) {
    return date
  }

  parsedDate.setDate(parsedDate.getDate() + 1)
  return parsedDate.toISOString().slice(0, 10)
}

function getShiftName(shift: ShiftCode) {
  return shifts.find((item) => item.value === shift)?.name ?? shift
}

function findExistingProductionJob(jobs: Job[], draft: RepairDraft) {
  const faNumber = draft.faNumber.trim().toLowerCase()
  const schritt = toNumber(draft.schritt, 0)

  if (!faNumber || schritt <= 0) {
    return null
  }

  return (
    jobs.find(
      (job) =>
        job.jobType === 'production' &&
        job.faNumber.trim().toLowerCase() === faNumber &&
        job.schritt === schritt,
    ) ?? null
  )
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

function toNumber(value: string, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unbekannter Fehler'
}

const shiftOrder: Record<ShiftCode, number> = { N: 1, F: 2, S: 3 }

const smallButtonClassName =
  'inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'
