import { ArrowLeft, CheckCircle2, ClipboardList, Factory, Loader2, Printer, QrCode, ScanLine, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ensureKnownRobots, getJobs, type Job, type Robot, type ShiftCode } from '../api/plannerApi'
import { cardClassName, pageShellClassName, secondaryButtonClassName } from '../styles/ui'

type LiveTab = 'plan' | 'schlosser' | 'qr'

const plannerDate = '2026-06-08'

const shifts: { label: string; name: string; time: string; value: ShiftCode }[] = [
  { label: 'N', name: 'Nacht', time: '22:00 - 06:00', value: 'N' },
  { label: 'F', name: 'Frueh', time: '06:00 - 14:00', value: 'F' },
  { label: 'S', name: 'Spaet', time: '14:00 - 22:00', value: 'S' },
]

export function DailyPlanPage() {
  const { robotId } = useParams()
  const [activeTab, setActiveTab] = useState<LiveTab>('plan')
  const [robots, setRobots] = useState<Robot[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const selectedRobot = robots.find((robot) => robot.id === robotId)
  const pageUrl = `${window.location.origin}/robots/${robotId}/day`

  const loadLiveView = useCallback(async () => {
    setIsLoading(true)

    try {
      const nextRobots = await ensureKnownRobots()
      const jobsByRobot = await Promise.all(nextRobots.map((robot) => getJobs({ robotId: robot.id, date: plannerDate })))

      setRobots(nextRobots.sort((first, second) => first.assetId.localeCompare(second.assetId)))
      setJobs(jobsByRobot.flat())
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLiveView()
  }, [loadLiveView])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadLiveView()
    }, 15000)

    return () => window.clearInterval(interval)
  }, [loadLiveView])

  const robotJobs = useMemo(() => jobs.filter((job) => job.robotId === selectedRobot?.id), [jobs, selectedRobot?.id])
  const doneCount = robotJobs.filter((job) => job.status === 'done').length
  const schlosserJobs = jobs.filter((job) => job.status !== 'done' && job.jobType === 'production' && !job.schonGeheftet)

  if (!isLoading && !selectedRobot) {
    return <Navigate to="/robots" replace />
  }

  return (
    <main className={`${pageShellClassName} bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#f7f9fc_34rem)]`}>
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <Link to="/robots" className="mb-2 inline-flex items-center gap-2 text-sm font-black text-blue-700">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Zurueck zu Anlagen
            </Link>
            <h1 className="text-2xl font-black tracking-normal text-slate-950">Live-Ansicht{selectedRobot ? `: ${selectedRobot.name}` : ''}</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">{selectedRobot?.assetId ?? 'Backend'} / {plannerDate}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClassName} type="button" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              Drucken
            </button>
            <button className={secondaryButtonClassName} type="button" onClick={() => setActiveTab('qr')}>
              <QrCode className="h-4 w-4" aria-hidden="true" />
              QR
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        {isLoading ? (
          <div className={`${cardClassName} flex items-center gap-3 p-6 text-sm font-bold text-slate-500`}>
            <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
            Lade Live-Ansicht...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Metric icon={<Factory className="h-5 w-5" />} label="Anlage" value={selectedRobot?.name ?? '-'} />
              <Metric icon={<ClipboardList className="h-5 w-5" />} label="Jobs" value={`${robotJobs.length}`} />
              <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Fertig" value={`${doneCount}`} tone="emerald" />
              <Metric icon={<Users className="h-5 w-5" />} label="Heften offen" value={`${schlosserJobs.length}`} tone="amber" />
            </div>

            <div className="mt-5 flex flex-wrap gap-2 print:hidden">
              <TabButton active={activeTab === 'plan'} label="Roboter Plan" onClick={() => setActiveTab('plan')} />
              <TabButton active={activeTab === 'schlosser'} label="Schlosser Live" onClick={() => setActiveTab('schlosser')} />
              <TabButton active={activeTab === 'qr'} label="QR / Druck" onClick={() => setActiveTab('qr')} />
            </div>

            {activeTab === 'plan' && <RobotLivePlan jobs={robotJobs} />}
            {activeTab === 'schlosser' && <SchlosserLiveView jobs={schlosserJobs} robots={robots} />}
            {activeTab === 'qr' && <QrPanel pageUrl={pageUrl} selectedRobot={selectedRobot} />}
          </>
        )}
      </section>
    </main>
  )
}

function RobotLivePlan({ jobs }: { jobs: Job[] }) {
  return (
    <section className={`${cardClassName} mt-5 overflow-hidden`}>
      <PanelTitle title="Roboter Tagesplan" text="Backend-Jobs nach Schicht. Status kommt aus Bediener- und Supervisor-Aktionen." />
      <div className="divide-y divide-slate-100">
        {shifts.map((shift) => {
          const shiftJobs = jobs.filter((job) => job.shift === shift.value)

          return (
            <section key={shift.value}>
              <ShiftHeader jobs={shiftJobs} shift={shift} />
              <div className="divide-y divide-slate-100">
                {shiftJobs.map((job) => <JobRow job={job} key={job.id} />)}
                {shiftJobs.length === 0 && <p className="px-4 py-5 text-sm font-bold text-slate-400">Keine Jobs.</p>}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}

function SchlosserLiveView({ jobs, robots }: { jobs: Job[]; robots: Robot[] }) {
  return (
    <section className={`${cardClassName} mt-5 overflow-hidden`}>
      <PanelTitle title="Schlosser Live View" text="Alle offenen Heft-Jobs ueber alle Roboter. Spaeter koennen wir hier nach Halle, Roboter oder Schicht filtern." />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => (
          <article className="rounded-2xl border border-amber-100 bg-amber-50 p-4" key={job.id}>
            <p className="font-black text-slate-950">{job.faNumber}</p>
            <p className="mt-1 text-sm font-bold text-amber-900">{findRobot(robots, job.robotId)?.name ?? 'Roboter'} / {getShiftName(job.shift)}</p>
            <p className="mt-2 text-sm font-bold text-slate-700">{job.projekt} / Art. {job.artikelNummer} / Schritt {job.schritt} / VR-{job.vorrichtung}</p>
            <p className="mt-2 text-xs font-black text-amber-800">Schlosser {job.schlosserMinutes}m / Roboter {job.remainingAnlageMinutes ?? job.anlageMinutes}m</p>
          </article>
        ))}
        {jobs.length === 0 && <p className="text-sm font-bold text-emerald-700">Keine offenen Heft-Jobs.</p>}
      </div>
    </section>
  )
}

function QrPanel({ pageUrl, selectedRobot }: { pageUrl: string; selectedRobot?: Robot }) {
  return (
    <section className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className={`${cardClassName} p-5`}>
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-blue-700" aria-hidden="true" />
          <h2 className="text-lg font-black text-slate-950">QR Tagesplan</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">QR-Code fuer die Live-Ansicht von {selectedRobot?.name ?? 'dieser Anlage'}.</p>
        <div className="mt-5 flex justify-center rounded-2xl border border-slate-100 bg-white p-4">
          <QRCode value={pageUrl} size={188} />
        </div>
        <p className="mt-3 break-all rounded-xl bg-slate-100 p-3 font-mono text-xs text-slate-600">{pageUrl}</p>
      </div>
      <div className={`${cardClassName} p-5`}>
        <h2 className="text-lg font-black text-slate-950">Druckansicht</h2>
        <ul className="mt-4 space-y-3 text-sm font-bold leading-6 text-slate-600">
          <li>Backend-Daten statt Demo-Daten.</li>
          <li>Roboter-Plan und Schlosser-Heftliste getrennt sichtbar.</li>
          <li>Automatische Aktualisierung alle 15 Sekunden.</li>
        </ul>
      </div>
    </section>
  )
}

function ShiftHeader({ jobs, shift }: { jobs: Job[]; shift: { label: string; name: string; time: string; value: ShiftCode } }) {
  const ready = jobs.filter((job) => job.schonGeheftet || job.jobType === 'repair').length

  return (
    <div className="flex flex-col gap-2 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-slate-950 px-2 py-1 text-xs font-black text-white">{shift.label}</span>
        <p className="font-black text-slate-950">{shift.name}</p>
        <p className="text-xs font-bold text-slate-500">{shift.time}</p>
      </div>
      <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{jobs.length} Jobs / {ready} bereit</p>
    </div>
  )
}

function JobRow({ job }: { job: Job }) {
  return (
    <article className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black text-slate-950">{job.faNumber}</p>
          <StatusBadge job={job} />
          {isPendingApproval(job) && <span className="rounded-lg bg-violet-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-violet-800">Freigabe</span>}
        </div>
        <p className="mt-1 text-sm font-bold text-slate-500">{job.projekt} / Art. {job.artikelNummer} / Schritt {job.schritt} / VR-{job.vorrichtung}</p>
      </div>
      <p className="text-xs font-black text-slate-500">Roboter {job.remainingAnlageMinutes ?? job.anlageMinutes}m / Schlosser {job.schonGeheftet ? 0 : job.schlosserMinutes}m</p>
    </article>
  )
}

function StatusBadge({ job }: { job: Job }) {
  if (job.status === 'done') return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-700">Fertig</span>
  if (job.jobType === 'repair') return <span className="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-rose-700">Reparatur</span>
  if (job.schonGeheftet) return <span className="rounded-lg bg-blue-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-blue-700">Bereit</span>
  return <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-amber-800">Heften offen</span>
}

function PanelTitle({ text, title }: { text: string; title: string }) {
  return (
    <div className="border-b border-slate-100 p-5">
      <h2 className="text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function Metric({ icon, label, tone = 'blue', value }: { icon: React.ReactNode; label: string; tone?: 'amber' | 'blue' | 'emerald'; value: string }) {
  const toneClass = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
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

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`h-10 rounded-xl px-4 text-sm font-black transition ${active ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`} type="button" onClick={onClick}>
      {label}
    </button>
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
