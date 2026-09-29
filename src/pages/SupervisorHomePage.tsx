import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  Factory,
  Loader2,
  LogOut,
  RefreshCw,
  Table2,
  Timer,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ensureKnownRobots,
  getJobs,
  updateJob,
  type Job,
  type Robot,
  type ShiftCode,
} from '../api/plannerApi'
import { cardClassName, pageShellClassName, primaryButtonClassName, secondaryButtonClassName } from '../styles/ui'
import { useCurrentUser } from '../users/useCurrentUser'

const plannerDate = '2026-06-08'

const shifts: { label: string; name: string; value: ShiftCode }[] = [
  { label: 'N', name: 'Nacht', value: 'N' },
  { label: 'F', name: 'Frueh', value: 'F' },
  { label: 'S', name: 'Spaet', value: 'S' },
]

export function SupervisorHomePage() {
  const { currentUser } = useCurrentUser()
  const [robots, setRobots] = useState<Robot[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)
  const [notice, setNotice] = useState('')

  const loadDashboard = useCallback(async () => {
    setIsLoading(true)

    try {
      const nextRobots = await ensureKnownRobots()
      const jobsByRobot = await Promise.all(nextRobots.map((robot) => getJobs({ robotId: robot.id, date: plannerDate })))

      setRobots(nextRobots.sort((first, second) => first.assetId.localeCompare(second.assetId)))
      setJobs(jobsByRobot.flat())
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadDashboard()
    }, 15000)

    return () => window.clearInterval(interval)
  }, [loadDashboard])

  const pendingJobs = useMemo(() => jobs.filter((job) => isPendingApproval(job) && job.status !== 'done'), [jobs])
  const doneJobs = useMemo(() => jobs.filter((job) => job.status === 'done'), [jobs])
  const openJobs = useMemo(() => jobs.filter((job) => job.status !== 'done'), [jobs])
  const readyJobs = useMemo(() => openJobs.filter((job) => job.schonGeheftet || job.jobType === 'repair'), [openJobs])
  const robotMinutesOpen = openJobs.reduce((total, job) => total + (job.remainingAnlageMinutes ?? job.anlageMinutes), 0)

  const approveJob = async (job: Job) => {
    setIsWorking(true)
    setNotice('')

    try {
      await updateJob(job.id, {
        approvalStatus: 'approved',
        approvedAt: new Date().toISOString(),
        approvedByName: currentUser.name,
        isHeld: false,
        isForced: true,
        isPriority: true,
      })
      setNotice(`${job.faNumber} wurde freigegeben und bleibt im angefragten Planfenster.`)
      await loadDashboard()
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const rejectJob = async (job: Job) => {
    setIsWorking(true)
    setNotice('')

    try {
      await updateJob(job.id, {
        approvalStatus: 'rejected',
        approvalNote: 'Vom Supervisor abgelehnt.',
        isHeld: true,
        rejectedAt: new Date().toISOString(),
        rejectedByName: currentUser.name,
      })
      setNotice(`${job.faNumber} wurde abgelehnt.`)
      await loadDashboard()
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <main className={`${pageShellClassName} bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#f7f9fc_35rem)]`}>
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-300">
              <Factory className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Clinton Enterprise</p>
              <h1 className="mt-1 text-2xl font-black tracking-normal text-slate-950">Schichtleiter-Zentrale</h1>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {currentUser.name} / {currentUser.role} / Backend Live
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClassName} type="button" disabled={isWorking} onClick={() => void loadDashboard()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Aktualisieren
            </button>
            <Link className={secondaryButtonClassName} to="/">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Abmelden
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        {notice && (
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-900 shadow-sm">
            {notice}
          </div>
        )}

        {isLoading ? (
          <div className={`${cardClassName} flex items-center gap-3 p-6 text-sm font-bold text-slate-500`}>
            <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
            Lade Supervisor-Dashboard...
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-300/80">
              <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="p-6 text-white lg:p-8">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Werk Leitstand</p>
                  <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-normal md:text-4xl">
                    Freigaben, erledigte Jobs und Anlagenstatus in einem Dashboard.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-300">
                    Bediener-Meldungen landen als Freigabe-Jobs hier. Fertige Jobs bleiben im Wochenplan sichtbar und koennen dort bearbeitet werden.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Link className={primaryButtonClassName} to="/planner/weekly">
                      <Table2 className="h-4 w-4" aria-hidden="true" />
                      Wochenplanung
                    </Link>
                    <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/15" to="/robots">
                      <Factory className="h-4 w-4" aria-hidden="true" />
                      Anlagen
                    </Link>
                    <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/15" to="/planner/staff">
                      <Users className="h-4 w-4" aria-hidden="true" />
                      Personalplanung
                    </Link>
                  </div>
                </div>
                <div className="border-t border-white/10 bg-slate-900 p-6 text-white lg:border-l lg:border-t-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Automatisch aktualisiert</p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <HeroStat label="Robots" value={`${robots.length}`} />
                    <HeroStat label="Freigaben" value={`${pendingJobs.length}`} tone={pendingJobs.length > 0 ? 'amber' : 'emerald'} />
                    <HeroStat label="Fertig" value={`${doneJobs.length}`} tone="emerald" />
                    <HeroStat label="Offen min" value={`${robotMinutesOpen}m`} />
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <Metric icon={<Factory className="h-5 w-5" />} label="Anlagen" value={`${robots.length}`} />
              <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Freigaben" value={`${pendingJobs.length}`} tone="amber" />
              <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Bereit" value={`${readyJobs.length}`} tone="emerald" />
              <Metric icon={<Timer className="h-5 w-5" />} label="Roboter offen" value={`${robotMinutesOpen}m`} tone="blue" />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="space-y-5">
                <PendingJobsPanel isWorking={isWorking} jobs={pendingJobs} robots={robots} onApprove={approveJob} onReject={rejectJob} />
                <RobotStatusPanel jobs={jobs} robots={robots} />
              </section>

              <aside className="space-y-5">
                <section className={`${cardClassName} p-5`}>
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-700">Fertig gemeldet</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">{doneJobs.length} Jobs heute</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Fertige Jobs werden nicht als Dashboard-Benachrichtigung gelistet. Sie sind im Wochenplan direkt in der jeweiligen Schicht sichtbar und koennen dort bearbeitet oder wieder geoeffnet werden.
                  </p>
                  <Link className={`${secondaryButtonClassName} mt-4 w-full`} to="/planner/weekly">
                    <Table2 className="h-4 w-4" aria-hidden="true" />
                    Wochenplan oeffnen
                  </Link>
                </section>
                <section className={`${cardClassName} p-5`}>
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Schlosser Live View</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">Naechster Schritt</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Die Live-Ansicht sollte als naechstes ebenfalls auf Backend-Daten wechseln und pro Roboter zeigen, welche Jobs noch Heften brauchen.
                  </p>
                  <Link className={`${secondaryButtonClassName} mt-4 w-full`} to="/robots">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Anlagen-Live oeffnen
                  </Link>
                </section>
              </aside>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function PendingJobsPanel({
  isWorking,
  jobs,
  onApprove,
  onReject,
  robots,
}: {
  isWorking: boolean
  jobs: Job[]
  onApprove: (job: Job) => void
  onReject: (job: Job) => void
  robots: Robot[]
}) {
  return (
    <section className={`${cardClassName} overflow-hidden`}>
      <PanelHeader kicker="Bediener-Meldungen" title="Jobs warten auf Supervisor-Freigabe" text="Diese Jobs wurden vom Bediener erstellt und sind gehalten, bis die Planung sie freigibt." count={jobs.length} />
      <div className="divide-y divide-slate-100">
        {jobs.map((job) => (
          <article className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" key={job.id}>
            <JobLine job={job} robot={findRobot(robots, job.robotId)} />
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Link className={smallButtonClassName} to="/planner/weekly">
                Bearbeiten
              </Link>
              <button className={smallButtonClassName} type="button" disabled={isWorking} onClick={() => onReject(job)}>
                Ablehnen
              </button>
              <button className={primaryButtonClassName} type="button" disabled={isWorking} onClick={() => onApprove(job)}>
                Freigeben
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
        {jobs.length === 0 && <p className="p-5 text-sm font-bold text-emerald-700">Keine offenen Bediener-Meldungen.</p>}
      </div>
    </section>
  )
}

function RobotStatusPanel({ jobs, robots }: { jobs: Job[]; robots: Robot[] }) {
  return (
    <section className={`${cardClassName} overflow-hidden`}>
      <PanelHeader kicker="Anlagenstatus" title="Heute pro Roboter" text="Aus Backend-Jobs berechnet. Roboter ohne Jobs bleiben trotzdem sichtbar." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase tracking-[0.12em] text-slate-200">
            <tr>
              <th className="px-4 py-3">Roboter</th>
              <th className="px-4 py-3 text-right">Jobs</th>
              <th className="px-4 py-3 text-right">Fertig</th>
              <th className="px-4 py-3 text-right">Geheftet</th>
              <th className="px-4 py-3 text-right">Freigaben</th>
              <th className="px-4 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {robots.map((robot) => {
              const robotJobs = jobs.filter((job) => job.robotId === robot.id)
              const done = robotJobs.filter((job) => job.status === 'done').length
              const ready = robotJobs.filter((job) => job.schonGeheftet).length
              const pending = robotJobs.filter((job) => isPendingApproval(job)).length

              return (
                <tr className="bg-white" key={robot.id}>
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-950">{robot.name}</p>
                    <p className="text-xs font-bold text-slate-500">{robot.assetId} / {robot.location}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-black">{robotJobs.length}</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-700">{done}</td>
                  <td className="px-4 py-3 text-right font-black text-blue-700">{ready}</td>
                  <td className="px-4 py-3 text-right font-black text-amber-700">{pending}</td>
                  <td className="px-4 py-3 text-right">
                    <Link className={smallButtonClassName} to={`/robots/${robot.id}/operator`}>
                      Board
                    </Link>
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

function JobLine({ job, robot }: { job: Job; robot?: Robot }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-black text-slate-950">{job.faNumber}</p>
        <span className={`rounded-lg px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${job.jobType === 'repair' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
          {job.jobType === 'repair' ? 'Reparatur' : 'Produktion'}
        </span>
        {isPendingApproval(job) && <span className="rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-violet-800">Freigabe</span>}
      </div>
      <p className="mt-1 text-sm font-bold text-slate-500">
        {robot?.name ?? 'Roboter'} / {job.projekt} / Art. {job.artikelNummer} / Schritt {job.schritt} / VR-{job.vorrichtung}
      </p>
      <p className="mt-1 text-xs font-bold text-slate-400">
        {getShiftName(job.shift)} / Roboter {job.remainingAnlageMinutes ?? job.anlageMinutes}m / Schlosser {job.schonGeheftet ? 0 : job.schlosserMinutes}m
      </p>
    </div>
  )
}

function PanelHeader({ count, kicker, text, title }: { count?: number; kicker: string; text: string; title: string }) {
  return (
    <div className="border-b border-slate-100 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">{kicker}</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
        </div>
        {count !== undefined && <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{count}</span>}
      </div>
    </div>
  )
}

function Metric({ icon, label, tone = 'slate', value }: { icon: React.ReactNode; label: string; tone?: 'amber' | 'blue' | 'emerald' | 'slate'; value: string }) {
  const toneClass = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone]

  return (
    <article className={`${cardClassName} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
        </div>
        <span className={`rounded-2xl p-3 ${toneClass}`}>{icon}</span>
      </div>
    </article>
  )
}

function HeroStat({ label, tone = 'blue', value }: { label: string; tone?: 'amber' | 'blue' | 'emerald'; value: string }) {
  const toneClass = {
    amber: 'bg-amber-400/15 text-amber-200',
    blue: 'bg-blue-400/15 text-blue-200',
    emerald: 'bg-emerald-400/15 text-emerald-200',
  }[tone]

  return (
    <div className={`rounded-2xl p-4 ${toneClass}`}>
      <p className="text-xs font-black uppercase tracking-[0.12em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  )
}

function findRobot(robots: Robot[], robotId: string) {
  return robots.find((robot) => robot.id === robotId)
}

function getShiftName(shift: ShiftCode) {
  return shifts.find((item) => item.value === shift)?.name ?? shift
}

function isPendingApproval(job: Job) {
  return job.approvalStatus === 'pending' || (!job.approvalStatus && job.isHeld)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unbekannter Fehler'
}

const smallButtonClassName =
  'inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'
