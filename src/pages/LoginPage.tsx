import { ArrowRight, LockKeyhole, ScanLine } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { LoginSlideshow } from '../components/LoginSlideshow'
import { LogoMark } from '../components/LogoMark'
import { loginSlides } from '../data/loginSlides'
import { inputClassName, primaryButtonClassName } from '../styles/ui'
import { useCurrentUser } from '../users/useCurrentUser'

export function LoginPage() {
  const navigate = useNavigate()
  const { currentUser, setCurrentUserId, users } = useCurrentUser()
  const loginPath = currentUser.role === 'Supervisor' || currentUser.role === 'Admin' ? '/supervisor' : '/robots'
  const openWelderLiveView = () => {
    setCurrentUserId('user-viewer')
    navigate('/robots/ap2904/day')
  }

  return (
    <main className="grid min-h-svh bg-white text-slate-950 lg:grid-cols-2">
      <section className="flex min-h-svh items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-4">
            <LogoMark />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">
                Clinton Enterprise
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-normal text-slate-950">
                Clinton Enterprise
              </h1>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-white p-7 shadow-2xl shadow-slate-200/80 sm:p-8">
            <div className="mb-8">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                Anmeldung
              </p>
              <h2 className="text-2xl font-extrabold tracking-normal text-slate-950">
                Zur Produktionsplanung anmelden
              </h2>
            </div>

            <form className="grid gap-5">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Demo-Benutzer
                <select
                  className={inputClassName}
                  value={currentUser.id}
                  onChange={(event) => setCurrentUserId(event.target.value)}
                >
                  {users.map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.name} / {user.role} / {user.shift ? `${user.shift} Schicht` : 'schichtuebergreifend'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Benutzername
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={currentUser.name}
                  readOnly
                  className={inputClassName}
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Passwort
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="Demo-Modus - beliebiges Passwort"
                  className={inputClassName}
                />
              </label>

              <button
                type="button"
                className={`mt-3 ${primaryButtonClassName}`}
                onClick={() => navigate(loginPath)}
              >
                Anmelden
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">
                Schlosser / Schweisser
              </p>
              <p className="mt-1 text-sm font-bold leading-6 text-blue-950">
                Ohne Passwort direkt zur Live-Ansicht. Nur Lesen, QR und Druck.
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-100"
                onClick={openWelderLiveView}
              >
                <ScanLine className="h-4 w-4" aria-hidden="true" />
                Live-Plan oeffnen
              </button>
            </div>

            <p className="mt-8 text-sm leading-6 text-slate-500">
              Bediener melden den Produktionsstand. Schichtleiter planen die Woche. Schlosser und Schweisser nutzen Live-, QR- oder Druckansichten ohne Daten zu bearbeiten.
            </p>
          </div>
        </div>
      </section>

      <LoginSlideshow slides={loginSlides} />
    </main>
  )
}
