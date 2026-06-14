// Screen 4 — "Pulse is tracking recovered revenue from this campaign"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { CampaignStats, Debrief } from '../lib/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import ErrorState from '../components/ErrorState'
import FunnelBar from '../components/FunnelBar'
import PageGuide from '../components/PageGuide'
import ConversionPipeline from '../components/ConversionPipeline'

const POLL_MS = 2000
const ALLOWED_DEBRIEF_FACTS = new Set([
  'f_audience_size', 'f_delivered', 'f_read', 'f_clicked', 'f_failed',
  'f_attributed_orders', 'f_recovered_revenue_inr', 'f_recovery_rate_pct',
])

export default function Results() {
  const { id } = useParams<{ id: string }>()
  const cid = Number(id)

  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [debriefing, setDebriefing] = useState(false)
  const [simBusy, setSimBusy] = useState(false)
  const [simResult, setSimResult] = useState<string | null>(null)
  const [lastTickAt, setLastTickAt] = useState<number>(Date.now())

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.campaignStats(cid)
      setStats(s)
      setLastTickAt(Date.now())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [cid])

  useEffect(() => {
    fetchStats()
    const t = setInterval(fetchStats, POLL_MS)
    return () => clearInterval(t)
  }, [fetchStats])

  const runRecovery = async () => {
    setSimBusy(true)
    setSimResult(null)
    try {
      const r = await api.simulateRecovery(cid, 0.25)
      setSimResult(
        `Simulated ${r.orders_simulated} returning customers — ${r.attributions_created} attributed — ₹${r.recovered_revenue_inr.toLocaleString('en-IN')} recovered.`,
      )
      await fetchStats()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSimBusy(false)
    }
  }

  const runDebrief = async () => {
    setDebriefing(true)
    try {
      const d = await api.campaignDebrief(cid)
      setDebrief(d)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDebriefing(false)
    }
  }

  const story = useMemo(() => {
    if (!stats) return null
    const total = Object.values(stats.by_status).reduce((a, b) => a + b, 0)
    const engaged =
      (stats.by_status.delivered ?? 0) +
      (stats.by_status.read ?? 0) +
      (stats.by_status.clicked ?? 0)
    const clicked = stats.by_status.clicked ?? 0
    const failed = stats.by_status.failed ?? 0
    return { total, engaged, clicked, failed }
  }, [stats])

  if (!stats && !error) {
    return (
      <div className="flex items-center gap-3 text-espresso-400 py-16 justify-center">
        <Spinner size={20} /> <span className="text-sm">Loading recovery results…</span>
      </div>
    )
  }

  if (error && !stats) return <ErrorState message={error} onRetry={fetchStats} />
  if (!stats || !story) return null

  const secsAgo = Math.max(0, Math.round((Date.now() - lastTickAt) / 1000))

  return (
    <div className="space-y-8">
      <PageGuide variant="results" />

      {/* Recovery step indicator — all complete */}
      <div className="flex items-center gap-1 flex-wrap">
        {[
          { label: 'Leak found' },
          { label: 'Investigated' },
          { label: 'Sent recovery' },
          { label: 'Revenue recovered' },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <div className="w-6 h-px bg-emerald-300" />}
            <div className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                i < 3 ? 'bg-emerald-500 text-white' : 'bg-brand-600 text-white'
              }`}>
                {i < 3 ? '✓' : '4'}
              </span>
              <span className={`text-xs font-medium ${i === 3 ? 'text-brand-700' : 'text-espresso-600'}`}>
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            to={`/campaigns/${cid}`}
            className="inline-flex items-center gap-1.5 text-sm text-espresso-400 hover:text-brand-600 font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Recovery campaign
          </Link>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-semibold text-espresso-900">
            Revenue recovered
          </h1>
          <p className="text-sm text-espresso-400 mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot" />
              Live
            </span>
            Tracking revenue · refreshed {secsAgo}s ago
          </p>
        </div>
      </div>

      {/* AI RECOVERY SCORECARD HERO */}
      <Card className="hero-glow p-8 sm:p-10 bg-gradient-to-br from-brand-600 via-brand-600 to-brand-700 border-brand-700 text-white overflow-hidden relative">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 mb-5">
            <span className="w-7 h-7 rounded-lg bg-white text-brand-700 flex items-center justify-center text-[10px] font-bold">AI</span>
            <span className="text-xs text-white/70 font-medium">Recovery report</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-8 items-end">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/50 font-semibold">
                Revenue recovered from this leak
              </div>
              <div className="mt-2 font-display text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight">
                ₹{stats.recovered_revenue_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">
                {stats.attributed_orders.toLocaleString('en-IN')} customer{stats.attributed_orders === 1 ? '' : 's'} came back ·{' '}
                <span className="text-white font-semibold">{stats.recovery_rate_pct.toFixed(1)}%</span> of audience returned
              </p>
            </div>
            <div>
              <div className="p-4 rounded-xl bg-white/10 border border-white/15 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-white/40">Sent</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{stats.audience_size.toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-white/40">Engaged</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{story.engaged.toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-white/40">Clicked</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{story.clicked.toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-white/40">Returned</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{stats.attributed_orders.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* HOW MESSAGES BECAME REVENUE — pipeline */}
      <Card className="p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-espresso-400">
          How your messages became revenue
        </h2>
        <p className="text-sm text-espresso-400 mt-1 mb-5">
          Each row shows how many customers moved to the next stage of recovery.
        </p>
        <ConversionPipeline
          steps={[
            { value: story.total, label: 'Sent', sub: 'Recovery messages dispatched', color: 'bg-espresso-500' },
            { value: story.engaged, label: 'Engaged', sub: 'Delivered or opened', color: 'bg-blue-500' },
            { value: story.clicked, label: 'Clicked', sub: 'Tapped recovery offer', color: 'bg-emerald-500' },
            { value: stats.attributed_orders, label: 'Returned', sub: 'Came back and ordered', color: 'bg-brand-500' },
          ]}
        />
        <p className="text-xs text-espresso-400 mt-4">Revenue attributed via 7-day last-touch model</p>
      </Card>

      {simResult && (
        <div className="flex items-start gap-3 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4">
          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
            ✓
          </div>
          <p className="leading-relaxed">{simResult}</p>
        </div>
      )}

      {/* Delivery breakdown (compressed) */}
      <Card className="p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-espresso-400">
          Delivery breakdown
        </h2>
        <p className="text-sm text-espresso-400 mt-1">
          {story.total.toLocaleString('en-IN')} messages · how many reached the customer
        </p>
        <div className="mt-4">
          <FunnelBar byStatus={stats.by_status} total={story.total} />
        </div>
        <p className="text-xs text-espresso-400 mt-3">
          {Object.entries(stats.by_channel).map(([ch, dist]) => {
            const t = Object.values(dist).reduce((a, b) => a + b, 0)
            return `${ch === 'whatsapp' ? 'WhatsApp' : 'SMS'}: ${t.toLocaleString('en-IN')} messages`
          }).join(' · ')}
        </p>
      </Card>

      {/* Demo simulation — clearly labeled */}
      <div className="px-5 py-4 rounded-xl border border-dashed border-espresso-200 bg-cream-50">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 border border-amber-200 text-[10px] font-bold text-amber-700 uppercase tracking-wide shrink-0 mt-0.5">
              Demo
            </span>
            <div>
              <p className="text-sm font-semibold text-espresso-800">Fast-forward customer returns</p>
              <p className="text-sm text-espresso-500 mt-1 leading-relaxed">
                Simulates 25% of engaged customers placing orders. Uses the same 7-day attribution as real orders.
                In production, you'd wait days for real returns to accumulate.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={runRecovery} disabled={simBusy} className="shrink-0">
            {simBusy ? <><Spinner size={14} /> Simulating…</> : 'Simulate returns'}
          </Button>
        </div>
      </div>

      {/* AI RECOVERY DEBRIEF */}
      <Card className="p-6 border-brand-200 border-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-espresso-400">
              AI recovery debrief
            </h2>
            <p className="text-sm text-espresso-400 mt-1">
              Narrative grounded in measured stats — no invented numbers.
            </p>
          </div>
          <Button variant="secondary" onClick={runDebrief} disabled={debriefing}>
            {debriefing ? <><Spinner size={14} /> Writing…</> : debrief ? 'Re-generate' : 'Generate debrief'}
          </Button>
        </div>
        {debrief && (
          <div className="mt-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-espresso-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
              AI
            </div>
            <div className="flex-1 min-w-0 space-y-4">
              <div className="bg-cream-50 border border-espresso-100 rounded-2xl rounded-tl-md px-5 py-4 text-sm leading-relaxed text-espresso-800">
                {renderDebriefText(debrief.narrative, stats)}
              </div>
              <div className="bg-brand-50 border border-brand-100 rounded-2xl rounded-tl-md px-5 py-4 text-sm leading-relaxed text-espresso-800">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700 block mb-2">
                  Next recovery action
                </span>
                {renderDebriefText(debrief.what_id_try_next, stats)}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function renderDebriefText(text: string, stats: CampaignStats) {
  const replacements: Record<string, string> = {
    f_audience_size: stats.audience_size.toLocaleString('en-IN'),
    f_delivered: (
      (stats.by_status.delivered ?? 0) + (stats.by_status.read ?? 0) + (stats.by_status.clicked ?? 0)
    ).toLocaleString('en-IN'),
    f_read: (
      (stats.by_status.read ?? 0) + (stats.by_status.clicked ?? 0)
    ).toLocaleString('en-IN'),
    f_clicked: (stats.by_status.clicked ?? 0).toLocaleString('en-IN'),
    f_failed: (stats.by_status.failed ?? 0).toLocaleString('en-IN'),
    f_attributed_orders: stats.attributed_orders.toLocaleString('en-IN'),
    f_recovered_revenue_inr: `₹${stats.recovered_revenue_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
    f_recovery_rate_pct: `${stats.recovery_rate_pct.toFixed(1)}%`,
  }
  return text.replace(/\{fact:([a-zA-Z0-9_]+)\}/g, (_, id) => {
    if (!ALLOWED_DEBRIEF_FACTS.has(id)) return `[${id}]`
    return replacements[id] ?? `[${id}]`
  })
}
