import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { CampaignStats, Debrief } from '../lib/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import ErrorState from '../components/ErrorState'
import FunnelBar from '../components/FunnelBar'

const POLL_MS = 2000
const ALLOWED_DEBRIEF_FACTS = new Set([
  'f_audience_size',
  'f_delivered',
  'f_read',
  'f_clicked',
  'f_failed',
  'f_attributed_orders',
  'f_recovered_revenue_inr',
  'f_recovery_rate_pct',
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
        `Simulated ${r.orders_simulated} returning customers — ${r.attributions_created} attributed to this campaign — ₹${r.recovered_revenue_inr.toLocaleString('en-IN')} recovered.`,
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
      <div className="flex items-center gap-2 text-gray-500 py-12">
        <Spinner size={18} /> Loading the campaign…
      </div>
    )
  }

  if (error && !stats) {
    return <ErrorState message={error} onRetry={fetchStats} />
  }
  if (!stats || !story) return null

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to={`/campaigns/${cid}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to campaign
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">Live campaign results</h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Updating every {POLL_MS / 1000}s · last refresh {Math.max(0, Math.round((Date.now() - lastTickAt) / 1000))}s ago
          </p>
        </div>
      </div>

      {/* Hero — recovered revenue */}
      <Card className="p-7 bg-gradient-to-br from-brand-600 to-brand-700 border-brand-700 text-white">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/70">Revenue recovered</div>
            <div className="mt-1 text-5xl font-semibold tabular-nums">
              ₹{stats.recovered_revenue_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <div className="mt-1 text-sm text-white/80">
              from {stats.attributed_orders.toLocaleString('en-IN')} attributed order{stats.attributed_orders === 1 ? '' : 's'} ·
              {' '}{stats.recovery_rate_pct.toFixed(1)}% of the audience came back
            </div>
          </div>
          <div className="hidden sm:block text-right">
            <div className="text-xs uppercase tracking-wider text-white/70">Sent to</div>
            <div className="text-2xl font-semibold tabular-nums">
              {stats.audience_size.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-white/70">customers</div>
          </div>
        </div>
      </Card>

      {/* The story */}
      <StoryStrip
        total={story.total}
        engaged={story.engaged}
        clicked={story.clicked}
        attributed={stats.attributed_orders}
      />

      {/* Simulation banner */}
      {simResult && (
        <div className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3 flex items-start gap-3">
          <span className="text-lg leading-none">✓</span>
          <p>{simResult}</p>
        </div>
      )}

      {/* Funnel */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delivery funnel</h2>
            <p className="text-xs text-gray-500">
              {story.total.toLocaleString('en-IN')} messages total · how many made it to the customer
            </p>
          </div>
        </div>
        <FunnelBar byStatus={stats.by_status} total={story.total} />
      </Card>

      {/* By channel */}
      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">By channel</h2>
        <p className="text-xs text-gray-500 mt-1">
          WhatsApp reaches further (read receipts available) but SMS catches everyone else.
        </p>
        <div className="mt-5 grid md:grid-cols-2 gap-6">
          {Object.entries(stats.by_channel).map(([channel, dist]) => {
            const channelTotal = Object.values(dist).reduce((a, b) => a + b, 0)
            return (
              <div key={channel}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                  </span>
                  <span className="text-xs text-gray-500">{channelTotal.toLocaleString('en-IN')} messages</span>
                </div>
                <FunnelBar byStatus={dist} total={channelTotal} />
              </div>
            )
          })}
        </div>
      </Card>

      {/* Recovery sim — explained */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Demo: simulate customers coming back</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              In a real run we'd wait days for engaged customers to walk in and order again.
              For this demo, click below to fast-forward: Pulse picks 25% of engaged customers,
              creates realistic returning orders for them, and attributes those orders to this
              campaign — exactly the same logic that fires on real order ingestion.
            </p>
          </div>
          <Button variant="secondary" onClick={runRecovery} disabled={simBusy}>
            {simBusy ? <><Spinner size={14} /> Simulating…</> : 'Fast-forward returning customers'}
          </Button>
        </div>
      </Card>

      {/* AI debrief */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900">AI debrief</h2>
            <p className="text-xs text-gray-500 mt-1">
              A short narrative — cites only the campaign's measured stats, never invented numbers.
            </p>
          </div>
          <Button variant="secondary" onClick={runDebrief} disabled={debriefing}>
            {debriefing ? <><Spinner size={14} /> Writing…</> : debrief ? 'Re-generate' : 'Generate debrief'}
          </Button>
        </div>
        {debrief && (
          <div className="mt-5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
              ✦
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-gray-800">
                {renderDebriefText(debrief.narrative, stats)}
              </div>
              <div className="bg-brand-50 border border-brand-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-gray-800">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-700 block mb-1">
                  What I'd try next
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

// ── Story strip — turns numbers into a sentence with arrows ──────────────

function StoryStrip({
  total,
  engaged,
  clicked,
  attributed,
}: {
  total: number
  engaged: number
  clicked: number
  attributed: number
}) {
  const cells: { value: number; label: string; sub: string }[] = [
    { value: total, label: 'sent', sub: 'messages dispatched' },
    { value: engaged, label: 'saw the message', sub: 'delivered or opened' },
    { value: clicked, label: 'tapped the link', sub: 'highest engagement signal' },
    { value: attributed, label: 'came back to order', sub: 'attributed within 7 days' },
  ]
  return (
    <Card className="p-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cells.map((c, i) => (
          <div key={i} className="relative">
            <div className="text-2xl font-semibold text-gray-900 tabular-nums">
              {c.value.toLocaleString('en-IN')}
            </div>
            <div className="text-sm text-gray-700 mt-0.5">{c.label}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{c.sub}</div>
            {i < cells.length - 1 && (
              <div className="absolute top-2 -right-2 hidden sm:block text-gray-300">→</div>
            )}
          </div>
        ))}
      </div>
    </Card>
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
