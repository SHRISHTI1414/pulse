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
      .catch(() => {})
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
    <header className="sticky top-0 z-50 border-b border-espresso-100 bg-white/90 backdrop-blur-md">
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 h-14 flex items-center gap-4">
        <NavLink to="/opportunities" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm shadow-brand-600/20 group-hover:shadow-brand-600/40 transition-shadow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M4 12C4 7.58 7.58 4 12 4C14.5 4 16.7 5.2 18.1 7.1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M20 12C20 16.42 16.42 20 12 20C9.5 20 7.3 18.8 5.9 16.9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          </div>
          <div className="leading-tight">
            <span className="font-display font-semibold text-espresso-900 text-lg tracking-tight">Pulse</span>
            <span className="hidden sm:block text-[11px] text-espresso-400 -mt-0.5">
              AI revenue recovery strategist
            </span>
          </div>
        </NavLink>

        <div className="hidden md:flex items-center gap-2 ml-4 px-3 py-1 rounded-full bg-cream-200/80 border border-espresso-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-espresso-600 font-medium">Brew Street · 12 outlets · Delhi-NCR</span>
        </div>

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
    return (
      <span className="text-[11px] text-espresso-400 italic px-2">
        delivery sim offline
      </span>
    )
  }
  const hostile = mode === 'hostile'
  return (
    <button
      onClick={onFlip}
      disabled={busy}
      className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 ${
        hostile
          ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 hover:border-amber-300'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300'
      }`}
      title={
        hostile
          ? 'Chaos mode: out-of-order delivery, duplicates, delays'
          : 'Smooth mode: ordered, on-time delivery'
      }
    >
      <span className={`inline-block w-2 h-2 rounded-full live-dot ${hostile ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      <span>
        Delivery: <span className="font-semibold">{hostile ? 'chaotic' : 'smooth'}</span>
      </span>
    </button>
  )
}
