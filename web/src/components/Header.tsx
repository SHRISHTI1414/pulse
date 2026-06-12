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
      .catch(() => { /* fail quietly */ })
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
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
        <NavLink to="/opportunities" className="flex items-baseline gap-2">
          <span className="font-semibold text-brand-600 text-xl tracking-tight">Pulse</span>
          <span className="text-gray-400 text-xs hidden sm:inline">
            — find the revenue your customers are quietly walking away with
          </span>
        </NavLink>

        <div className="ml-auto flex items-center gap-3">
          <DemoModeToggle mode={cfg?.mode ?? null} busy={busy} onFlip={flip} />
        </div>
      </div>
    </header>
  )
}

function DemoModeToggle({
  mode,
  busy,
  onFlip,
}: {
  mode: 'calm' | 'hostile' | null
  busy: boolean
  onFlip: () => void
}) {
  if (mode === null) {
    return <span className="text-xs text-gray-400 italic">channel service offline</span>
  }
  const hostile = mode === 'hostile'
  return (
    <button
      onClick={onFlip}
      disabled={busy}
      className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
        hostile
          ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
      }`}
      title={
        hostile
          ? 'Simulated chaos: messages arrive out of order, with duplicates and delays. Tests system resilience.'
          : 'Smooth delivery: messages arrive in order, on time, no duplicates.'
      }
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${hostile ? 'bg-amber-500' : 'bg-emerald-500'}`}
      />
      <span>Delivery sim: <span className="font-semibold">{hostile ? 'chaotic' : 'smooth'}</span></span>
    </button>
  )
}
