// Screen 1 — "Here is the revenue you are losing"
// Pure summary. Hero ribbon, three cohort cards, recent activity.
// Clicking a card navigates to the Cohort Detail screen (Screen 2).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Opportunity } from '../lib/types'
import { ACCENT_CLASSES, cohortMeta } from '../lib/cohort'
import Button from '../components/Button'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'

export default function Opportunities() {
  const navigate = useNavigate()
  const [opps, setOpps] = useState<Opportunity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [busyDismiss, setBusyDismiss] = useState<number | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await api.listOpportunities()
      setOpps(list)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const list = await api.generateOpportunities()
      setOpps(list)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const onDismiss = async (oid: number) => {
    setBusyDismiss(oid)
    try {
      await api.patchOpportunity(oid, 'dismissed')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyDismiss(null)
    }
  }

  // De-duplicate to the LATEST opportunity per cohort. The backend keeps
  // history; the home should only show the current state.
  const { activeCohorts, dismissed } = useMemo(() => {
    const active: Opportunity[] = []
    const dismissed: Opportunity[] = []
    if (!opps) return { activeCohorts: active, dismissed }

    // Group by cohort_ref, latest id wins.
    const latestPerCohort = new Map<string, Opportunity>()
    for (const o of opps) {
      const ref = o.cohort_definition.cohort_ref
      if (!ref) continue
      const prev = latestPerCohort.get(ref)
      if (!prev || o.id > prev.id) latestPerCohort.set(ref, o)
    }

    for (const o of latestPerCohort.values()) {
      if (o.status === 'dismissed') dismissed.push(o)
      else active.push(o)
    }
    active.sort((a, b) => a.priority_rank - b.priority_rank)
    return { activeCohorts: active, dismissed }
  }, [opps])

  // Headline number — annualised revenue at risk from the lapsed cohort.
  const headlineValue = useMemo(() => {
    if (!activeCohorts.length) return null
    const lapsed = activeCohorts.find((o) => o.cohort_definition.cohort_ref === 'lapsed_regulars')
    if (!lapsed) return null
    const f = lapsed.facts.find((x) => x.fact_id === 'f_lapsed_annualized_value')
    if (!f || typeof f.value !== 'number') return null
    return f.value
  }, [activeCohorts])

  return (
    <div className="space-y-10">
      {/* Title row */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Revenue intelligence
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            How much revenue is quietly walking out — and which groups it's leaving with.
          </p>
        </div>
        <Button
          onClick={onGenerate}
          disabled={generating}
          variant={activeCohorts.length ? 'secondary' : 'primary'}
        >
          {generating ? <><Spinner size={14} /> Asking AI…</> : (activeCohorts.length ? 'Re-analyse' : 'Find opportunities')}
        </Button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Hero ribbon — separate from cards by design */}
      {headlineValue !== null && <HeroRibbon valueInr={headlineValue} />}

      {!opps && !error && (
        <div className="flex items-center gap-2 text-gray-500 py-12">
          <Spinner size={18} /> Loading…
        </div>
      )}

      {opps && activeCohorts.length === 0 && dismissed.length === 0 && !error && (
        <EmptyState
          title="No analysis yet"
          message="Ask Pulse to look through your customer base and find where revenue is leaking."
          action={
            <Button onClick={onGenerate} disabled={generating}>
              {generating ? 'Asking AI…' : 'Find opportunities'}
            </Button>
          }
        />
      )}

      {/* Active cohort cards — clickable, navigate to detail */}
      {activeCohorts.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Customer groups slipping away
          </h2>
          <div className="grid lg:grid-cols-3 gap-4">
            {activeCohorts.map((o) => (
              <OpportunityCard
                key={o.id}
                opp={o}
                onOpen={() => navigate(`/opportunities/${o.id}`)}
                onDismiss={() => onDismiss(o.id)}
                dismissing={busyDismiss === o.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Dismissed cohorts — greyed at bottom */}
      {dismissed.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
            Dismissed · not now
          </h2>
          <div className="grid lg:grid-cols-3 gap-4">
            {dismissed.map((o) => (
              <DismissedCard key={o.id} opp={o} onRestore={async () => {
                setBusyDismiss(o.id)
                try {
                  await api.patchOpportunity(o.id, 'open')
                  await load()
                } finally { setBusyDismiss(null) }
              }} />
            ))}
          </div>
        </section>
      )}

      <RecentActivity opps={opps ?? []} />
    </div>
  )
}

// ── Hero ribbon ───────────────────────────────────────────────────────────

function HeroRibbon({ valueInr }: { valueInr: number }) {
  const lakhs = valueInr / 100000
  return (
    <Card className="p-7 sm:p-8 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-900 text-white relative overflow-hidden">
      <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-brand-600/10 blur-3xl" aria-hidden />
      <div className="relative flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-white/60">
            Revenue at risk this year
          </div>
          <div className="mt-1 text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight">
            ₹{lakhs.toFixed(1)}<span className="text-3xl text-white/70 ml-1.5">lakh</span>
          </div>
          <div className="mt-2 text-sm text-white/70 max-w-md">
            Annual value of customers who used to be regulars and have quietly stopped ordering.
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-widest text-white/60">
            Recovered this period
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums text-white/90">₹0</div>
          <div className="mt-1 text-xs text-white/60">
            Send a campaign below to start
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── Active opportunity card ───────────────────────────────────────────────

function OpportunityCard({
  opp,
  onOpen,
  onDismiss,
  dismissing,
}: {
  opp: Opportunity
  onOpen: () => void
  onDismiss: () => void
  dismissing: boolean
}) {
  const cohort = cohortMeta(opp.cohort_definition.cohort_ref)
  const accent = cohort ? ACCENT_CLASSES[cohort.accent] : ACCENT_CLASSES.gray

  // Hero number per cohort: lapsed → ₹ at risk; others → customer count.
  const heroFact = opp.facts.find((f) =>
    f.fact_id === 'f_lapsed_annualized_value' ||
    f.fact_id === 'f_drift_size' ||
    f.fact_id === 'f_festive_size',
  )
  let heroDisplay = '—'
  let heroUnit = ''
  if (heroFact && typeof heroFact.value === 'number') {
    if (heroFact.fact_id === 'f_lapsed_annualized_value') {
      heroDisplay = `₹${(heroFact.value / 100000).toFixed(1)}L`
      heroUnit = 'at risk / year'
    } else {
      heroDisplay = heroFact.value.toLocaleString('en-IN')
      heroUnit = 'customers slipping'
    }
  }

  const filledDot = opp.priority_rank === 1

  return (
    <button
      onClick={onOpen}
      className="text-left bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all overflow-hidden group flex flex-col"
    >
      <div className={`h-1 w-full ${accent.bar}`} />
      <div className="p-5 flex-1 flex flex-col">
        {/* Priority + cohort label */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border ${accent.badge}`}>
            {filledDot ? '●' : '○'} Priority {opp.priority_rank}
          </span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-500">{cohort?.shortLabel ?? '—'}</span>
        </div>

        {/* Title — plain English */}
        <h3 className="mt-3 text-lg font-semibold text-gray-900 leading-snug">
          {cohort?.title ?? opp.title}
        </h3>

        {/* Hero number for this card */}
        <div className="mt-4">
          <div className="text-3xl font-semibold text-gray-900 tabular-nums">{heroDisplay}</div>
          <div className="text-xs text-gray-500 mt-0.5">{heroUnit}</div>
        </div>

        {/* AI recommendation — one sentence */}
        {opp.cohort_definition.recommended_action && (
          <div className="mt-5 pt-4 border-t border-gray-100 flex items-start gap-2">
            <span className="inline-flex w-4 h-4 rounded-full bg-gray-900 text-white items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
              ✦
            </span>
            <p className="text-sm text-gray-700 leading-snug">
              {opp.cohort_definition.recommended_action}
            </p>
          </div>
        )}

        <div className="flex-1" />

        {/* Footer actions */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss() }}
            disabled={dismissing}
            className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50"
          >
            {dismissing ? 'Dismissing…' : 'Dismiss'}
          </button>
          <span className="text-brand-700 font-medium group-hover:translate-x-0.5 transition-transform">
            See the customers →
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Dismissed card ───────────────────────────────────────────────────────

function DismissedCard({
  opp,
  onRestore,
}: {
  opp: Opportunity
  onRestore: () => void
}) {
  const cohort = cohortMeta(opp.cohort_definition.cohort_ref)
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 opacity-70 hover:opacity-100 transition-opacity">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
          Dismissed
        </span>
        <span>·</span>
        <span>{cohort?.shortLabel ?? '—'}</span>
      </div>
      <h3 className="mt-2 text-sm font-medium text-gray-700 leading-snug">
        {cohort?.title ?? opp.title}
      </h3>
      <button
        onClick={onRestore}
        className="mt-3 text-xs text-gray-500 hover:text-gray-900"
      >
        Restore →
      </button>
    </div>
  )
}

// ── Recent activity strip ────────────────────────────────────────────────

function RecentActivity({ opps }: { opps: Opportunity[] }) {
  if (opps.length === 0) return null
  // Group activity entries: latest generation + recent dismissals.
  const generations: { generatedAt: string; count: number }[] = []
  const seen = new Set<string>()
  for (const o of opps) {
    if (!seen.has(o.generated_at)) {
      seen.add(o.generated_at)
      generations.push({
        generatedAt: o.generated_at,
        count: opps.filter((x) => x.generated_at === o.generated_at).length,
      })
    }
  }
  generations.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  const items = generations.slice(0, 4)
  if (items.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
        Recent activity
      </h2>
      <ul className="space-y-2">
        {items.map((g) => (
          <li key={g.generatedAt} className="flex items-center gap-2 text-sm text-gray-600">
            <span className="inline-flex w-5 h-5 rounded-full bg-gray-900 text-white items-center justify-center text-[10px] font-bold shrink-0">
              ✦
            </span>
            <span>
              <span className="text-gray-400">{formatAge(g.generatedAt)} ·</span>{' '}
              AI re-analysed customer base · found {g.count} cohort{g.count === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatAge(iso: string): string {
  try {
    const d = new Date(iso)
    const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin} min ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    return `${diffD}d ago`
  } catch {
    return iso
  }
}
