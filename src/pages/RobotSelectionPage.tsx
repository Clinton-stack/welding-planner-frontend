import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, ClipboardList, Factory, Loader2, Search, ShieldCheck, Table2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { LogoMark } from '../components/LogoMark'
import { ensureKnownRobots, getJobs, type Job, type Robot } from '../api/plannerApi'
import { cardClassName, inputClassName, pageShellClassName } from '../styles/ui'
import { useCurrentUser } from '../users/useCurrentUser'

const plannerDate = '2026-06-08'

export function RobotSelectionPage() {
  const { currentUser } = useCurrentUser()
  const [query, setQuery] = useState('')
  const [robots, setRobots] = useState<Robot[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const isShiftBoundUser = Boolean(currentUser.shift)

  useEffect(() => {
    async function loadRobots() {
      setIsLoading(true)

      try {
        const nextRobots = await ensureKnownRobots()
        const jobsByRobot = await Promise.all(nextRobots.map((robot) => getJobs({ robotId: robot.id, date: plannerDate })))

        setRobots(nextRobots.sort((first, second) => first.assetId.localeCompare(second.assetId)))
        setJobs(jobsByRobot.flat())
      } finally {
        setIsLoading(false)
      }
    }

    void loadRobots()
  }, [])

  const visibleRobots = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return robots
    }

    return robots.filter((robot) =>
      [robot.name, robot.assetId, robot.location, robot.process].join(' ').toLowerCase().includes(normalizedQuery),
    )
  }, [query, robots])
  const carryoverCount = jobs.filter((job) => job.carriedFromPreviousShift || (job.progressPercent && job.progressPercent > 0 && job.progressPercent < 100)).length

  return (
    <main className={pageShellClassName}>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <Link to="/robots" className="flex items-center gap-3">
            <LogoMark size="sm" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Clinton Enterprise</p>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-normal text-slate-950">Clinton Enterprise</h1>
                <span className="rounded-xl bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">{currentUser.role}</span>
              </div>
            </div>
          </Link>
          <div className="flex flex-wrap gap-2">
            {(currentUser.role === 'Supervisor' || currentUser.role === 'Admin') && (
              <Link
                to="/supervisor"
                className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-black text-blue-700 shadow-sm transition hover:bg-blue-100"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Zur Schichtleiter-Zentrale
              </Link>
            )}
            <Link to="/" className="inline-flex h-10 w-fit items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50">
              Abmelden
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        <div className={`${cardClassName} p-5 lg:p-6`}>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Anlagen-Auswahl</p>
              <h2 className="mt-2 text-3xl font-black tracking-normal text-slate-950">Anlage auswaehlen</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Backend-Roboterliste. Bediener oeffnen ihr Board, Supervisoren koennen zur Planung wechseln.
              </p>
            </div>

            <label className="relative w-full max-w-md">
              <span className="sr-only">Anlagen suchen</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClassName} w-full pl-12`} onChange={(event) => setQuery(event.target.value)} placeholder="Anlage, AP-Nummer, Halle suchen" value={query} />
            </label>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <SummaryTile icon={<CalendarDays className="h-5 w-5" />} label={isShiftBoundUser ? 'Aktuelle Schicht' : 'Rolle'} value={isShiftBoundUser ? `${currentUser.shift} Schicht` : 'Schichtuebergreifend'} />
            <SummaryTile icon={<Factory className="h-5 w-5" />} label="Verfuegbare Anlagen" value={visibleRobots.length.toString()} />
            <SummaryTile icon={<ClipboardList className="h-5 w-5" />} label="Reste heute" value={carryoverCount.toString()} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/analytics" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50">
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Auswertung
            </Link>

            {(currentUser.role === 'Supervisor' || currentUser.role === 'Admin') && (
              <Link to="/planner/weekly" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white shadow-md shadow-blue-700/15 transition hover:bg-blue-800">
                <Table2 className="h-4 w-4" aria-hidden="true" />
                Wochenplan oeffnen
              </Link>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className={`${cardClassName} mt-5 flex items-center gap-3 p-6 text-sm font-bold text-slate-500`}>
            <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
            Lade Roboter aus der Datenbank...
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleRobots.map((robot, index) => {
              const robotJobs = jobs.filter((job) => job.robotId === robot.id)
              const openJobs = robotJobs.filter((job) => job.status !== 'done').length
              const pendingJobs = robotJobs.filter((job) => isPendingApproval(job)).length

              return (
                <article className={`${cardClassName} overflow-hidden`} key={robot.id}>
                  <div className="relative h-44 bg-slate-200">
                    <img src={`/robot-images/robot-card-${(index % 3) + 1}.jpg`} alt="" className="h-full w-full object-cover" />
                    <div className="absolute left-4 top-4 rounded-xl bg-white/95 px-3 py-1.5 text-xs font-black text-blue-700 shadow-sm">{robot.assetId}</div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-black text-slate-950">{robot.name}</h3>
                        <p className="mt-1 text-sm font-bold text-slate-500">{robot.process} / {robot.location}</p>
                      </div>
                      <ShieldCheck className="h-5 w-5 text-blue-700" aria-hidden="true" />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{robotJobs.length} Positionen</span>
                      <span className="rounded-xl bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{openJobs} offen</span>
                      {pendingJobs > 0 && <span className="rounded-xl bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">{pendingJobs} Freigabe</span>}
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Link to={`/robots/${robot.id}/operator`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white shadow-md shadow-blue-700/15 transition hover:bg-blue-800">
                        Bediener-Board
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      <Link to={`/robots/${robot.id}/day`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50">
                        Live-Ansicht
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

function SummaryTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-white">{icon}</div>
      <div>
        <p className="text-sm font-bold text-slate-500">{label}</p>
        <p className="mt-1 text-base font-black text-slate-950">{value}</p>
      </div>
    </div>
  )
}

function isPendingApproval(job: Job) {
  return job.approvalStatus === 'pending' || (!job.approvalStatus && job.isHeld)
}
