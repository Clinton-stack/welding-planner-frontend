import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Factory,
  Printer,
  QrCode,
  ScanLine,
  Table2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import QRCode from 'react-qr-code'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  robots,
  shiftStaffAssignments,
  todayPlan,
  type JobStatus,
  type ProductionJob,
  type ShiftCode,
  type ShiftStaffAssignment,
} from '../data/demoData'

type LiveTab = 'plan' | 'staff' | 'analytics' | 'qr'

const statusStyles: Record<JobStatus, string> = {
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  running: 'bg-sky-50 text-sky-700 ring-sky-200',
  open: 'bg-slate-100 text-slate-700 ring-slate-200',
  blocked: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const statusLabel: Record<JobStatus, string> = {
  done: 'Fertig',
  running: 'Laeuft',
  open: 'Offen',
  blocked: 'Blockiert',
}

const shiftAccent: Record<ShiftCode, string> = {
  F: 'border-l-amber-400',
  S: 'border-l-cyan-500',
  N: 'border-l-indigo-500',
}

const liveTabs: { icon: typeof Table2; id: LiveTab; label: string; text: string }[] = [
  {
    icon: Table2,
    id: 'plan',
    label: 'Live-Plan',
    text: 'F/S/N-Schichtplan ohne Bearbeitung.',
  },
  {
    icon: Users,
    id: 'staff',
    label: 'Schichtplan',
    text: 'Bediener und Schweisser pro Schicht.',
  },
  {
    icon: BarChart3,
    id: 'analytics',
    label: 'Auswertung',
    text: 'Soll/Ist Fortschritt aller Anlagen.',
  },
  {
    icon: QrCode,
    id: 'qr',
    label: 'QR / Druck',
    text: 'QR-Link und Druckansicht.',
  },
]

function getRemaining(job: ProductionJob) {
  return Math.max(job.plannedQty - job.doneQty, 0)
}

function getShiftLoad(jobs: ProductionJob[]) {
  return jobs.reduce((sum, job) => sum + job.anlageMin * job.plannedQty + job.ruestzeitMin, 0)
}

function getLoadPercent(jobs: ProductionJob[]) {
  return Math.round((getShiftLoad(jobs) / 480) * 100)
}

function getShiftTotals(jobs: ProductionJob[]) {
  return jobs.reduce(
    (totals, job) => ({
      anlage: totals.anlage + job.anlageMin * job.plannedQty,
      done: totals.done + job.doneQty,
      kapaBediener: totals.kapaBediener + job.kapaBedienerMin,
      planned: totals.planned + job.plannedQty,
      remaining: totals.remaining + getRemaining(job),
      ruest: totals.ruest + job.ruestzeitMin,
      schlosser: totals.schlosser + job.schlosserMin * job.plannedQty,
    }),
    { anlage: 0, done: 0, kapaBediener: 0, planned: 0, remaining: 0, ruest: 0, schlosser: 0 },
  )
}

function getAllRobotProgress() {
  return robots.map((robot, index) => {
    const robotJobs = todayPlan.filter((shift) => shift.robotId === robot.id).flatMap((shift) => shift.jobs)
    const liveSoll = robotJobs.reduce((sum, job) => sum + job.plannedQty, 0)
    const liveIst = robotJobs.reduce((sum, job) => sum + job.doneQty, 0)
    const fallbackSoll = 18 + index * 3
    const fallbackIst = Math.max(0, fallbackSoll - ((index * 5) % 9))
    const soll = liveSoll || fallbackSoll
    const ist = liveSoll ? liveIst : fallbackIst

    return {
      anlage: robot.name,
      assetId: robot.assetId,
      ist,
      percent: Math.round((ist / soll) * 100),
      soll,
    }
  })
}

export function DailyPlanPage() {
  const { robotId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<LiveTab>('plan')
  const selectedRobot = robots.find((robot) => robot.id === robotId)

  if (!selectedRobot) {
    return <Navigate to="/robots" replace />
  }

  const robotPlan = todayPlan.filter((shift) => shift.robotId === selectedRobot.id)
  const allJobs = robotPlan.flatMap((shift) => shift.jobs)
  const totalPlanned = allJobs.reduce((sum, job) => sum + job.plannedQty, 0)
  const totalDone = allJobs.reduce((sum, job) => sum + job.doneQty, 0)
  const carryovers = allJobs.filter((job) => job.priority === 'carryover')
  const openCount = allJobs.filter((job) => getRemaining(job) > 0).length
  const pageUrl = `${window.location.origin}/robots/${selectedRobot.id}/day`

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-200 bg-white lg:w-80 lg:border-b-0 lg:border-r print:hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
            <div className="flex size-11 items-center justify-center rounded-md bg-blue-700 text-white">
              <Factory size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Live-Ansicht</p>
              <h1 className="text-xl font-bold">Clinton Enterprise</h1>
            </div>
          </div>

          <section className="px-6 py-5">
            <Link to="/robots" className="mb-5 inline-flex text-sm font-black text-blue-700">
              Zurueck zu Anlagen
            </Link>

            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ansichten</p>
            <div className="mt-4 space-y-2">
              {liveTabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id

                return (
                  <button
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-blue-700'}`} aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-black">{tab.label}</span>
                      <span className={`mt-1 block text-xs leading-5 ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                        {tab.text}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white px-5 py-4 lg:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <CalendarDays size={17} aria-hidden="true" />
                  Montag, 08.06.2026
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-normal md:text-3xl">
                  Tagesplan Live: {selectedRobot.name}
                </h2>
                <p className="mt-1 text-sm font-bold text-blue-700">
                  {selectedRobot.assetId} / {selectedRobot.process} / {selectedRobot.location}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <label className="grid min-w-64 gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
                  Anlage
                  <select
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-950 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                    value={selectedRobot.id}
                    onChange={(event) => navigate(`/robots/${event.target.value}/day`)}
                  >
                    {robots.map((robot) => (
                      <option value={robot.id} key={robot.id}>
                        {robot.name} / {robot.assetId}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm"
                  onClick={() => window.print()}
                  type="button"
                >
                  <Printer size={17} aria-hidden="true" />
                  Drucken
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm"
                  type="button"
                  onClick={() => setActiveTab('qr')}
                >
                  <QrCode size={17} aria-hidden="true" />
                  QR Live
                </button>
              </div>
            </div>
          </header>

          <div className="px-5 py-5 lg:px-8">
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Fertig heute" value={`${totalDone}/${totalPlanned}`} icon={<CheckCircle2 size={18} />} />
              <Metric label="Offen" value={openCount.toString()} icon={<ClipboardList size={18} />} />
              <Metric label="Reste" value={carryovers.length.toString()} icon={<ClipboardList size={18} />} />
              <Metric label="Ansicht" value="Nur lesen" icon={<ScanLine size={18} />} />
            </div>

            {activeTab === 'plan' && <LivePlan robotPlan={robotPlan} />}
            {activeTab === 'staff' && <StaffShiftPlan selectedRobot={selectedRobot} />}
            {activeTab === 'analytics' && <LiveProgressAnalytics />}
            {activeTab === 'qr' && <QrPrintPanel pageUrl={pageUrl} selectedRobotName={selectedRobot.name} />}
          </div>
        </section>
      </div>
    </main>
  )
}

function LivePlan({ robotPlan }: { robotPlan: typeof todayPlan }) {
  return (
    <section className="mt-5 overflow-hidden rounded-md border border-slate-300 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-bold">Schrittablauf Tagesplan</h3>
        <p className="mt-1 text-sm text-slate-500">
          Leseansicht nach dem Aufbau des Schichtplans: Frueh, Spaet und Nacht mit Status, Bemerkungen und Zeitwerten.
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {robotPlan.map((shift) => (
          <section className={`border-l-4 ${shiftAccent[shift.shift]} bg-white`} key={shift.id}>
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-md bg-slate-950 text-sm font-black text-white">
                  {shift.shift}
                </span>
                <div>
                  <h4 className="font-bold">{shift.shiftName}</h4>
                  <p className="text-sm text-slate-500">
                    {shift.day}, {shift.date} · {shift.time}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 lg:items-end">
                <ShiftStaffLine robotId={shift.robotId} shiftDate={shift.date} shiftCode={shift.shift} />
                <div className="inline-flex w-fit items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                  <Clock3 size={16} aria-hidden="true" />
                  Auslastung: {getLoadPercent(shift.jobs)}% / {getShiftLoad(shift.jobs)} min
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1480px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100 uppercase tracking-wide text-slate-600">
                    <th className="border-r border-slate-200 px-2 py-2">Schicht</th>
                    <th className="border-r border-slate-200 px-2 py-2">Projekt</th>
                    <th className="border-r border-slate-200 px-2 py-2">Art.</th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center">VR</th>
                    <th className="border-r border-slate-200 px-2 py-2 text-center">S</th>
                    <th className="border-r border-slate-200 px-2 py-2">FA</th>
                    <th className="border-r border-slate-200 px-2 py-2">Vorrichtung</th>
                    <th className="border-r border-slate-200 px-2 py-2">Schritt</th>
                    <th className="border-r border-slate-200 px-2 py-2">Optik</th>
                    <th className="border-r border-slate-200 px-2 py-2">Draht Nr.</th>
                    <th className="border-r border-slate-200 px-2 py-2">Bem. Bediener</th>
                    <th className="border-r border-slate-200 px-2 py-2">Bem. Schlosser</th>
                    <th className="border-r border-slate-200 px-2 py-2">Status</th>
                    <th className="border-r border-slate-200 px-2 py-2 text-right">Soll</th>
                    <th className="border-r border-slate-200 px-2 py-2 text-right">Ist</th>
                    <th className="border-r border-slate-200 px-2 py-2 text-right">Rest</th>
                    <th className="border-r border-slate-200 px-2 py-2 text-right">Kapa Bediener</th>
                    <th className="border-r border-slate-200 px-2 py-2 text-right">Schlosser</th>
                    <th className="border-r border-slate-200 px-2 py-2 text-right">Anlage</th>
                    <th className="px-2 py-2 text-right">Ruestzeit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shift.jobs.map((job) => {
                    const remaining = getRemaining(job)

                    return (
                      <tr className={job.priority === 'carryover' ? 'bg-amber-50' : 'bg-white'} key={job.id}>
                        <td className="border-r border-slate-100 px-2 py-2 font-black text-slate-700">{shift.shift}</td>
                        <td className="border-r border-slate-100 px-2 py-2 font-bold text-slate-950">
                          <div>{job.project}</div>
                          {job.priority === 'carryover' && (
                            <span className="mt-1 inline-flex rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-black text-amber-950">
                              Rest {job.carriedFrom}
                            </span>
                          )}
                        </td>
                        <td className="border-r border-slate-100 px-2 py-2 font-mono text-slate-700">{job.articleNo}</td>
                        <td className="border-r border-slate-100 px-2 py-2 text-center">{job.vr}</td>
                        <td className="border-r border-slate-100 px-2 py-2 text-center">{job.station}</td>
                        <td className="border-r border-slate-100 px-2 py-2 font-mono font-bold text-slate-700">{job.faNumber}</td>
                        <td className="border-r border-slate-100 px-2 py-2 text-slate-700">{job.fixture}</td>
                        <td className="border-r border-slate-100 px-2 py-2 text-slate-700">{job.step}</td>
                        <td className="border-r border-slate-100 px-2 py-2 font-bold text-slate-700">{job.optic ?? '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-2 font-mono text-slate-700">{job.wireNumber ?? '-'}</td>
                        <td className="max-w-52 border-r border-slate-100 px-2 py-2 text-slate-600">{job.operatorNote || '-'}</td>
                        <td className="max-w-52 border-r border-slate-100 px-2 py-2 font-semibold text-amber-800">{job.welderNote || '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-2">
                          <span className={`rounded-md px-2 py-1 text-[11px] font-black ring-1 ${statusStyles[job.status]}`}>
                            {statusLabel[job.status]}
                          </span>
                        </td>
                        <td className="border-r border-slate-100 px-2 py-2 text-right font-bold">{job.plannedQty}</td>
                        <td className="border-r border-slate-100 px-2 py-2 text-right font-bold">{job.doneQty}</td>
                        <td className={`border-r border-slate-100 px-2 py-2 text-right font-black ${remaining > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                          {remaining}
                        </td>
                        <td className="border-r border-slate-100 px-2 py-2 text-right">{job.kapaBedienerMin}</td>
                        <td className="border-r border-slate-100 px-2 py-2 text-right">{job.schlosserMin}</td>
                        <td className="border-r border-slate-100 px-2 py-2 text-right">{job.anlageMin}</td>
                        <td className="px-2 py-2 text-right">{job.ruestzeitMin}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <ShiftPlanFooter shift={shift} />
                </tfoot>
              </table>
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}

function ShiftPlanFooter({ shift }: { shift: (typeof todayPlan)[number] }) {
  const totals = getShiftTotals(shift.jobs)

  return (
    <tr className="border-t border-slate-300 bg-amber-100 font-black text-slate-800">
      <td className="px-2 py-2" colSpan={13}>
        Auslastungsziel Schicht: {shift.targetUtilization}% / {getLoadPercent(shift.jobs)}% erreicht
      </td>
      <td className="border-l border-amber-200 px-2 py-2 text-right">{totals.planned}</td>
      <td className="border-l border-amber-200 px-2 py-2 text-right">{totals.done}</td>
      <td className="border-l border-amber-200 px-2 py-2 text-right">{totals.remaining}</td>
      <td className="border-l border-amber-200 px-2 py-2 text-right">{totals.kapaBediener}</td>
      <td className="border-l border-amber-200 px-2 py-2 text-right">{totals.schlosser}</td>
      <td className="border-l border-amber-200 px-2 py-2 text-right">{totals.anlage}</td>
      <td className="border-l border-amber-200 px-2 py-2 text-right">{totals.ruest}</td>
    </tr>
  )
}

function ShiftStaffLine({
  robotId,
  shiftCode,
  shiftDate,
}: {
  robotId: string
  shiftCode: ShiftCode
  shiftDate: string
}) {
  const assignment = shiftStaffAssignments.find(
    (item) => item.date === shiftDate && item.shift === shiftCode && item.robotIds.includes(robotId),
  )

  if (!assignment) {
    return (
      <div className="inline-flex w-fit items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
        <Users size={15} aria-hidden="true" />
        Personal noch offen
      </div>
    )
  }

  return <StaffAssignmentPill assignment={assignment} />
}

function StaffAssignmentPill({ assignment }: { assignment: ShiftStaffAssignment }) {
  return (
    <div className="flex w-fit flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">
      <Users size={15} aria-hidden="true" />
      <span>Bediener: {assignment.operator}</span>
      <span className="text-blue-400">/</span>
      <span>Schweisser: {assignment.welders.join(', ')}</span>
    </div>
  )
}

function StaffShiftPlan({ selectedRobot }: { selectedRobot: (typeof robots)[number] }) {
  const assignments = shiftStaffAssignments.filter((assignment) => assignment.robotIds.includes(selectedRobot.id))

  return (
    <section className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-bold">Schichtplan Personal: {selectedRobot.name}</h3>
        <p className="mt-1 text-sm text-slate-500">
          Bediener und Schweisser fuer die ausgewaehlte Anlage. Sichtbar fuer Bediener, Schlosser und Schichtleitung.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Schicht</th>
              <th className="px-4 py-3">Bediener</th>
              <th className="px-4 py-3">Schweisser</th>
              <th className="px-4 py-3">Weitere Anlagen</th>
              <th className="px-4 py-3">Bemerkung</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assignments.length === 0 ? (
              <tr>
                <td className="px-4 py-5 font-bold text-slate-500" colSpan={5}>
                  Keine Personalplanung fuer diese Anlage hinterlegt.
                </td>
              </tr>
            ) : (
              assignments.map((assignment) => (
                <StaffShiftPlanRow assignment={assignment} selectedRobotId={selectedRobot.id} key={assignment.id} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StaffShiftPlanRow({
  assignment,
  selectedRobotId,
}: {
  assignment: ShiftStaffAssignment
  selectedRobotId: string
}) {
  const otherRobots = assignment.robotIds
    .filter((robotId) => robotId !== selectedRobotId)
    .map((robotId) => robots.find((robot) => robot.id === robotId))
    .filter((robot): robot is (typeof robots)[number] => Boolean(robot))

  return (
    <tr className="bg-white">
      <td className="px-4 py-3">
        <span className="rounded-md bg-slate-950 px-2 py-1 text-xs font-black text-white">{assignment.shift}</span>
      </td>
      <td className="px-4 py-3 font-black text-slate-950">{assignment.operator}</td>
      <td className="px-4 py-3 font-bold text-slate-700">{assignment.welders.join(' / ')}</td>
      <td className="px-4 py-3">
        {otherRobots.length === 0 ? (
          <span className="text-slate-400">-</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {otherRobots.map((robot) => (
              <span className="rounded-xl bg-blue-50 px-2 py-1 text-xs font-black text-blue-700" key={robot.id}>
                {robot.name}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="max-w-96 px-4 py-3 text-slate-600">{assignment.note || '-'}</td>
    </tr>
  )
}

function LiveProgressAnalytics() {
  const progress = getAllRobotProgress()
  const totalSoll = progress.reduce((sum, item) => sum + item.soll, 0)
  const totalIst = progress.reduce((sum, item) => sum + item.ist, 0)
  const achievement = totalSoll > 0 ? Math.round((totalIst / totalSoll) * 100) : 0
  const achievedCount = progress.filter((item) => item.ist >= item.soll).length

  return (
    <section className="mt-5 space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Soll gesamt" value={totalSoll.toString()} icon={<ClipboardList size={18} />} />
        <Metric label="Ist gesamt" value={totalIst.toString()} icon={<CheckCircle2 size={18} />} />
        <Metric label="Erreicht" value={`${achievement}%`} icon={<BarChart3 size={18} />} />
        <Metric label="Anlagen OK" value={`${achievedCount}/${robots.length}`} icon={<Factory size={18} />} />
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="text-lg font-bold">Soll / Ist pro Anlage</h3>
          <p className="mt-1 text-sm text-slate-500">Leseansicht fuer den Fortschritt aller Anlagen, sichtbar in der Live-Ansicht.</p>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={progress}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="anlage" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="soll" fill="#cbd5e1" name="Soll" radius={[6, 6, 0, 0]} />
            <Bar dataKey="ist" fill="#2563eb" name="Ist" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-bold">Zielerreichung pro Anlage</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Anlage</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3 text-right">Soll</th>
                <th className="px-4 py-3 text-right">Ist</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {progress.map((item) => (
                <tr className="bg-white" key={item.assetId}>
                  <td className="px-4 py-3 font-black text-slate-950">{item.anlage}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">{item.assetId}</td>
                  <td className="px-4 py-3 text-right font-bold">{item.soll}</td>
                  <td className="px-4 py-3 text-right font-bold">{item.ist}</td>
                  <td className="px-4 py-3 text-right font-black">{item.percent}%</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-xl px-2.5 py-1 text-xs font-black ${
                      item.ist >= item.soll ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                    }`}>
                      {item.ist >= item.soll ? 'Ziel erreicht' : 'Unter Ziel'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function QrPrintPanel({ pageUrl, selectedRobotName }: { pageUrl: string; selectedRobotName: string }) {
  return (
    <section className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="rounded-md border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ScanLine size={20} aria-hidden="true" />
          <h3 className="text-lg font-bold">QR Tagesplan</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          QR-Code fuer die Live-Ansicht von {selectedRobotName}. In der spaeteren Version ist dafuer kein Login noetig.
        </p>
        <div className="mt-5 flex justify-center rounded-md border border-slate-200 bg-white p-4">
          <QRCode value={pageUrl} size={188} />
        </div>
        <p className="mt-3 break-all rounded-md bg-slate-100 p-3 font-mono text-xs text-slate-600">
          {pageUrl}
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-bold">Druckansicht</h3>
        <ul className="mt-4 space-y-3 text-sm text-slate-600">
          <li>Nur heute, eine Anlage, F/S/N-Schichten.</li>
          <li>Reste und offene Positionen sind zuerst sichtbar.</li>
          <li>Projekt, Artikelnummer, Schritt und Vorrichtung sind klar sichtbar.</li>
          <li>Schlosser- und Bedienerhinweise bleiben sichtbar.</li>
        </ul>
      </div>
    </section>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 truncate text-lg font-black">{value}</p>
    </div>
  )
}
