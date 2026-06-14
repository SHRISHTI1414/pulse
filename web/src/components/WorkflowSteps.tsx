import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

const STEPS = [
  {
    num: 1,
    label: 'Leakage detected',
    desc: 'AI found revenue at risk',
    match: (p: string) => p === '/opportunities' || p.startsWith('/opportunities/'),
  },
  {
    num: 2,
    label: 'Why you\'re losing',
    desc: 'Evidence & customers',
    match: (p: string) => p.startsWith('/opportunities/') && p !== '/opportunities',
  },
  {
    num: 3,
    label: 'Recovery campaign',
    desc: 'AI-drafted win-back',
    match: (p: string) => p.startsWith('/campaigns/') && !p.endsWith('/results'),
  },
  {
    num: 4,
    label: 'Revenue recovered',
    desc: 'Attributed results',
    match: (p: string) => p.endsWith('/results'),
  },
] as const

const iconSvg = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconBadge({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'success' | 'warning' }) {
  const cls = variant === 'success' ? 'bg-emerald-50 text-emerald-600'
    : variant === 'warning' ? 'bg-amber-50 text-amber-600'
    : 'bg-brand-50 text-brand-600'
  return (
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
      {children}
    </div>
  )
}

function Metric({ icon, value, label, sub }: { icon: ReactNode; value: string; label: string; sub: string }) {
  return (
    <div className="flex items-start gap-3 px-1">
      {icon}
      <div className="min-w-0">
        <div className="text-sm font-bold text-espresso-900 leading-tight">{value}</div>
        <div className="text-[11px] text-espresso-500 leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-espresso-400 leading-tight">{sub}</div>}
      </div>
    </div>
  )
}

export default function WorkflowSteps({ compact = false }: { compact?: boolean }) {
  const { pathname } = useLocation()
  const activeIdx = STEPS.findIndex((s) => s.match(pathname))

  if (compact) {
    return (
      <div className="flex items-center gap-1 min-w-max">
        {STEPS.map((step, i) => {
          const active = i === activeIdx
          const done = activeIdx > i
          return (
            <div key={step.num} className="flex items-center gap-1">
              {i > 0 && <span className="text-espresso-200 text-xs mx-0.5">→</span>}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'bg-brand-600 text-white'
                    : done
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-espresso-50 text-espresso-400'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  active ? 'bg-white/20' : done ? 'bg-brand-200 text-brand-800' : 'bg-espresso-100'
                }`}>
                  {done ? '✓' : step.num}
                </span>
                {step.label}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <nav aria-label="Sidebar" className="flex flex-col h-full">
      <div className="p-5 rounded-xl bg-gradient-to-br from-brand-800 to-espresso-900 text-white mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg bg-brand-500/30 border border-brand-400/20 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold tracking-tight text-center leading-tight">Brew<br/>Street</span>
          </div>
          <div>
            <div className="text-base font-bold text-white leading-tight">Brew Street</div>
            <div className="text-[11px] text-white/50 mt-0.5">12 outlets across Delhi-NCR</div>
          </div>
        </div>

        <div className="h-px bg-white/10 mb-3.5" />

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Outlets</div>
            <div className="text-sm font-bold text-white/90">12</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Region</div>
            <div className="text-sm font-bold text-white/90">Delhi-NCR</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Customers</div>
            <div className="text-sm font-bold text-white/90">6,000</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Revenue</div>
            <div className="text-sm font-bold text-white/90">₹2.4 Cr</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Orders (30d)</div>
            <div className="text-sm font-bold text-white/90">1.2 Lakh</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">Delivery</div>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Smooth
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-espresso-400 mb-3 px-1">
          Customer Insights
        </h3>
        <div className="space-y-3.5">
          <Metric
            icon={<IconBadge variant="warning"><svg {...iconSvg}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg></IconBadge>}
            value="1,273" label="At-risk customers" sub="(21% of total)"
          />
          <Metric
            icon={<IconBadge><svg {...iconSvg}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" /></svg></IconBadge>}
            value="3.2 Orders" label="Avg. orders per" sub="customer"
          />
          <Metric
            icon={<IconBadge><svg {...iconSvg}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg></IconBadge>}
            value="₹542" label="Avg. order value" sub=""
          />
          <Metric
            icon={<IconBadge><svg {...iconSvg}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></IconBadge>}
            value="12.5 Days" label="Avg. time since" sub="last order"
          />
        </div>
      </div>

      <div className="flex-1" />

      <div className="p-3.5 rounded-xl bg-brand-50/80 border border-brand-100">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-md bg-brand-100 text-brand-600 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-espresso-700">Want a quick tour?</p>
            <p className="text-[11px] text-brand-600 font-semibold mt-0.5">See how Pulse works →</p>
          </div>
        </div>
      </div>
    </nav>
  )
}
