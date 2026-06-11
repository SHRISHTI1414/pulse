import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../lib/api'
import type { ChannelConfig } from '../lib/types'

export default function Header() {
  const [cfg, setCfg] = useState<ChannelConfig | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getChannelConfig()
      .then((c) => { if (!cancelled) setCfg(c) })
      .catch(() => { /* fail quietly — channel-service may be down */ })
    return () => { cancelled = true }
  }, [])

  const flip = async () => {
    if (!cfg) return
    setBusy(true)
    try {
      const next = cfg.mode === 'calm' ? 'hostile' : 'calm'
      const updated = await api.setChannelConfig(next)
      setCfg({ ...cfg, ...updated })
    } catch {
      /* swallow */
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
        <NavLink to="/opportunities" className="font-semibold text-gray-900 text-lg tracking-tight">
          <span className="text-brand-600">Pulse</span>
          <span className="text-gray-400 text-sm font-normal ml-2">Brew Street CRM</span>
        </NavLink>

        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <NavTab to="/opportunities">Opportunities</NavTab>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ChaosToggle mode={cfg?.mode ?? null} busy={busy} onFlip={flip} />
        </div>
      </div>
    </header>
  )
}

function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md transition-colors ${
          isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function ChaosToggle({
  mode,
  busy,
  onFlip,
}: {
  mode: 'calm' | 'hostile' | null
  busy: boolean
  onFlip: () => void
}) {
  if (mode === null) {
    return (
      <span className="text-xs text-gray-400">channel-service offline</span>
    )
  }
  const hostile = mode === 'hostile'
  return (
    <button
      onClick={onFlip}
      disabled={busy}
      className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
        hostile
          ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
      }`}
      title="Toggle channel-service chaos mode"
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${hostile ? 'bg-red-500' : 'bg-emerald-500'}`}
      />
      <span className="uppercase tracking-wide">{mode}</span>
    </button>
  )
}
