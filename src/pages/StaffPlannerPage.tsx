import { ArrowLeft, CalendarDays, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  robots,
  shiftStaffAssignments,
  type Robot,
  type ShiftCode,
  type ShiftStaffAssignment,
} from '../data/demoData'
import {
  cardClassName,
  inputClassName,
  pageShellClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../styles/ui'
import { useCurrentUser } from '../users/useCurrentUser'

type StaffDraft = {
  note: string
  operator: string
  robotIds: string[]
  shift: ShiftCode
  welders: string
}

const operators = ['M. Weber', 'L. Schmidt', 'J. Hartmann', 'N. Becker', 'A. Fischer']
const welderOptions = ['T. Braun', 'K. Yilmaz', 'A. Novak', 'S. Ali', 'B. Klein', 'R. Osman', 'P. Wagner', 'M. Hoffmann']
const weekLabel = 'Woche 24'
const weekStartDate = '08.06.2026'

const shiftGroups: { label: string; name: string; time: string; value: ShiftCode }[] = [
  { label: 'F', name: 'Fruehschicht', time: '06:00 - 14:00', value: 'F' },
  { label: 'S', name: 'Spaetschicht', time: '14:00 - 22:00', value: 'S' },
  { label: 'N', name: 'Nachtschicht', time: '22:00 - 06:00', value: 'N' },
]

const emptyStaffDraft: StaffDraft = {
  note: '',
  operator: operators[0],
  robotIds: ['ap2904'],
  shift: 'F',
  welders: 'T. Braun, K. Yilmaz',
}

export function StaffPlannerPage() {
  const { currentUser } = useCurrentUser()
  const [draft, setDraft] = useState<StaffDraft>(emptyStaffDraft)
  const [plannedAssignments, setPlannedAssignments] = useState<ShiftStaffAssignment[]>(shiftStaffAssignments)
  const [message, setMessage] = useState('')

  const addAssignment = () => {
    if (draft.robotIds.length === 0) {
      setMessage('Mindestens eine Anlage auswaehlen.')
      return
    }

    const nextAssignment: ShiftStaffAssignment = {
      id: `staff-demo-${Date.now()}`,
      date: weekStartDate,
      note: draft.note,
      operator: draft.operator,
      robotIds: draft.robotIds,
      shift: draft.shift,
      welders: draft.welders
        .split(',')
        .map((welder) => welder.trim())
        .filter(Boolean),
    }

    setPlannedAssignments((current) => [nextAssignment, ...current])
    setDraft((current) => ({ ...current, note: '' }))
    setMessage(`${nextAssignment.operator} wurde fuer Woche 24 geplant.`)
  }

  const toggleRobot = (robotId: string) => {
    setDraft((current) => {
      const hasRobot = current.robotIds.includes(robotId)

      return {
        ...current,
        robotIds: hasRobot ? current.robotIds.filter((id) => id !== robotId) : [...current.robotIds, robotId],
      }
    })
  }

  const deleteAssignment = (assignmentId: string) => {
    setPlannedAssignments((current) => current.filter((assignment) => assignment.id !== assignmentId))
    setMessage('Personalplanung geloescht.')
  }

  return (
    <main className={pageShellClassName}>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <Link to="/supervisor" className="mb-2 inline-flex items-center gap-2 text-sm font-black text-blue-700">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Schichtleiter-Zentrale
            </Link>
            <h1 className="text-2xl font-black tracking-normal text-slate-950">Personalplanung {weekLabel}</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {currentUser.name} / Bediener, Anlagen und Schweisser fuer die Woche planen
            </p>
          </div>
          <Link className={secondaryButtonClassName} to="/planner/weekly">
            Wochenplanung
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Metric icon={<CalendarDays className="h-5 w-5" />} label="Woche" value="24" />
          <Metric icon={<Users className="h-5 w-5" />} label="Bediener geplant" value={plannedAssignments.length.toString()} />
          <Metric icon={<Users className="h-5 w-5" />} label="Schweisser geplant" value={getWelderCount(plannedAssignments).toString()} />
        </div>

        <section className={`${cardClassName} mt-5 overflow-hidden`}>
          <div className="border-b border-slate-100 p-5">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Personal einplanen</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Bediener mehreren Anlagen zuordnen</h2>
          </div>

          <div className="p-5">
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
              {weekLabel}: 08.06.2026 bis 12.06.2026. Einzelne Tage wie Urlaub oder Schulung bitte in der Bemerkung erfassen.
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Schicht
                <select
                  className={inputClassName}
                  value={draft.shift}
                  onChange={(event) => setDraft((current) => ({ ...current, shift: event.target.value as ShiftCode }))}
                >
                  {shiftGroups.map((shift) => (
                    <option value={shift.value} key={shift.value}>
                      {shift.label} / {shift.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Bediener
                <select
                  className={inputClassName}
                  value={draft.operator}
                  onChange={(event) => setDraft((current) => ({ ...current, operator: event.target.value }))}
                >
                  {operators.map((operator) => (
                    <option value={operator} key={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Schweisser
                <input
                  className={inputClassName}
                  value={draft.welders}
                  onChange={(event) => setDraft((current) => ({ ...current, welders: event.target.value }))}
                  list="welder-options"
                />
                <datalist id="welder-options">
                  {welderOptions.map((welder) => (
                    <option value={welder} key={welder} />
                  ))}
                </datalist>
              </label>
            </div>

            <div className="mt-4">
              <p className="text-sm font-bold text-slate-700">Anlagen auswaehlen</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                {robots.map((robot) => {
                  const isSelected = draft.robotIds.includes(robot.id)

                  return (
                    <button
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-black transition ${
                        isSelected ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      key={robot.id}
                      type="button"
                      onClick={() => toggleRobot(robot.id)}
                    >
                      {robot.name}
                      <span className="mt-1 block font-bold opacity-70">{robot.assetId}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Wochen-Bemerkung / Ausnahmen
                <input
                  className={inputClassName}
                  value={draft.note}
                  onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                  placeholder="z.B. Dienstag Urlaub M. Weber, Freitag Schulung, Pesa zuerst"
                />
              </label>
              <button className={`${primaryButtonClassName} self-end`} type="button" onClick={addAssignment}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Planen
              </button>
            </div>

            {message && (
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
                {message}
              </div>
            )}
          </div>
        </section>

        <section className="mt-5 space-y-5">
          {shiftGroups.map((shift) => (
            <ShiftAssignmentTable
              assignments={plannedAssignments.filter((assignment) => assignment.shift === shift.value)}
              key={shift.value}
              onDelete={deleteAssignment}
              shift={shift}
            />
          ))}
        </section>
      </section>
    </main>
  )
}

function ShiftAssignmentTable({
  assignments,
  onDelete,
  shift,
}: {
  assignments: ShiftStaffAssignment[]
  onDelete: (assignmentId: string) => void
  shift: { label: string; name: string; time: string; value: ShiftCode }
}) {
  return (
    <section className={`${cardClassName} overflow-hidden`}>
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">
            {shift.label} / {shift.name}
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{shift.time}</h2>
        </div>
        <span className="w-fit rounded-xl bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
          {assignments.length} Planung(en)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-white text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-3">Woche</th>
              <th className="px-3 py-3">Bediener</th>
              <th className="px-3 py-3">Anlagen</th>
              <th className="px-3 py-3">Schweisser</th>
              <th className="px-3 py-3">Wochen-Bemerkung / Ausnahmen</th>
              <th className="px-3 py-3 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assignments.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-sm font-bold text-slate-500" colSpan={6}>
                  Keine Personalplanung fuer diese Schicht.
                </td>
              </tr>
            ) : (
              assignments.map((assignment) => (
                <StaffAssignmentRow assignment={assignment} key={assignment.id} onDelete={onDelete} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StaffAssignmentRow({
  assignment,
  onDelete,
}: {
  assignment: ShiftStaffAssignment
  onDelete: (assignmentId: string) => void
}) {
  const assignedRobots = assignment.robotIds
    .map((robotId) => robots.find((robot) => robot.id === robotId))
    .filter((robot): robot is Robot => Boolean(robot))

  return (
    <tr className="bg-white hover:bg-slate-50">
      <td className="px-3 py-3 font-black text-slate-700">{weekLabel}</td>
      <td className="px-3 py-3 font-bold text-slate-950">{assignment.operator}</td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {assignedRobots.map((robot) => (
            <span className="rounded-xl bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" key={robot.id}>
              {robot.name}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3 font-bold text-slate-700">{assignment.welders.join(' / ')}</td>
      <td className="max-w-80 px-3 py-3 text-slate-600">{assignment.note || '-'}</td>
      <td className="px-3 py-3 text-right">
        <button
          className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
          type="button"
          onClick={() => onDelete(assignment.id)}
        >
          Loeschen
        </button>
      </td>
    </tr>
  )
}

function getWelderCount(assignments: ShiftStaffAssignment[]) {
  return new Set(assignments.flatMap((assignment) => assignment.welders)).size
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
