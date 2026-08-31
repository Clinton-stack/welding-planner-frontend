import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Eye,
  Factory,
  LogOut,
  Pencil,
  Send,
  Table2,
  Timer,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  robots,
  delayReasons,
  shiftDelays,
  todayPlan,
  type ProductionJob,
  type Robot,
  type ShiftCode,
} from '../data/demoData'
import type { PlanningRequest } from '../requests/requestContext'
import { usePlanningRequests } from '../requests/usePlanningRequests'
import { cardClassName, inputClassName, pageShellClassName } from '../styles/ui'
import { useCurrentUser } from '../users/useCurrentUser'

export function SupervisorHomePage() {
  const { currentUser } = useCurrentUser()
  const { pendingCount } = usePlanningRequests()
  const allJobs = todayPlan.flatMap((shift) => shift.jobs)
  const totalSoll = allJobs.reduce((sum, job) => sum + job.plannedQty, 0)
  const totalIst = allJobs.reduce((sum, job) => sum + job.doneQty, 0)
  const carryovers = allJobs.filter((job) => job.priority === 'carryover').length
  const delayMinutes = shiftDelays.reduce((sum, delay) => sum + delay.minutes, 0)
  const handoverPriorities = getHandoverPriorities()

  return (
    <main className={`${pageShellClassName} bg-[linear-gradient(135deg,#eef5ff_0%,#f7f9fc_42%,#edf2f7_100%)]`}>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-300">
              <Factory className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
                Clinton Enterprise
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-normal text-slate-950">Schichtleiter-Zentrale</h1>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {currentUser.name} / {currentUser.role} / Tagesuebersicht
              </p>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Abmelden
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-300/80">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="p-5 text-white lg:p-7">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Werk Leitstand</p>
              <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-normal md:text-4xl">
                Produktion, Uebergabe und Personal auf einen Blick.
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-300">
                Live-Status der Anlagen, automatische SU/Rest-Prioritaeten, offene Freigaben und direkter Zugriff auf Wochen- und Personalplanung.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500" to="/planner/weekly">
                  <Table2 className="h-4 w-4" aria-hidden="true" />
                  Wochenplanung
                </Link>
                <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/15" to="/planner/staff">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Personalplanung
                </Link>
                <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/15" to="/analytics">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  Auswertung
                </Link>
                <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/15" to="/robots/ap2904/day">
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Live-Ansicht
                </Link>
              </div>
            </div>

            <div className="relative min-h-64 border-t border-white/10 bg-slate-900 lg:border-l lg:border-t-0">
              <img src="/robot-images/robot-card-1.jpg" alt="" className="h-full min-h-64 w-full object-cover opacity-70 mix-blend-screen" />
              <div className="absolute inset-0 bg-slate-950/35" />
              <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/10 bg-slate-950/75 p-4 text-white shadow-xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-300">Aktiver Fokus</p>
                <p className="mt-2 text-lg font-black">Pesa / AP2904</p>
                <p className="mt-1 text-sm font-bold text-slate-300">SU und Restpositionen zuerst sichtbar</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <Metric icon={<ClipboardList className="h-5 w-5" />} label="Soll" subtext="geplante Positionen" tone="blue" value={totalSoll.toString()} />
          <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Ist" subtext={`${Math.round((totalIst / totalSoll) * 100)}% erreicht`} tone="emerald" value={totalIst.toString()} />
          <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Reste" subtext="automatisch priorisiert" tone="amber" value={carryovers.toString()} />
          <Metric icon={<Timer className="h-5 w-5" />} label="Anfragen" subtext={`${delayMinutes} min Stoerung heute`} tone="rose" value={pendingCount.toString()} />
        </div>

        <section className="mt-5 grid gap-3 lg:grid-cols-4">
          <QuickLink icon={<Table2 className="h-5 w-5" />} label="Wochenplanung" text="Bauteile und Auslastung" to="/planner/weekly" tone="blue" />
          <QuickLink icon={<Users className="h-5 w-5" />} label="Personalplanung" text="Bediener und Schweisser" to="/planner/staff" tone="slate" />
          <QuickLink icon={<BarChart3 className="h-5 w-5" />} label="Auswertung" text="Soll/Ist pro Anlage" to="/analytics" tone="emerald" />
          <QuickLink icon={<Eye className="h-5 w-5" />} label="Live-Ansicht" text="QR und Druckplan" to="/robots/ap2904/day" tone="amber" />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className={`${cardClassName} overflow-hidden`}>
            <div className="border-b border-slate-100 bg-white p-5">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Anlagenstatus</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Heute pro Anlage</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-950 text-xs uppercase tracking-[0.12em] text-slate-200">
                  <tr>
                    <th className="px-4 py-3">Anlage</th>
                    <th className="px-4 py-3 text-right">Soll</th>
                    <th className="px-4 py-3 text-right">Ist</th>
                    <th className="px-4 py-3 text-right">Offen</th>
                    <th className="px-4 py-3 text-right">Rest</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {robots.map((robot) => (
                    <RobotStatusRow robot={robot} key={robot.id} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-5">
            <HandoverPreview priorities={handoverPriorities} />

            <PlanningRequestsPanel supervisorName={currentUser.name} />
          </aside>
        </div>
      </section>
    </main>
  )
}

type HandoverPriority = {
  id: string
  badge: string
  badgeClassName: string
  job: ProductionJob
  note: string
  robot: Robot
  targetShift: string
  title: string
}

function HandoverPreview({ priorities }: { priorities: HandoverPriority[] }) {
  return (
    <section className={`${cardClassName} overflow-hidden border-blue-100`}>
      <div className="border-b border-blue-100 bg-blue-50 p-5">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-blue-700" aria-hidden="true" />
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Automatische Uebergabe</p>
        </div>
        <h2 className="mt-1 text-xl font-black text-slate-950">Naechste Schicht Prioritaeten</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Vorschau der Positionen, die automatisch als SU oder Rest fuer die naechste Schicht oben landen.
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {priorities.map((item) => (
          <article className="p-5" key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-black ${item.badgeClassName}`}>
                  {item.badge}
                </span>
                <p className="mt-3 text-sm font-black text-slate-950">
                  {item.job.faNumber} / {item.job.project} / Art. {item.job.articleNo}
                </p>
                <p className="mt-1 text-xs font-bold text-blue-700">
                  {item.robot.name} / Ziel: {item.targetShift}
                </p>
              </div>
              <Link className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700" to={`/robots/${item.robot.id}/day`}>
                Live
              </Link>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-700">{item.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.note}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function PlanningRequestsPanel({ supervisorName }: { supervisorName: string }) {
  const { approveRequest, rejectRequest, requests, updateRequest } = usePlanningRequests()
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)
  const [supervisorNote, setSupervisorNote] = useState('')
  const pendingRequests = requests.filter((request) => request.status === 'pending')
  const reviewedRequests = requests.filter((request) => request.status !== 'pending').slice(0, 4)

  return (
    <section className={`${cardClassName} overflow-hidden`}>
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Anfragen</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Ungeplante Positionen</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Bediener melden Ersatzteile, Reparaturen oder Materialwechsel. Planung entscheidet, ob es in den Plan kommt.
            </p>
          </div>
          <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
            {pendingRequests.length} offen
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {pendingRequests.length === 0 && (
          <div className="p-5 text-sm font-bold text-emerald-700">
            Keine offenen Anfragen.
          </div>
        )}

        {pendingRequests.map((request) => (
          <PlanningRequestCard
            editing={editingRequestId === request.id}
            key={request.id}
            request={request}
            supervisorNote={supervisorNote}
            onApprove={() => {
              approveRequest(request.id, supervisorName, supervisorNote)
              setSupervisorNote('')
              setEditingRequestId(null)
            }}
            onEdit={() => {
              setSupervisorNote(request.supervisorNote ?? '')
              setEditingRequestId((current) => (current === request.id ? null : request.id))
            }}
            onReject={() => {
              rejectRequest(request.id, supervisorName, supervisorNote || 'Nicht fuer diese Schicht freigegeben.')
              setSupervisorNote('')
              setEditingRequestId(null)
            }}
            onSupervisorNoteChange={setSupervisorNote}
            onUpdate={(nextRequest) => updateRequest(request.id, nextRequest)}
          />
        ))}
      </div>

      {reviewedRequests.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Zuletzt bearbeitet</p>
          <div className="mt-3 space-y-2">
            {reviewedRequests.map((request) => {
              const robot = robots.find((item) => item.id === request.anlageId)

              return (
                <article className="rounded-xl bg-white p-3 text-sm shadow-sm" key={request.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-950">
                        {request.faNumber} / {request.project} / Art. {request.articleNo}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {robot?.name} / {getRequestTypeLabel(request.requestType)} / Schicht {request.shift} / {request.reviewedBy}
                      </p>
                    </div>
                    <span className={`rounded-xl px-2.5 py-1 text-xs font-black ${getStatusBadgeClassName(request.status)}`}>
                      {getStatusLabel(request.status)}
                    </span>
                  </div>
                  {request.supervisorNote && (
                    <p className="mt-2 text-xs font-bold text-slate-600">
                      Notiz: {request.supervisorNote}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function PlanningRequestCard({
  editing,
  onApprove,
  onEdit,
  onReject,
  onSupervisorNoteChange,
  onUpdate,
  request,
  supervisorNote,
}: {
  editing: boolean
  onApprove: () => void
  onEdit: () => void
  onReject: () => void
  onSupervisorNoteChange: (note: string) => void
  onUpdate: (request: Partial<PlanningRequest>) => void
  request: PlanningRequest
  supervisorNote: string
}) {
  const robot = robots.find((item) => item.id === request.anlageId)

  return (
    <article className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">
            {request.faNumber} / {request.project} / Art. {request.articleNo}
          </p>
          <p className="mt-1 text-xs font-bold text-blue-700">
            {robot?.name} / {robot?.assetId} / {getRequestTypeLabel(request.requestType)} / Schicht {request.shift} / {request.operator}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Gesendet: {request.createdAt}
          </p>
        </div>
        <span className={`rounded-xl px-2.5 py-1 text-xs font-black ${getRequestTypeClassName(request.requestType)}`}>
          {getRequestTypeLabel(request.requestType)}
        </span>
      </div>

      {request.requestType === 'pull_forward' && (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-900">
          Diese Position ist schon im Plan. Urspruenglich geplant: {request.plannedShiftName ?? `Schicht ${request.plannedShift ?? '-'}`} / {request.plannedDate ?? 'Datum offen'}.
        </div>
      )}

      {request.requestType === 'repair' && (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          Nacharbeit oder Reparatur mit gleicher FA Nummer. Bitte Grund und Kommentar pruefen.
        </div>
      )}

      <p className="mt-3 text-sm leading-6 text-slate-600">
        {request.reason}: {request.comment || 'Keine Zusatzinfo'}
      </p>
      <p className="mt-2 text-xs font-bold text-slate-500">
        Menge {request.qty} / {request.step} / {request.fixture}
      </p>

      {editing && (
        <div className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <RequestField label="Projekt" value={request.project} onChange={(value) => onUpdate({ project: value })} />
            <RequestField label="Art. Nr." value={request.articleNo} onChange={(value) => onUpdate({ articleNo: value })} />
          </div>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Anfrageart
            <select className={inputClassName} value={request.requestType} onChange={(event) => onUpdate({ requestType: event.target.value as PlanningRequest['requestType'] })}>
              <option value="unplanned">Ungeplant / Ersatzteil</option>
              <option value="pull_forward">Vorziehen aus anderer Schicht</option>
              <option value="repair">Nacharbeit / Reparatur</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <RequestField label="FA Nummer" value={request.faNumber} onChange={(value) => onUpdate({ faNumber: value })} />
            <RequestField label="Menge" type="number" value={request.qty.toString()} onChange={(value) => onUpdate({ qty: Number(value) || 1 })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <RequestField label="Schritt" value={request.step} onChange={(value) => onUpdate({ step: value })} />
            <RequestField label="Vorrichtung" value={request.fixture} onChange={(value) => onUpdate({ fixture: value })} />
          </div>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Grund
            <select className={inputClassName} value={request.reason} onChange={(event) => onUpdate({ reason: event.target.value })}>
              {delayReasons.map((reason) => (
                <option value={reason} key={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>
          <RequestField label="Bediener-Kommentar" value={request.comment} onChange={(value) => onUpdate({ comment: value })} />
          <RequestField label="Notiz Planung" value={supervisorNote} onChange={onSupervisorNoteChange} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button className="h-9 rounded-xl bg-emerald-50 px-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100" type="button" onClick={onApprove}>
          Freigeben
        </button>
        <button className="h-9 rounded-xl bg-blue-50 px-2 text-xs font-black text-blue-700 transition hover:bg-blue-100" type="button" onClick={onEdit}>
          {editing ? 'Schliessen' : 'Bearbeiten'}
        </button>
        <button className="h-9 rounded-xl bg-rose-50 px-2 text-xs font-black text-rose-700 transition hover:bg-rose-100" type="button" onClick={onReject}>
          Ablehnen
        </button>
      </div>
    </article>
  )
}

function RequestField({
  label,
  onChange,
  type = 'text',
  value,
}: {
  label: string
  onChange: (value: string) => void
  type?: 'number' | 'text'
  value: string
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <input className={inputClassName} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function getStatusLabel(status: PlanningRequest['status']) {
  if (status === 'approved') {
    return 'Freigegeben'
  }

  if (status === 'rejected') {
    return 'Abgelehnt'
  }

  return 'Offen'
}

function getRequestTypeLabel(requestType: PlanningRequest['requestType']) {
  if (requestType === 'pull_forward') {
    return 'Vorziehen'
  }

  if (requestType === 'repair') {
    return 'Nacharbeit'
  }

  return 'Ungeplant'
}

function getRequestTypeClassName(requestType: PlanningRequest['requestType']) {
  if (requestType === 'pull_forward') {
    return 'bg-blue-50 text-blue-700'
  }

  if (requestType === 'repair') {
    return 'bg-amber-50 text-amber-800'
  }

  return 'bg-slate-100 text-slate-700'
}

function getStatusBadgeClassName(status: PlanningRequest['status']) {
  if (status === 'approved') {
    return 'bg-emerald-50 text-emerald-700'
  }

  if (status === 'rejected') {
    return 'bg-rose-50 text-rose-700'
  }

  return 'bg-amber-50 text-amber-800'
}

function getHandoverPriorities(): HandoverPriority[] {
  return todayPlan
    .flatMap((shift) => {
      const robot = robots.find((item) => item.id === shift.robotId)

      if (!robot) {
        return []
      }

      return shift.jobs
        .filter((job) => job.plannedQty > job.doneQty)
        .map((job) => {
          const rest = job.plannedQty - job.doneQty

          if (job.status === 'running') {
            return {
              id: `su-${shift.id}-${job.id}`,
              badge: 'SU',
              badgeClassName: 'bg-blue-700 text-white',
              job,
              note: `Rest ${rest} Stk. liegt als schichtuebergreifend bereit. Naechster Bediener soll zuerst fortsetzen.`,
              robot,
              targetShift: getNextShiftName(shift.shift),
              title: 'In Arbeit, zuerst weiterfahren',
            }
          }

          if (job.priority === 'carryover') {
            return {
              id: `rest-${shift.id}-${job.id}`,
              badge: `Rest ${job.carriedFrom ?? ''}`.trim(),
              badgeClassName: 'bg-amber-100 text-amber-800',
              job,
              note: `Automatisch aus Schicht ${job.carriedFrom ?? 'vorher'} uebertragen. Rest ${rest} Stk. bleibt oben in der Liste.`,
              robot,
              targetShift: shift.shiftName,
              title: 'Uebertragene Restposition',
            }
          }

          return null
        })
        .filter((item): item is HandoverPriority => Boolean(item))
    })
    .sort((first, second) => {
      if (first.badge === 'SU' && second.badge !== 'SU') {
        return -1
      }

      if (first.badge !== 'SU' && second.badge === 'SU') {
        return 1
      }

      return 0
    })
    .slice(0, 5)
}

function getNextShiftName(shift: ShiftCode) {
  if (shift === 'F') {
    return 'Spaetschicht'
  }

  if (shift === 'S') {
    return 'Nachtschicht'
  }

  return 'Fruehschicht'
}

function RobotStatusRow({ robot }: { robot: Robot }) {
  const robotJobs = todayPlan.filter((shift) => shift.robotId === robot.id).flatMap((shift) => shift.jobs)
  const soll = robotJobs.reduce((sum, job) => sum + job.plannedQty, 0)
  const ist = robotJobs.reduce((sum, job) => sum + job.doneQty, 0)
  const open = robotJobs.filter((job) => job.plannedQty > job.doneQty).length
  const carryovers = robotJobs.filter((job) => job.priority === 'carryover').length
  const percent = soll > 0 ? Math.round((ist / soll) * 100) : 0

  return (
    <tr className="bg-white transition hover:bg-blue-50/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-blue-700">
            <Factory className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="font-black text-slate-950">{robot.name}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{robot.assetId} / {robot.location}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right font-bold">{soll}</td>
      <td className="px-4 py-3 text-right font-bold">{ist}</td>
      <td className="px-4 py-3 text-right font-bold">{open}</td>
      <td className="px-4 py-3 text-right font-bold">{carryovers}</td>
      <td className="px-4 py-3">
        <span className={`rounded-xl px-2.5 py-1 text-xs font-black ${
          percent >= 100 ? 'bg-emerald-50 text-emerald-700' : percent > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'
        }`}>
          {percent || 0}% fertig
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <Link className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-50 px-3 text-xs font-black text-blue-700" to={`/robots/${robot.id}/day`}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            Live
          </Link>
          <Link className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700" to={`/robots/${robot.id}/operator`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Korrigieren
          </Link>
        </div>
      </td>
    </tr>
  )
}

function QuickLink({
  icon,
  label,
  text,
  to,
  tone,
}: {
  icon: React.ReactNode
  label: string
  text: string
  to: string
  tone: 'amber' | 'blue' | 'emerald' | 'slate'
}) {
  const toneClasses = {
    amber: 'border-amber-100 bg-amber-50 text-amber-800 hover:border-amber-200',
    blue: 'border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-200',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-200',
    slate: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
  }

  return (
    <Link className={`rounded-2xl border p-4 shadow-lg shadow-slate-200/60 transition hover:-translate-y-0.5 ${toneClasses[tone]}`} to={to}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/80 shadow-sm">
          {icon}
        </div>
        <div>
          <p className="text-sm font-black text-slate-950">{label}</p>
          <p className="mt-1 text-xs font-bold opacity-80">{text}</p>
        </div>
      </div>
    </Link>
  )
}

function Metric({
  icon,
  label,
  subtext,
  tone,
  value,
}: {
  icon: React.ReactNode
  label: string
  subtext: string
  tone: 'amber' | 'blue' | 'emerald' | 'rose'
  value: string
}) {
  const toneClasses = {
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-lg shadow-slate-200/60 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-[0.12em]">{label}</span>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/85 shadow-sm">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold opacity-80">{subtext}</p>
    </div>
  )
}
