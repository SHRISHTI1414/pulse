import { useCallback, useEffect, useState } from 'react'
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

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.campaignStats(cid)
      setStats(s)
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
        `Simulated ${r.orders_simulated} orders → ${r.attributions_created} attributions → ₹${r.recovered_revenue_inr.toLocaleString('en-IN')}`,
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

  if (!stats && !error) {
    return (
      <div className="flex items-center gap-2 text-gray-500 py-12">
        <Spinner size={18} /> Loading stats…
      </div>
    )
  }

  if (error && !stats) {
    return <ErrorState message={error} onRetry={fetchStats} />
  }

  if (!stats) return null

  const totalMessages = Object.values(stats.by_status).reduce((a, b) => a + b, 0)
  const engaged =
    (stats.by_status.delivered ?? 0) +
    (stats.by_status.read ?? 0) +
    (stats.by_status.clicked ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={`/campaigns/${cid}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← Campaign
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">Results</h1>
          <p className="text-sm text-gray-500 mt-1">Polling every {POLL_MS / 1000}s</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={runRecovery} disabled={simBusy}>
            {simBusy ? <><Spinner size={14} /> Simulating…</> : 'Simulate recovery'}
          </Button>
        </div>
      </div>

      {simResult && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          {simResult}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Audience" value={stats.audience_size.toLocaleString('en-IN')} />
        <Stat label="Engaged (delivered+)" value={engaged.toLocaleString('en-IN')} />
        <Stat
          label="Recovered revenue"
          value={`₹${stats.recovered_revenue_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          emphasis
        />
        <Stat label="Recovery rate" value={`${stats.recovery_rate_pct.toFixed(1)}%`} />
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">Funnel</h2>
        <p className="text-xs text-gray-500 mt-1">{totalMessages.toLocaleString('en-IN')} messages</p>
        <div className="mt-4">
          <FunnelBar byStatus={stats.by_status} total={totalMessages} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">By channel</h2>
        <div className="mt-4 grid sm:grid-cols-2 gap-6">
          {Object.entries(stats.by_channel).map(([channel, dist]) => {
            const channelTotal = Object.values(dist).reduce((a, b) => a + b, 0)
            return (
              <div key={channel}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 uppercase">{channel}</span>
                  <span className="text-xs text-gray-500">{channelTotal.toLocaleString('en-IN')}</span>
                </div>
                <FunnelBar byStatus={dist} total={channelTotal} />
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">AI debrief</h2>
            <p className="text-xs text-gray-500 mt-1">
              A narrative summary that cites only the campaign's computed stats.
            </p>
          </div>
          <Button variant="secondary" onClick={runDebrief} disabled={debriefing}>
            {debriefing ? <><Spinner size={14} /> Writing…</> : debrief ? 'Re-generate' : 'Generate debrief'}
          </Button>
        </div>
        {debrief && (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-relaxed text-gray-800">
              {renderDebriefText(debrief.narrative, stats)}
            </p>
            <div className="border-t border-gray-100 pt-3">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400 mr-2">
                What I'd try next
              </span>
              <span className="text-sm text-gray-800">
                {renderDebriefText(debrief.what_id_try_next, stats)}
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          emphasis ? 'text-brand-600' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </Card>
  )
}

// Render debrief text — the LLM cites stat-facts as {fact:fX}. We resolve those
// to the live values from `stats` so the reader sees real numbers, not placeholders.
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
