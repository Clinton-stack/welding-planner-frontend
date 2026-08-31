import { ArrowLeft, AreaChartIcon, Factory, Target, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { robots, todayPlan } from '../data/demoData'
import { cardClassName, pageShellClassName } from '../styles/ui'
import { useCurrentUser } from '../users/useCurrentUser'

type AnalyticsPeriod = 'week' | 'month'

const periodLabels: Record<AnalyticsPeriod, string> = {
  week: 'Woche',
  month: 'Monat',
}

const demoSollIstByRobot = robots.map((robot, index) => {
  const liveJobs = todayPlan.filter((shift) => shift.robotId === robot.id).flatMap((shift) => shift.jobs)
  const liveSoll = liveJobs.reduce((sum, job) => sum + job.plannedQty, 0)
  const liveIst = liveJobs.reduce((sum, job) => sum + job.doneQty, 0)
  const fallbackSoll = 18 + index * 3
  const fallbackIst = Math.max(0, fallbackSoll - ((index * 5) % 9))

  return {
    robot: robot.name,
    assetId: robot.assetId,
    weekSoll: liveSoll || fallbackSoll,
    weekIst: liveSoll ? liveIst : fallbackIst,
    monthSoll: (liveSoll || fallbackSoll) * 4 + (index % 3) * 5,
    monthIst: (liveSoll ? liveIst : fallbackIst) * 4 + (index % 4) * 3,
  }
})

export function AnalyticsPage() {
  const { currentUser } = useCurrentUser()
  const backPath = currentUser.role === 'Supervisor' || currentUser.role === 'Admin' ? '/supervisor' : '/robots'
  const [period, setPeriod] = useState<AnalyticsPeriod>('week')
  const sollKey = period === 'week' ? 'weekSoll' : 'monthSoll'
  const istKey = period === 'week' ? 'weekIst' : 'monthIst'
  const totalSoll = demoSollIstByRobot.reduce((sum, item) => sum + item[sollKey], 0)
  const totalIst = demoSollIstByRobot.reduce((sum, item) => sum + item[istKey], 0)
  const achievement = totalSoll > 0 ? Math.round((totalIst / totalSoll) * 100) : 0
  const missed = Math.max(totalSoll - totalIst, 0)
  const achievedCount = demoSollIstByRobot.filter((item) => item[istKey] >= item[sollKey]).length
  const chartData = demoSollIstByRobot.map((item) => ({
    anlage: item.robot,
    soll: item[sollKey],
    ist: item[istKey],
    achieved: item[istKey] >= item[sollKey],
    percent: Math.round((item[istKey] / item[sollKey]) * 100),
  }))

  return (
    <main className={pageShellClassName}>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <Link to={backPath} className="mb-2 inline-flex items-center gap-2 text-sm font-black text-blue-700">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {backPath === '/supervisor' ? 'Schichtleiter-Zentrale' : 'Anlagen-Auswahl'}
            </Link>
            <h1 className="text-2xl font-black tracking-normal text-slate-950">Soll / Ist Auswertung</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Sichtbar fuer alle / {currentUser.name} / {currentUser.role}
            </p>
          </div>

          <div className="grid w-fit grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(['week', 'month'] as AnalyticsPeriod[]).map((item) => (
              <button
                className={`h-10 rounded-lg px-4 text-sm font-black transition ${
                  period === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-950'
                }`}
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
              >
                {periodLabels[item]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 lg:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={<Target className="h-5 w-5" />} label="Soll" value={totalSoll.toString()} />
          <Metric icon={<TrendingUp className="h-5 w-5" />} label="Ist" value={totalIst.toString()} />
          <Metric icon={<AreaChartIcon className="h-5 w-5" />} label="Erreicht" value={`${achievement}%`} />
          <Metric icon={<Factory className="h-5 w-5" />} label="Anlagen OK" value={`${achievedCount}/${robots.length}`} />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <ChartCard
            title={`Soll / Ist Verlauf (${periodLabels[period]})`}
            subtitle="Soll ist das geplante Ziel. Ist zeigt, was tatsaechlich fertig gemeldet wurde."
          >
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="sollGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="istGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="anlage" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area
                  dataKey="soll"
                  fill="url(#sollGradient)"
                  name="Soll"
                  stroke="#64748b"
                  strokeWidth={2}
                  type="monotone"
                />
                <Area
                  dataKey="ist"
                  fill="url(#istGradient)"
                  name="Ist"
                  stroke="#2563eb"
                  strokeWidth={3}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <section className={`${cardClassName} p-5`}>
            <h2 className="text-lg font-black text-slate-950">Zieluebersicht</h2>
            <div className="mt-5 space-y-4">
              <SummaryRow label="Soll gesamt" value={totalSoll.toString()} />
              <SummaryRow label="Ist gesamt" value={totalIst.toString()} />
              <SummaryRow label="Fehlt zum Ziel" value={missed.toString()} tone={missed > 0 ? 'amber' : 'emerald'} />
              <SummaryRow label="Zielerreichung" value={`${achievement}%`} tone={achievement >= 100 ? 'emerald' : 'blue'} />
            </div>
          </section>
        </div>

        <div className="mt-5">
          <ChartCard
            title={`Ziele pro Anlage (${periodLabels[period]})`}
            subtitle="Vergleich von Soll-Menge und Ist-Menge pro Anlage."
          >
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="anlage" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="soll" fill="#cbd5e1" name="Soll" radius={[6, 6, 0, 0]} />
                <Bar dataKey="ist" fill="#2563eb" name="Ist" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <section className={`${cardClassName} mt-5 overflow-hidden`}>
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-black text-slate-950">Zielerreichung pro Anlage</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
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
                {chartData.map((item) => {
                  const robot = demoSollIstByRobot.find((entry) => entry.robot === item.anlage)

                  return (
                    <tr className="bg-white" key={item.anlage}>
                      <td className="px-4 py-3 font-black text-slate-950">{item.anlage}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">{robot?.assetId}</td>
                      <td className="px-4 py-3 text-right font-bold">{item.soll}</td>
                      <td className="px-4 py-3 text-right font-bold">{item.ist}</td>
                      <td className="px-4 py-3 text-right font-black">{item.percent}%</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-xl px-2.5 py-1 text-xs font-black ${
                          item.achieved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {item.achieved ? 'Ziel erreicht' : 'Unter Ziel'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  )
}

function ChartCard({ children, subtitle, title }: { children: React.ReactNode; subtitle: string; title: string }) {
  return (
    <section className={`${cardClassName} min-w-0 p-5`}>
      <div className="mb-4">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function SummaryRow({
  label,
  tone = 'slate',
  value,
}: {
  label: string
  tone?: 'amber' | 'blue' | 'emerald' | 'slate'
  value: string
}) {
  const toneClasses = {
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-50 text-slate-700',
  }

  return (
    <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${toneClasses[tone]}`}>
      <span className="text-sm font-black">{label}</span>
      <span className="text-lg font-black">{value}</span>
    </div>
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
