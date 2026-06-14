// Screen 1 — "Pulse detected revenue leaking from your customer base"

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
import PageGuide from '../components/PageGuide'
import RecoveryMeter, { recoveryLevelFromRef } from '../components/RecoveryMeter'

export default function Opportunities() {
  const navigate = useNavigate()
  const [opps, setOpps] = useState<Opportunity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [busyDismiss, setBusyDismiss] = useState<number | null>(null)
  const [showHowItWorks, setShowHowItWorks] = useState(false)

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

  const { activeCohorts, dismissed } = useMemo(() => {
    const active: Opportunity[] = []
    const dismissed: Opportunity[] = []
    if (!opps) return { activeCohorts: active, dismissed }

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

  const totalAtRisk = useMemo(() => {
    let total = 0
    for (const o of activeCohorts) {
      const f = o.facts.find((x) => x.fact_id === 'f_lapsed_annualized_value')
      if (f && typeof f.value === 'number') total += f.value
    }
    return total
  }, [activeCohorts])

  const totalCustomers = useMemo(() => {
    let total = 0
    for (const o of activeCohorts) {
      const sizeKey = `f_${o.cohort_definition.cohort_ref?.replace('_regulars', '').replace('_drift', '').replace('_onetimers', '')}_size`
      const f = o.facts.find((x) => x.fact_id === sizeKey)
        || o.facts.find((x) => x.fact_id === 'f_lapsed_size')
        || o.facts.find((x) => x.fact_id === 'f_drift_size')
        || o.facts.find((x) => x.fact_id === 'f_festive_size')
      if (f && typeof f.value === 'number') total += f.value
    }
    return total
  }, [activeCohorts])

  const hasData = activeCohorts.length > 0

  return (
    <div className="space-y-8">
      {error && <ErrorState message={error} onRetry={load} />}

      {!opps && !error && (
        <div className="flex items-center gap-3 text-espresso-400 py-16 justify-center">
          <Spinner size={20} />
          <span className="text-sm">Loading revenue intelligence…</span>
        </div>
      )}

      {opps && activeCohorts.length === 0 && dismissed.length === 0 && !error && (
        <EmptyState
          title="No leaks detected yet"
          message="Hit 'Scan for revenue leaks' and Pulse will analyse your customer base for segments where revenue is quietly leaking."
          action={
            <Button onClick={onGenerate} disabled={generating} size="lg">
              {generating ? <><Spinner size={16} /> Scanning 6,000 customers…</> : 'Scan for revenue leaks →'}
            </Button>
          }
        />
      )}

      {/* AI STRATEGIST HERO — "I detected revenue leaking" */}
      {hasData && (
        <Card className="hero-glow p-10 sm:p-14 bg-gradient-to-br from-espresso-900 via-espresso-800 to-espresso-900 border-espresso-700 text-white overflow-hidden relative">
          <div className="absolute -top-16 -right-16 w-96 h-96 rounded-full bg-brand-500/15 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 mb-5">
              <span className="w-7 h-7 rounded-lg bg-white text-espresso-900 flex items-center justify-center text-[10px] font-bold">AI</span>
              <span className="text-xs text-white/70 font-medium uppercase tracking-wider">Pulse strategist</span>
            </div>

            <p className="text-lg text-white/60 mb-4">
              I analyzed 6,000 customers and detected revenue leaking from {activeCohorts.length} customer segment{activeCohorts.length === 1 ? '' : 's'}.
            </p>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-display text-7xl sm:text-[6rem] font-semibold tabular-nums tracking-tight">
                ₹{totalAtRisk > 0 ? (totalAtRisk / 100000).toFixed(1) : '—'}
              </span>
              <span className="text-3xl sm:text-4xl text-brand-300 font-bold uppercase tracking-wider font-sans">lakh</span>
              <span className="text-white/20 text-4xl font-thin hidden sm:inline">|</span>
              <span className="text-2xl sm:text-3xl text-white/50 font-semibold uppercase tracking-wider font-sans">at risk</span>
            </div>

            <p className="mt-5 text-lg text-white/50">
              across {totalCustomers > 0 ? totalCustomers.toLocaleString('en-IN') : '—'} customers who stopped buying
            </p>

            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 border border-white/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                </svg>
                <span className="text-sm font-semibold">{totalCustomers > 0 ? totalCustomers.toLocaleString('en-IN') : '—'} Customers affected</span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 border border-white/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
                  <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
                </svg>
                <span className="text-sm font-semibold">14 Behavioral signals analyzed</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* REVENUE LEAKS — opportunity cards */}
      {activeCohorts.length > 0 && (
        <section className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold uppercase tracking-wider text-espresso-800">
                Revenue leaks that AI found
              </h2>
              <span className="text-xs text-espresso-400 font-medium">Sort by: <span className="text-espresso-600 font-semibold">Revenue at risk</span></span>
            </div>
            <p className="text-sm text-espresso-500 mt-1.5">
              Each segment is a customer group where the AI detected revenue loss.
            </p>
          </div>
          <div className="space-y-4">
            {activeCohorts.map((o) => (
              <LeakCard
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

      {/* AI scan info */}
      {hasData && (
        <Card className="p-5 flex items-center gap-4 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-espresso-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">AI</div>
          <p className="flex-1 text-sm text-espresso-500">
            Pulse last scanned your data {formatAge(activeCohorts[0]?.generated_at)}. 14 facts analysed across 6,000 customers.
          </p>
          <Button variant="secondary" onClick={onGenerate} disabled={generating} className="shrink-0">
            {generating ? <><Spinner size={14} /> Scanning…</> : 'Re-scan now'}
          </Button>
        </Card>
      )}

      {/* Collapsed: How Pulse finds leaks */}
      {hasData && (
        <button
          onClick={() => setShowHowItWorks((v) => !v)}
          className="w-full text-left px-5 py-3.5 rounded-xl border border-dashed border-espresso-200 text-sm text-espresso-400 hover:text-espresso-600 hover:border-espresso-300 transition-colors flex items-center justify-between"
        >
          <span>{showHowItWorks ? '▼' : '▶'} How does Pulse find revenue leaks?</span>
          <span className="text-xs">{showHowItWorks ? 'Collapse' : 'Expand'}</span>
        </button>
      )}
      {showHowItWorks && (
        <Card className="p-6 bg-cream-50 border-espresso-100">
          <div className="space-y-3 text-sm text-espresso-600 leading-relaxed">
            <p><span className="font-semibold text-espresso-800">1. Ingest</span> — Your customer and order data is already loaded (6,000 customers, 12 stores).</p>
            <p><span className="font-semibold text-espresso-800">2. Compute</span> — Pulse runs 14 named SQL facts with 3 cohort queries to find behavioral patterns.</p>
            <p><span className="font-semibold text-espresso-800">3. Analyse</span> — The AI strategist reads every fact and identifies segments where revenue is at risk.</p>
            <p><span className="font-semibold text-espresso-800">4. Prioritise</span> — Segments are ranked by recovery probability so you start with the highest-value leak.</p>
          </div>
        </Card>
      )}

      {/* Dismissed leaks */}
      {dismissed.length > 0 && (
        <details className="group">
          <summary className="px-5 py-3.5 rounded-xl border border-dashed border-espresso-200 text-sm text-espresso-400 hover:text-espresso-600 cursor-pointer list-none flex items-center justify-between">
            <span>▶ Dismissed leaks ({dismissed.length})</span>
            <span className="text-xs">Expand</span>
          </summary>
          <div className="mt-3 grid lg:grid-cols-3 gap-4">
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
        </details>
      )}
    </div>
  )
}

function LeakCard({
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

  const heroFact = opp.facts.find((f) =>
    f.fact_id === 'f_lapsed_annualized_value' ||
    f.fact_id === 'f_drift_size' ||
    f.fact_id === 'f_festive_size',
  )
  let revenueAtRisk = '—'
  if (heroFact && typeof heroFact.value === 'number') {
    if (heroFact.fact_id === 'f_lapsed_annualized_value') {
      revenueAtRisk = `₹${(heroFact.value / 100000).toFixed(1)}L`
    } else {
      revenueAtRisk = `${heroFact.value.toLocaleString('en-IN')} customers`
    }
  }

  const sizeFact = opp.facts.find((f) => f.fact_id.endsWith('_size'))
  const customerCount = sizeFact && typeof sizeFact.value === 'number' ? sizeFact.value.toLocaleString('en-IN') : '—'

  const level = recoveryLevelFromRef(opp.cohort_definition.cohort_ref)
  const recoveryPct = level === 'high' ? 68 : level === 'medium' ? 45 : 30
  const recoveryLabel = level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low'
  const severityColor = opp.priority_rank === 1
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'
  const barColor = opp.priority_rank === 1 ? 'bg-red-400' : 'bg-amber-400'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="w-full text-left bg-white border border-espresso-100 rounded-2xl card-hover overflow-hidden group shadow-sm cursor-pointer"
    >
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${accent.bar}`} />
        <div className="flex-1 p-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${severityColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${barColor} ${opp.priority_rank === 1 ? 'live-dot' : ''}`} />
              Leaking
            </span>
            <span className="text-xs text-espresso-400">
              AI confidence: {recoveryLabel.toLowerCase()}
            </span>
            <span className="ml-auto text-sm text-brand-600 font-bold group-hover:translate-x-1 transition-all inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-50 group-hover:bg-brand-100 border border-brand-100">
              Investigate leak
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </div>

          <h3 className="mt-3 font-display text-xl font-bold text-espresso-900 leading-snug group-hover:text-brand-700 transition-colors">
            {cohort?.title ?? opp.title}
          </h3>
          <p className="mt-1 text-sm text-espresso-500">
            {cohort?.description}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="px-4 py-3 rounded-xl bg-cream-50 border border-espresso-50">
              <div className="text-[10px] font-bold uppercase tracking-wider text-espresso-400">Revenue at risk</div>
              <div className="font-display text-2xl font-bold text-espresso-900 tabular-nums mt-1">{revenueAtRisk}</div>
              <div className="text-[11px] text-espresso-400 mt-0.5">{customerCount} customers</div>
            </div>
            <div className="px-4 py-3 rounded-xl bg-cream-50 border border-espresso-50">
              <div className="text-[10px] font-bold uppercase tracking-wider text-espresso-400">Recovery probability</div>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-16 h-2 rounded-full bg-espresso-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${recoveryPct}%` }} />
                </div>
                <span className="text-lg font-bold text-emerald-600 tabular-nums">{recoveryPct}%</span>
              </div>
              <div className="text-[11px] text-espresso-500 mt-1 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${level === 'high' ? 'bg-emerald-500' : level === 'medium' ? 'bg-amber-500' : 'bg-red-400'}`} />
                {recoveryLabel} recovery odds
              </div>
            </div>
            <div className="px-4 py-3 rounded-xl bg-cream-50 border border-espresso-50">
              <RecoveryMeter level={level} compact />
            </div>
          </div>

          {opp.cohort_definition.recommended_action && (
            <div className="mt-4 flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-espresso-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                AI
              </div>
              <p className="text-sm text-espresso-600 leading-relaxed">
                {opp.cohort_definition.recommended_action}
              </p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-espresso-50 flex items-center justify-between">
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
              disabled={dismissing}
              className="text-xs text-espresso-400 hover:text-espresso-700 disabled:opacity-50 font-medium"
            >
              {dismissing ? 'Dismissing…' : 'Not now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DismissedCard({
  opp,
  onRestore,
}: {
  opp: Opportunity
  onRestore: () => void
}) {
  const cohort = cohortMeta(opp.cohort_definition.cohort_ref)
  return (
    <div className="bg-cream-50 border border-espresso-100 rounded-xl p-5 opacity-60 hover:opacity-100 transition-opacity">
      <span className="inline-flex px-2 py-0.5 rounded-full bg-espresso-100 text-espresso-500 text-xs font-medium">
        Dismissed
      </span>
      <h3 className="mt-2 text-sm font-medium text-espresso-600">{cohort?.title ?? opp.title}</h3>
      <button onClick={onRestore} className="mt-3 text-xs text-brand-600 hover:text-brand-700 font-semibold">
        Restore →
      </button>
    </div>
  )
}

function formatAge(iso: string | undefined): string {
  if (!iso) return 'recently'
  try {
    const d = new Date(iso)
    const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin} min ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    return `${Math.floor(diffH / 24)}d ago`
  } catch {
    return 'recently'
  }
}
