import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Factory,
  LayoutGrid,
  ListPlus,
  MessageSquareText,
  Save,
  Table2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  delayReasons,
  robots,
  shiftDelays,
  todayPlan,
  type JobProgressState,
  type ProductionJob,
  type ShiftCode,
} from '../data/demoData'
import {
  cardClassName,
  inputClassName,
  pageShellClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../styles/ui'
import type { PlanningRequestType } from '../requests/requestContext'
import { usePlanningRequests } from '../requests/usePlanningRequests'
import { useCurrentUser } from '../users/useCurrentUser'

type JobEntry = {
  doneQty: number
  progress: JobProgressState
  comment: string
  reason: string
  touched: boolean
  weldedReady: boolean
}

type ExtraBauteilRequest = {
  id: string
  faNumber: string
  project: string
  articleNo: string
  step: string
  fixture: string
  qty: string
  requestType: PlanningRequestType
  reason: string
  comment: string
}

type BoardView = 'cards' | 'table'

const progressOptions: { label: string; value: JobProgressState }[] = [
  { label: 'Fertig', value: 'done' },
  { label: 'Teilweise', value: 'partial' },
  { label: 'Nicht fertig', value: 'not_done' },
  { label: 'SU', value: 'su' },
]

const emptyExtraRequest: Omit<ExtraBauteilRequest, 'id'> = {
  faNumber: '',
  project: '',
  articleNo: '',
  step: '',
  fixture: '',
  qty: '1',
  requestType: 'unplanned',
  reason: 'Material fehlt',
  comment: '',
}

export function OperatorBoardPage() {
  const { robotId } = useParams()
  const { currentUser } = useCurrentUser()
  const { addRequest, requests } = usePlanningRequests()
  const [selectedShiftCode, setSelectedShiftCode] = useState<ShiftCode>(currentUser.shift ?? 'F')
  const selectedRobot = robots.find((robot) => robot.id === robotId)
  const activeShift = todayPlan.find((shift) => shift.robotId === robotId && shift.shift === selectedShiftCode)
  const existingDelays = shiftDelays.filter((delay) => delay.robotId === robotId && delay.shift === selectedShiftCode)
  const [boardView, setBoardView] = useState<BoardView>('cards')
  const [delayMinutes, setDelayMinutes] = useState('30')
  const [delayReason, setDelayReason] = useState(delayReasons[0])
  const [shiftComment, setShiftComment] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [showEndShiftSummary, setShowEndShiftSummary] = useState(false)
  const [handoverConfirmed, setHandoverConfirmed] = useState(false)
  const [extraDraft, setExtraDraft] = useState(emptyExtraRequest)

  const initialEntries = useMemo(() => {
    const entries: Record<string, JobEntry> = {}

    activeShift?.jobs.forEach((job) => {
      entries[job.id] = {
        doneQty: job.doneQty,
        progress: getInitialProgress(job),
        comment: job.operatorNote ?? '',
        reason: job.delayReason ?? '',
        touched: job.doneQty >= job.plannedQty,
        weldedReady: job.schlosserMin === 0 || job.doneQty >= job.plannedQty,
      }
    })

    return entries
  }, [activeShift])

  const [jobEntryState, setJobEntryState] = useState<{ entries: Record<string, JobEntry>; shiftId: string }>({
    entries: initialEntries,
    shiftId: activeShift?.id ?? '',
  })
  const jobEntries = jobEntryState.shiftId === activeShift?.id ? jobEntryState.entries : initialEntries

  if (!selectedRobot) {
    return <Navigate to="/robots" replace />
  }

  if (!activeShift) {
    return (
      <NoShiftPlan
        selectedRobot={selectedRobot}
        selectedShiftCode={selectedShiftCode}
        setSelectedShiftCode={setSelectedShiftCode}
        shift={selectedShiftCode}
        userName={currentUser.name}
        canSelectShift={!currentUser.shift}
      />
    )
  }

  const activeJobs = activeShift.jobs.filter((job) => !isHandled(jobEntries[job.id]))
  const handledJobs = activeShift.jobs.filter((job) => isHandled(jobEntries[job.id]))
  const doneCount = activeShift.jobs.filter((job) => jobEntries[job.id]?.progress === 'done').length
  const remainingRobotMinutes = activeShift.jobs.reduce((sum, job) => sum + getRemainingRobotMinutes(job, jobEntries[job.id]), 0)
  const remainingSchlosserMinutes = activeShift.jobs.reduce((sum, job) => sum + getRemainingSchlosserMinutes(job, jobEntries[job.id]), 0)
  const extraRequests = requests.filter(
    (request) => request.anlageId === selectedRobot.id && request.shift === activeShift.shift && request.operator === currentUser.name,
  )
  const plannedMatch = findPlannedMatch(extraDraft, selectedRobot.id, activeShift.id)
  const suggestedRequestType = getSuggestedRequestType(extraDraft.reason, plannedMatch?.shift.shift)

  const updateEntry = (jobId: string, nextEntry: Partial<JobEntry>) => {
    setJobEntryState((current) => ({
      entries: {
        ...(current.shiftId === activeShift.id ? current.entries : initialEntries),
        [jobId]: {
          ...(current.shiftId === activeShift.id ? current.entries[jobId] : initialEntries[jobId]),
          ...nextEntry,
          touched: true,
        },
      },
      shiftId: activeShift.id,
    }))
    setSavedMessage('')
  }

  const setProgress = (job: ProductionJob, progress: JobProgressState) => {
    updateEntry(job.id, {
      progress,
      doneQty: progress === 'done' ? job.plannedQty : jobEntries[job.id].doneQty,
      weldedReady: progress === 'done' ? true : jobEntries[job.id].weldedReady,
    })
  }

  const nextShiftLabel = getNextShiftLabel(activeShift.shift)

  const addExtraRequest = () => {
    if (!extraDraft.faNumber.trim() || !extraDraft.project.trim() || !extraDraft.articleNo.trim()) {
      setSavedMessage('FA Nummer, Projekt und Art. Nr. sind Pflichtfelder, bevor die Anfrage an die Planung geht.')
      return
    }

    addRequest({
      anlageId: selectedRobot.id,
      articleNo: extraDraft.articleNo.trim(),
      comment: extraDraft.comment.trim(),
      faNumber: extraDraft.faNumber.trim(),
      fixture: extraDraft.fixture.trim() || 'Noch offen',
      matchedJobId: plannedMatch?.job.id,
      operator: currentUser.name,
      plannedDate: plannedMatch?.shift.date,
      plannedShift: plannedMatch?.shift.shift,
      plannedShiftName: plannedMatch?.shift.shiftName,
      project: extraDraft.project.trim(),
      qty: Number(extraDraft.qty) || 1,
      requestType: extraDraft.requestType,
      reason: extraDraft.reason,
      shift: activeShift.shift,
      step: extraDraft.step.trim() || 'Noch offen',
    })
    setExtraDraft(emptyExtraRequest)
    setSavedMessage(`${getRequestTypeLabel(extraDraft.requestType)} erstellt. Freigabe durch die Planung erforderlich.`)
  }

  return (
    <main className={pageShellClassName}>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <Link to="/robots" className="mb-2 inline-flex items-center gap-2 text-sm font-black text-blue-700">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Anlagen-Auswahl
            </Link>
            <h1 className="text-2xl font-black tracking-normal text-slate-950">
              Bediener-Board: {selectedRobot.name}
            </h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {selectedRobot.assetId} / {activeShift.shiftName} / {activeShift.time} / {currentUser.name}
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
                  <option value="F">F / Frueh</option>
                  <option value="S">S / Spaet</option>
                  <option value="N">N / Nacht</option>
                </select>
              </label>
            )}
            <Link className={secondaryButtonClassName} to={`/robots/${selectedRobot.id}/day`}>
              Tagesplan Live
            </Link>
            <button
              className={secondaryButtonClassName}
              type="button"
              onClick={() => setShowEndShiftSummary((current) => !current)}
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Schicht beenden
            </button>
            <button
              className={primaryButtonClassName}
              type="button"
              onClick={() => setSavedMessage('Demo gespeichert. Aktive Liste, erledigte Positionen, SU und Anfragen sind fuer die Uebergabe bereit.')}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Schicht speichern
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={<Factory className="h-5 w-5" />} label="Anlage" value={selectedRobot.name} />
          <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Fertig" value={`${doneCount}/${activeShift.jobs.length}`} />
          <Metric icon={<Clock3 className="h-5 w-5" />} label="Rest Roboter" value={`${remainingRobotMinutes}m`} />
          <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Rest Schlosser" value={`${remainingSchlosserMinutes}m`} />
        </div>

        {savedMessage && (
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            {savedMessage}
          </div>
        )}

        {showEndShiftSummary && (
          <EndShiftSummary
            currentShift={activeShift.shiftName}
            existingDelayCount={existingDelays.length}
            extraRequests={extraRequests}
            handoverConfirmed={handoverConfirmed}
            jobEntries={jobEntries}
            jobs={activeShift.jobs}
            nextShiftLabel={nextShiftLabel}
            shiftComment={shiftComment}
            onConfirm={() => {
              setHandoverConfirmed(true)
              setSavedMessage(`Schicht abgeschlossen. Uebergabe fuer ${nextShiftLabel} vorbereitet.`)
            }}
          />
        )}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-5">
            <div className={`${cardClassName} p-5`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">
                    Aktuelle Schichtliste
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    Positionen bearbeiten
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Positionen mit Fertig, Nicht fertig oder SU wandern in die erledigte Liste, damit die offene Liste kurz bleibt.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                  <button
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-black ${
                      boardView === 'cards' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
                    }`}
                    type="button"
                    onClick={() => setBoardView('cards')}
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                    Karten
                  </button>
                  <button
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-black ${
                      boardView === 'table' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
                    }`}
                    type="button"
                    onClick={() => setBoardView('table')}
                  >
                    <Table2 className="h-4 w-4" aria-hidden="true" />
                    Tabelle
                  </button>
                </div>
              </div>
            </div>

            {boardView === 'cards' ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {activeJobs.map((job) => (
                  <BauteilCard
                    entry={jobEntries[job.id]}
                    job={job}
                    key={job.id}
                    onProgress={setProgress}
                    onUpdate={updateEntry}
                  />
                ))}
                {activeJobs.length === 0 && (
                  <div className={`${cardClassName} p-6 lg:col-span-2`}>
                    <p className="text-sm font-black text-emerald-700">Offene Liste ist fuer diese Schicht leer.</p>
                  </div>
                )}
              </div>
            ) : (
              <EditableJobTable jobs={activeShift.jobs} jobEntries={jobEntries} onProgress={setProgress} onUpdate={updateEntry} />
            )}

            <HandledJobs jobs={handledJobs} jobEntries={jobEntries} />
          </section>

          <aside className="min-w-0 space-y-5">
            <section className={`${cardClassName} min-w-0 p-5`}>
              <div className="flex items-center gap-2">
                <ListPlus className="h-5 w-5 text-blue-700" aria-hidden="true" />
                <h2 className="text-lg font-black text-slate-950">Ungeplante Position melden</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Nutzen, wenn Material fehlt und eine andere Position gefertigt wird, oder wenn ein bereits geheftetes Teil mit derselben FA Nummer nachgearbeitet werden muss.
              </p>

              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="FA Nummer" value={extraDraft.faNumber} onChange={(value) => setExtraDraft((current) => ({ ...current, faNumber: value }))} />
                  <TextField label="Menge" type="number" value={extraDraft.qty} onChange={(value) => setExtraDraft((current) => ({ ...current, qty: value }))} />
                </div>
                {plannedMatch && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-900">
                    <p className="font-black">FA Nummer ist schon im Plan.</p>
                    <p className="mt-1">
                      Geplant: {plannedMatch.shift.shiftName} / {plannedMatch.shift.date} / {plannedMatch.job.project} / Art. {plannedMatch.job.articleNo} / {plannedMatch.job.step}
                    </p>
                  </div>
                )}
                {!plannedMatch && extraDraft.faNumber.trim() && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                    Keine geplante Position mit dieser FA Nummer gefunden. Diese Anfrage bleibt ungeplant oder Nacharbeit.
                  </div>
                )}
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Anfrageart
                  <select
                    className={inputClassName}
                    value={extraDraft.requestType}
                    onChange={(event) => setExtraDraft((current) => ({ ...current, requestType: event.target.value as PlanningRequestType }))}
                  >
                    <option value="unplanned">Ungeplant / Ersatzteil</option>
                    <option value="pull_forward">Vorziehen aus anderer Schicht</option>
                    <option value="repair">Nacharbeit / Reparatur</option>
                  </select>
                </label>
                {suggestedRequestType !== extraDraft.requestType && (
                  <button
                    className="h-10 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-200"
                    type="button"
                    onClick={() => setExtraDraft((current) => ({ ...current, requestType: suggestedRequestType }))}
                  >
                    Vorschlag uebernehmen: {getRequestTypeLabel(suggestedRequestType)}
                  </button>
                )}
                <TextField label="Projekt" value={extraDraft.project} onChange={(value) => setExtraDraft((current) => ({ ...current, project: value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Art. Nr." value={extraDraft.articleNo} onChange={(value) => setExtraDraft((current) => ({ ...current, articleNo: value }))} />
                  <TextField label="Schritt" value={extraDraft.step} onChange={(value) => setExtraDraft((current) => ({ ...current, step: value }))} />
                </div>
                <TextField label="Vorrichtung" value={extraDraft.fixture} onChange={(value) => setExtraDraft((current) => ({ ...current, fixture: value }))} />
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Grund
                  <select
                    className={inputClassName}
                    value={extraDraft.reason}
                    onChange={(event) => setExtraDraft((current) => ({ ...current, reason: event.target.value }))}
                  >
                    {delayReasons.map((reason) => (
                      <option value={reason} key={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField
                  label="Kommentar"
                  placeholder="z.B. Naht 10 bis 14 reparieren, oder warum die Position dazu kam"
                  value={extraDraft.comment}
                  onChange={(value) => setExtraDraft((current) => ({ ...current, comment: value }))}
                />
                <button className={`${secondaryButtonClassName} w-full px-3 text-xs sm:text-sm`} type="button" onClick={addExtraRequest}>
                  <span className="truncate">Zur Freigabe senden</span>
                </button>
              </div>

              {extraRequests.length > 0 && (
                <div className="mt-5 space-y-3">
                  {extraRequests.map((request) => (
                    <article className={`rounded-xl p-3 text-sm ${getRequestStatusClassName(request.status)}`} key={request.id}>
                      <p className="font-black">
                        {getRequestStatusLabel(request.status)} / {getRequestTypeLabel(request.requestType)} / {request.faNumber}
                      </p>
                      <p className="mt-1">
                        {request.project || 'Kein Projekt'} / Art. {request.articleNo} / Menge {request.qty}
                      </p>
                      {request.requestType === 'pull_forward' && request.plannedShiftName && (
                        <p className="mt-1 font-bold">
                          Vorgezogen aus {request.plannedShiftName} / {request.plannedDate}
                        </p>
                      )}
                      {request.supervisorNote && (
                        <p className="mt-1 font-bold">
                          Planung: {request.supervisorNote}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <ShiftDelayPanel
              delayMinutes={delayMinutes}
              delayReason={delayReason}
              existingDelays={existingDelays}
              shiftComment={shiftComment}
              onDelayMinutesChange={setDelayMinutes}
              onDelayReasonChange={setDelayReason}
              onShiftCommentChange={setShiftComment}
              onAddDelay={() => setSavedMessage(`${delayMinutes} min Stoerung hinzugefuegt: ${delayReason}`)}
            />
          </aside>
        </div>
      </section>
    </main>
  )
}

function getRequestStatusLabel(status: 'approved' | 'pending' | 'rejected') {
  if (status === 'approved') {
    return 'Freigegeben'
  }

  if (status === 'rejected') {
    return 'Abgelehnt'
  }

  return 'Wartet auf Freigabe'
}

function getRequestTypeLabel(requestType: PlanningRequestType) {
  if (requestType === 'pull_forward') {
    return 'Vorziehen'
  }

  if (requestType === 'repair') {
    return 'Nacharbeit'
  }

  return 'Ungeplant'
}

function getSuggestedRequestType(reason: string, plannedShift?: ShiftCode): PlanningRequestType {
  const repairReason = reason.toLowerCase().includes('repar') || reason.toLowerCase().includes('nacharbeit')

  if (repairReason) {
    return 'repair'
  }

  if (plannedShift) {
    return 'pull_forward'
  }

  return 'unplanned'
}

function findPlannedMatch(
  draft: Omit<ExtraBauteilRequest, 'id'>,
  robotId: string,
  activeShiftId: string,
) {
  const faNumber = draft.faNumber.trim().toLowerCase()

  if (!faNumber) {
    return null
  }

  const matches = todayPlan
    .filter((shift) => shift.robotId === robotId && shift.id !== activeShiftId)
    .flatMap((shift) => shift.jobs.map((job) => ({ job, shift })))
    .filter(({ job }) => job.faNumber.toLowerCase() === faNumber)

  if (matches.length === 0) {
    return null
  }

  const articleNo = draft.articleNo.trim().toLowerCase()
  const project = draft.project.trim().toLowerCase()
  const step = draft.step.trim().toLowerCase()

  return matches.find(({ job }) => {
    const articleMatches = !articleNo || job.articleNo.toLowerCase() === articleNo
    const projectMatches = !project || job.project.toLowerCase() === project
    const stepMatches = !step || job.step.toLowerCase() === step

    return articleMatches && projectMatches && stepMatches
  }) ?? matches[0]
}

function getRequestStatusClassName(status: 'approved' | 'pending' | 'rejected') {
  if (status === 'approved') {
    return 'bg-emerald-50 text-emerald-800'
  }

  if (status === 'rejected') {
    return 'bg-rose-50 text-rose-800'
  }

  return 'bg-amber-50 text-amber-900'
}

function NoShiftPlan({
  canSelectShift,
  selectedRobot,
  selectedShiftCode,
  setSelectedShiftCode,
  shift,
  userName,
}: {
  canSelectShift: boolean
  selectedRobot: { assetId: string; id: string; name: string }
  selectedShiftCode: ShiftCode
  setSelectedShiftCode: (shift: ShiftCode) => void
  shift: string
  userName: string
}) {
  return (
    <main className={pageShellClassName}>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <Link to="/robots" className="mb-2 inline-flex items-center gap-2 text-sm font-black text-blue-700">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Anlagen-Auswahl
            </Link>
            <h1 className="text-2xl font-black tracking-normal text-slate-950">
              Bediener-Board: {selectedRobot.name}
            </h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {selectedRobot.assetId} / Schicht {shift} / {userName}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canSelectShift && (
              <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
                Schicht
                <select
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black normal-case tracking-normal text-slate-950 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                  value={selectedShiftCode}
                  onChange={(event) => setSelectedShiftCode(event.target.value as ShiftCode)}
                >
                  <option value="F">F / Frueh</option>
                  <option value="S">S / Spaet</option>
                  <option value="N">N / Nacht</option>
                </select>
              </label>
            )}
            <Link className={secondaryButtonClassName} to={`/robots/${selectedRobot.id}/day`}>
              Tagesplan Live
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-10 lg:px-6">
        <div className={`${cardClassName} p-6`}>
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-amber-700">Keine Positionen</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Fuer diese Anlage und Schicht ist noch kein Plan hinterlegt.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Der Bediener kann trotzdem jede Anlage auswaehlen. Sobald die Planung Positionen fuer diese Schicht freigibt, erscheinen sie hier im Bediener-Board.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link className={primaryButtonClassName} to="/robots">
                  Andere Anlage waehlen
                </Link>
                <Link className={secondaryButtonClassName} to={`/robots/${selectedRobot.id}/day`}>
                  Live-Ansicht oeffnen
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function BauteilCard({
  entry,
  job,
  onProgress,
  onUpdate,
}: {
  entry: JobEntry
  job: ProductionJob
  onProgress: (job: ProductionJob, progress: JobProgressState) => void
  onUpdate: (jobId: string, nextEntry: Partial<JobEntry>) => void
}) {
  const remainingQty = Math.max(job.plannedQty - entry.doneQty, 0)
  const needsReason = entry.progress === 'not_done' || entry.progress === 'partial' || entry.progress === 'su'
  const remainingSchlosserMinutes = getRemainingSchlosserMinutes(job, entry)

  return (
    <article className={`${cardClassName} overflow-hidden`}>
      <div className="border-l-4 border-blue-700 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {job.priority === 'carryover' && (
            <span className="rounded-xl bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
              Rest {job.carriedFrom}
            </span>
          )}
          <span className="rounded-xl bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{job.faNumber}</span>
          <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
            {job.step} / {job.fixture}
          </span>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">{job.project}</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{job.project} / Art. {job.articleNo}</h3>
            <p className="mt-1 font-mono text-xs font-bold text-slate-500">Art. {job.articleNo}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
            <p className="text-xs font-black text-slate-500">Rest</p>
            <p className="text-xl font-black text-slate-950">{remainingQty}</p>
          </div>
        </div>

        {job.welderNote && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
            Heften: {job.welderNote}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-[120px_minmax(190px,0.7fr)_1fr]">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Ist
            <input
              className={inputClassName}
              min={0}
              max={job.plannedQty}
              type="number"
              value={entry.doneQty}
              onChange={(event) => {
                const nextQty = Number(event.target.value)
                onUpdate(job.id, {
                  doneQty: nextQty,
                  progress: 'partial',
                })
              }}
            />
          </label>
          <label className="flex h-11 items-center gap-3 self-end rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700">
            <input
              checked={entry.weldedReady}
              className="h-5 w-5 shrink-0 accent-blue-700"
              type="checkbox"
              onChange={(event) => onUpdate(job.id, { weldedReady: event.target.checked })}
            />
            <span className="truncate">Schon geheftet</span>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Kommentar
            <input
              className={inputClassName}
              value={entry.comment}
              onChange={(event) => onUpdate(job.id, { comment: event.target.value })}
              placeholder="z.B. nicht geheftet, wartet auf Schlosser"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600 sm:grid-cols-3">
          <p>Roboter Rest: {getRemainingRobotMinutes(job, entry)}m</p>
          <p>Schlosser Rest: {remainingSchlosserMinutes}m</p>
          <p>Vorrichtung: {job.fixture}</p>
        </div>

        {needsReason && (
          <label className="mt-3 grid gap-2 text-sm font-bold text-slate-700">
            Grund
            <select
              className={inputClassName}
              value={entry.reason}
              onChange={(event) => onUpdate(job.id, { reason: event.target.value })}
            >
              <option value="">Grund auswaehlen</option>
              {delayReasons.map((reason) => (
                <option value={reason} key={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {progressOptions.map((option) => (
            <button
                    className={`min-h-11 rounded-xl px-2 py-2 text-xs font-black leading-tight transition sm:text-sm ${
                entry.progress === option.value
                  ? 'bg-blue-700 text-white shadow-md shadow-blue-700/15'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              key={option.value}
              type="button"
              onClick={() => onProgress(job, option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}

function EndShiftSummary({
  currentShift,
  existingDelayCount,
  extraRequests,
  handoverConfirmed,
  jobEntries,
  jobs,
  nextShiftLabel,
  onConfirm,
  shiftComment,
}: {
  currentShift: string
  existingDelayCount: number
  extraRequests: { id: string }[]
  handoverConfirmed: boolean
  jobEntries: Record<string, JobEntry>
  jobs: ProductionJob[]
  nextShiftLabel: string
  onConfirm: () => void
  shiftComment: string
}) {
  const doneJobs = jobs.filter((job) => jobEntries[job.id].progress === 'done')
  const suJobs = jobs.filter((job) => jobEntries[job.id].progress === 'su')
  const unfinishedJobs = jobs.filter((job) => {
    const entry = jobEntries[job.id]

    return entry.touched && (entry.progress === 'partial' || entry.progress === 'not_done')
  })
  const unmarkedJobs = jobs.filter((job) => {
    const entry = jobEntries[job.id]

    return !entry.touched && entry.progress !== 'done'
  })

  return (
    <section className={`${cardClassName} mt-5 overflow-hidden border-blue-100`}>
      <div className="border-b border-blue-100 bg-blue-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">
              Schichtuebergabe
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {currentShift} abschliessen und {nextShiftLabel} vorbereiten
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              SU kommt zuerst, weil die Position meistens schon in der Anlage liegt. Angefangene und unmarkierte Positionen werden Prioritaet fuer die naechste Schicht.
            </p>
          </div>
          <button
            className={handoverConfirmed ? secondaryButtonClassName : primaryButtonClassName}
            disabled={handoverConfirmed}
            type="button"
            onClick={onConfirm}
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            {handoverConfirmed ? 'Uebergabe bestaetigt' : 'Uebergabe bestaetigen'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-4">
        <SummaryCount label="Fertig" value={doneJobs.length} tone="emerald" />
        <SummaryCount label="SU zuerst" value={suJobs.length} tone="blue" />
        <SummaryCount label="Angefangen Prioritaet" value={unfinishedJobs.length} tone="amber" />
        <SummaryCount label="Unmarkiert Prioritaet" value={unmarkedJobs.length} tone="rose" />
      </div>

      <div className="grid gap-5 px-5 pb-5 xl:grid-cols-3">
        <HandoverColumn
          emptyText="Keine SU-Positionen."
          jobs={suJobs}
          jobEntries={jobEntries}
          title="1. In Anlage fortsetzen"
          tone="blue"
        />
        <HandoverColumn
          emptyText="Keine angefangenen offenen Positionen."
          jobs={unfinishedJobs}
          jobEntries={jobEntries}
          title="2. Offen aus der Schicht"
          tone="amber"
        />
        <HandoverColumn
          emptyText="Keine unmarkierten Positionen."
          jobs={unmarkedJobs}
          jobEntries={jobEntries}
          title="3. Unmarkiert wird Prioritaet"
          tone="rose"
        />
      </div>

      <div className="grid gap-4 border-t border-slate-100 p-5 lg:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-950">Stoerungsnotizen</p>
          <p className="mt-1 text-sm text-slate-600">
            {existingDelayCount + (shiftComment ? 1 : 0)} Notiz(en) an dieser Uebergabe.
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-950">Freigabe Planung</p>
          <p className="mt-1 text-sm text-slate-600">
            {extraRequests.length} ungeplante Anfrage(n) warten auf Freigabe.
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-950">Automatische Sicherung</p>
          <p className="mt-1 text-sm text-slate-600">
            Wenn nicht bis Schichtende bestaetigt, kann dieselbe Uebergabe als unbestaetigter Entwurf erstellt werden.
          </p>
        </div>
      </div>
    </section>
  )
}

function SummaryCount({
  label,
  tone,
  value,
}: {
  label: string
  tone: 'amber' | 'blue' | 'emerald' | 'rose'
  value: number
}) {
  const toneClasses = {
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  }

  return (
    <div className={`rounded-xl p-4 ${toneClasses[tone]}`}>
      <p className="text-sm font-black">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  )
}

function HandoverColumn({
  emptyText,
  jobEntries,
  jobs,
  title,
  tone,
}: {
  emptyText: string
  jobEntries: Record<string, JobEntry>
  jobs: ProductionJob[]
  title: string
  tone: 'amber' | 'blue' | 'rose'
}) {
  const toneClasses = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
  }

  return (
    <section className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <h3 className="text-sm font-black">{title}</h3>
      <div className="mt-3 space-y-3">
        {jobs.length === 0 ? (
          <p className="text-sm opacity-75">{emptyText}</p>
        ) : (
          jobs.map((job) => {
            const entry = jobEntries[job.id]
            const restQty = Math.max(job.plannedQty - entry.doneQty, 0)

            return (
              <article className="rounded-lg bg-white/75 p-3 text-sm" key={job.id}>
                <p className="font-black">{job.faNumber} / {job.project} / Art. {job.articleNo}</p>
                <p className="mt-1 opacity-80">
                  Rest {restQty} / {job.project} / {job.step} / {job.fixture}
                </p>
                {(entry.reason || entry.comment) && (
                  <p className="mt-2 font-bold opacity-90">
                    {entry.reason || entry.comment}
                  </p>
                )}
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

function EditableJobTable({
  jobs,
  jobEntries,
  onProgress,
  onUpdate,
}: {
  jobs: ProductionJob[]
  jobEntries: Record<string, JobEntry>
  onProgress: (job: ProductionJob, progress: JobProgressState) => void
  onUpdate: (jobId: string, nextEntry: Partial<JobEntry>) => void
}) {
  return (
    <section className={`${cardClassName} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-3">FA</th>
              <th className="px-3 py-3">Projekt</th>
              <th className="px-3 py-3">Art.</th>
              <th className="px-3 py-3">Schritt</th>
              <th className="px-3 py-3">Vorrichtung</th>
              <th className="px-3 py-3">Plan</th>
              <th className="px-3 py-3">Ist</th>
              <th className="px-3 py-3">Geheftet</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Grund/Kommentar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => {
              const entry = jobEntries[job.id]

              return (
                <tr className={isHandled(entry) ? 'bg-slate-50 text-slate-500' : 'bg-white'} key={job.id}>
                  <td className="px-3 py-3 font-mono text-xs font-bold">{job.faNumber}</td>
                  <td className="px-3 py-3 font-bold">{job.project}</td>
                  <td className="px-3 py-3">{job.articleNo}</td>
                  <td className="px-3 py-3">{job.step}</td>
                  <td className="px-3 py-3">{job.fixture}</td>
                  <td className="px-3 py-3">{job.plannedQty}</td>
                  <td className="px-3 py-3">
                    <input
                      className={`${inputClassName} w-20`}
                      min={0}
                      max={job.plannedQty}
                      type="number"
                      value={entry.doneQty}
                      onChange={(event) => onUpdate(job.id, { doneQty: Number(event.target.value) })}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <label className="inline-flex items-center gap-2 font-bold text-slate-700">
                      <input
                        checked={entry.weldedReady}
                        className="h-5 w-5 accent-blue-700"
                        type="checkbox"
                        onChange={(event) => onUpdate(job.id, { weldedReady: event.target.checked })}
                      />
                      Ja
                    </label>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      className={`${inputClassName} min-w-36`}
                      value={entry.progress}
                      onChange={(event) => onProgress(job, event.target.value as JobProgressState)}
                    >
                      {progressOptions.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      className={`${inputClassName} min-w-72`}
                      value={entry.comment || entry.reason}
                      onChange={(event) => onUpdate(job.id, { comment: event.target.value })}
                      placeholder="Grund oder Kommentar"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HandledJobs({ jobs, jobEntries }: { jobs: ProductionJob[]; jobEntries: Record<string, JobEntry> }) {
  return (
    <section className={`${cardClassName} p-5`}>
      <h2 className="text-lg font-black text-slate-950">Erledigt in dieser Schicht</h2>
      <div className="mt-4 grid gap-3">
        {jobs.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Noch nichts erledigt.</p>
        ) : (
          jobs.map((job) => {
            const entry = jobEntries[job.id]

            return (
              <article className="flex flex-col gap-2 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between" key={job.id}>
                <div>
                  <p className="font-black text-slate-950">{job.faNumber} / {job.project} / Art. {job.articleNo}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {job.project} / {job.step} / {job.fixture}
                  </p>
                </div>
                <span className="w-fit rounded-xl bg-white px-3 py-1 text-xs font-black uppercase text-slate-600 ring-1 ring-slate-200">
                  {getProgressLabel(entry.progress)} / Ist {entry.doneQty}
                </span>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

function ShiftDelayPanel({
  delayMinutes,
  delayReason,
  existingDelays,
  shiftComment,
  onAddDelay,
  onDelayMinutesChange,
  onDelayReasonChange,
  onShiftCommentChange,
}: {
  delayMinutes: string
  delayReason: string
  existingDelays: { id: string; minutes: number; reason: string; comment: string }[]
  shiftComment: string
  onAddDelay: () => void
  onDelayMinutesChange: (value: string) => void
  onDelayReasonChange: (value: string) => void
  onShiftCommentChange: (value: string) => void
}) {
  return (
    <section className={`${cardClassName} p-5`}>
      <div className="flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-blue-700" aria-hidden="true" />
        <h2 className="text-lg font-black text-slate-950">Allgemeine Schichtstoerung</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Nutzen, wenn die ganze Schicht verzoegert ist, z.B. Programminstallation, Roboter-Crash oder Unterbrechung.
      </p>

      <div className="mt-4 grid gap-3">
        <TextField label="Stoerung Minuten" type="number" value={delayMinutes} onChange={onDelayMinutesChange} />
        <label className="grid gap-2 text-sm font-bold text-slate-700">
          Grund
          <select className={inputClassName} value={delayReason} onChange={(event) => onDelayReasonChange(event.target.value)}>
            {delayReasons.map((reason) => (
              <option value={reason} key={reason}>
                {reason}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold text-slate-700">
          Schichtkommentar
          <textarea
            className="min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
            value={shiftComment}
            onChange={(event) => onShiftCommentChange(event.target.value)}
            placeholder="z.B. Anlage 45 Minuten gestoppt wegen Roboter Crash..."
          />
        </label>
        <button className={`${secondaryButtonClassName} w-full px-3 text-xs sm:text-sm`} type="button" onClick={onAddDelay}>
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          <span className="truncate">Stoerungsnotiz hinzufuegen</span>
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {existingDelays.map((delay) => (
          <article className="rounded-xl bg-amber-50 p-3 text-sm" key={delay.id}>
            <p className="font-black text-amber-900">
              {delay.minutes} min / {delay.reason}
            </p>
            <p className="mt-1 leading-6 text-amber-800">{delay.comment}</p>
          </article>
        ))}
        {shiftComment && (
          <article className="rounded-xl bg-blue-50 p-3 text-sm">
            <p className="font-black text-blue-900">
              Entwurf / {delayMinutes} min / {delayReason}
            </p>
            <p className="mt-1 leading-6 text-blue-800">{shiftComment}</p>
          </article>
        )}
      </div>
    </section>
  )
}

function TextField({
  label,
  onChange,
  placeholder,
  type = 'text',
  value,
}: {
  label: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  value: string
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
      {label}
      <input
        className={`${inputClassName} w-full min-w-0`}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function getInitialProgress(job: ProductionJob): JobProgressState {
  if (job.doneQty >= job.plannedQty) {
    return 'done'
  }

  if (job.doneQty > 0) {
    return 'partial'
  }

  return 'partial'
}

function isHandled(entry: JobEntry) {
  return entry.progress === 'done' || entry.progress === 'not_done' || entry.progress === 'su'
}

function getRemainingRobotMinutes(job: ProductionJob, entry: JobEntry) {
  const remainingQty = Math.max(job.plannedQty - entry.doneQty, 0)
  return job.anlageMin * remainingQty + (remainingQty > 0 ? job.ruestzeitMin : 0)
}

function getRemainingSchlosserMinutes(job: ProductionJob, entry: JobEntry) {
  if (entry.weldedReady) {
    return 0
  }

  const remainingQty = Math.max(job.plannedQty - entry.doneQty, 0)
  return job.schlosserMin * remainingQty
}

function getProgressLabel(progress: JobProgressState) {
  return progressOptions.find((option) => option.value === progress)?.label ?? progress
}

function getNextShiftLabel(shift: string) {
  if (shift === 'F') {
    return 'Spaetschicht'
  }

  if (shift === 'S') {
    return 'Nachtschicht'
  }

  return 'Fruehschicht'
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
