// Screen 2 — "The AI explains this leak with evidence"

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { AudienceSample, Fact, Opportunity } from '../lib/types'
import { cohortMeta } from '../lib/cohort'
import Button from '../components/Button'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import ErrorState from '../components/ErrorState'
import CohortMetricTile from '../components/CohortMetricTile'
import SampleCustomerRow from '../components/SampleCustomerRow'
import PageGuide from '../components/PageGuide'
import RecoveryMeter, { recoveryLevelFromRef } from '../components/RecoveryMeter'

export default function CohortDetail() {
  const { id } = useParams<{ id: string }>()
  const oid = Number(id)
  const navigate = useNavigate()

  const [opp, setOpp] = useState<Opportunity | null>(null)
  const [audience, setAudience] = useState<AudienceSample | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [o, a] = await Promise.all([
        api.getOpportunity(oid),
        api.audienceSample(oid, 10).catch(() => null),
      ])
      setOpp(o)
      setAudience(a)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [oid])

  useEffect(() => { load() }, [load])

  const onDraft = async () => {
    if (!opp) return
    setDrafting(true)
    try {
      const c = await api.draftCampaign(opp.id)
      navigate(`/campaigns/${c.id}`)
    } catch (e) {
      setError((e as Error).message)
      setDrafting(false)
    }
  }

  if (error && !opp) return <ErrorState message={error} onRetry={load} />
  if (!opp) {
    return (
      <div className="flex items-center gap-3 text-espresso-400 py-16 justify-center">
        <Spinner size={20} /> <span className="text-sm">Loading leak analysis…</span>
      </div>
    )
  }

  const cohort = cohortMeta(opp.cohort_definition.cohort_ref)
  const factsById: Record<string, Fact> = Object.fromEntries(opp.facts.map((f) => [f.fact_id, f]))
  const cohortSize = factsById[`f_${opp.cohort_definition.cohort_ref?.split('_')[0]}_size`]?.value

  const level = recoveryLevelFromRef(opp.cohort_definition.cohort_ref)
  const recoveryPct = level === 'high' ? 68 : level === 'medium' ? 45 : 30
  const confidenceLabel = level === 'high' ? 'High confidence' : level === 'medium' ? 'Medium confidence' : 'Low confidence'

  const heroFact = opp.facts.find((f) => f.fact_id === 'f_lapsed_annualized_value')
  const revenueAtRisk = heroFact && typeof heroFact.value === 'number'
    ? `₹${(heroFact.value / 100000).toFixed(1)}L`
    : null

  return (
    <div className="space-y-8">
      <PageGuide variant="cohort" />

      {/* Breadcrumb */}
      <Link
        to="/opportunities"
        className="inline-flex items-center gap-1.5 text-sm text-espresso-400 hover:text-brand-600 font-medium transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Leakage detected
      </Link>

      {/* AI ANALYST HERO — the AI explains this specific leak */}
      <Card className="hero-glow p-8 sm:p-10 bg-gradient-to-br from-espresso-900 via-espresso-800 to-espresso-900 border-espresso-700 text-white overflow-hidden relative">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-brand-500/10 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10">
              <span className="w-7 h-7 rounded-lg bg-white text-espresso-900 flex items-center justify-center text-[10px] font-bold">AI</span>
              <span className="text-xs text-white/70 font-medium">Pulse strategist</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-400/30 text-xs font-semibold text-red-300">
              {confidenceLabel}
            </span>
          </div>

          <h1 className="mt-5 font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            {cohort?.title ?? opp.title}
          </h1>
          <p className="mt-2 text-sm text-white/50">
            {typeof cohortSize === 'number' ? cohortSize.toLocaleString('en-IN') : '—'} customers are leaking
            {revenueAtRisk ? ` ${revenueAtRisk} in` : ''} potential revenue
          </p>

          <div className="mt-6 flex items-center gap-6 flex-wrap">
            {revenueAtRisk && (
              <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Revenue at risk</div>
                <div className="text-xl font-semibold text-red-300">{revenueAtRisk}</div>
              </div>
            )}
            <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">AI recovery estimate</div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${recoveryPct}%` }} />
                </div>
                <span className="text-sm font-semibold text-emerald-400 tabular-nums">{recoveryPct}%</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* WHY THE AI FLAGGED THIS — evidence cards */}
      <section>
        <div className="mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-espresso-400">
            Why the AI flagged this segment
          </h2>
          <p className="text-sm text-espresso-400 mt-1">
            Pulse analysed 14 data signals and found these patterns that explain the leak.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cohort?.metricTiles.map((tile) => {
            const fact = factsById[tile.factId]
            const raw = fact && typeof fact.value === 'number' ? fact.value : null
            const display = raw != null && tile.formatter ? tile.formatter(raw) : (fact ? String(fact.value) : '—')
            return (
              <CohortMetricTile
                key={tile.factId}
                eyebrow={tile.eyebrow}
                value={display}
                explainer={tile.explainer}
              />
            )
          })}
        </div>
      </section>

      {/* WHO IS LEAKING REVENUE — customer table */}
      <section>
        <div className="mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-espresso-400">
            Who is leaking revenue
          </h2>
          <p className="text-sm text-espresso-400 mt-1">
            {audience
              ? `Showing ${audience.sample_size} of ${typeof cohortSize === 'number' ? cohortSize.toLocaleString('en-IN') : '…'} — each one represents lost recurring revenue`
              : 'Real customers from this segment, not aggregates'
            }
          </p>
        </div>
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-espresso-50 bg-cream-50 flex items-center gap-2 text-xs font-semibold text-espresso-400 uppercase tracking-wider">
            <span className="w-5 hidden sm:block" />
            <span className="flex-1">Customer</span>
            <span className="shrink-0">Revenue lost</span>
          </div>
          <div className="px-1 py-1">
            {!audience ? (
              <div className="flex items-center gap-3 text-espresso-400 py-10 justify-center">
                <Spinner size={18} /> Loading customers…
              </div>
            ) : audience.rows.length === 0 ? (
              <p className="text-sm text-espresso-400 py-10 text-center">No customer rows resolved.</p>
            ) : (
              audience.rows.map((c, i) => (
                <SampleCustomerRow key={c.id} c={c} index={i} />
              ))
            )}
          </div>
        </Card>
      </section>

      {/* AI-RECOMMENDED RECOVERY ACTION */}
      {opp.cohort_definition.recommended_action && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-espresso-400 mb-4">
            AI-recommended recovery action
          </h2>
          <Card className="p-6 border-brand-200 border-2">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-espresso-900 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                AI
              </div>
              <div>
                <p className="text-sm font-semibold text-espresso-900 mb-1">
                  Pulse recommends: WhatsApp win-back campaign
                </p>
                <p className="text-sm text-espresso-600 leading-relaxed">
                  {opp.cohort_definition.recommended_action}
                </p>
                <p className="text-xs text-espresso-400 mt-3">
                  Based on order patterns, store concentration, and recovery odds from computed facts.
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Collapsible reasoning */}
      <section>
        <button
          onClick={() => setShowReasoning((v) => !v)}
          className="text-sm text-espresso-500 hover:text-espresso-800 inline-flex items-center gap-2 font-medium transition-colors"
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform ${showReasoning ? 'rotate-90' : ''}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          {showReasoning ? 'Hide' : 'Show'} full AI reasoning ({opp.facts.length} fact citations)
        </button>
        {showReasoning && (
          <Card className="mt-3 p-6 bg-cream-50 border-espresso-100">
            <p className="text-sm leading-relaxed text-espresso-700 whitespace-pre-wrap">
              {opp.llm_reasoning.replace(/\{fact:([a-zA-Z0-9_]+)\}/g, (_, fid) => {
                const f = factsById[fid]
                if (!f) return `[${fid}]`
                if (typeof f.value === 'number') return f.value.toLocaleString('en-IN')
                return String(f.value)
              })}
            </p>
          </Card>
        )}
      </section>

      {/* Recovery meter */}
      <RecoveryMeter level={level} />

      {/* Sticky CTA */}
      <div className="sticky bottom-0 -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 bg-cream-100/90 backdrop-blur-md border-t border-espresso-100 flex items-center justify-between gap-4">
        <div className="hidden sm:block">
          <p className="text-sm text-espresso-500">
            The AI will draft message copy for {typeof cohortSize === 'number' ? cohortSize.toLocaleString('en-IN') : '—'} customers across WhatsApp + SMS.
          </p>
        </div>
        <Button onClick={onDraft} disabled={drafting} size="lg" className="ml-auto">
          {drafting ? (
            <><Spinner size={16} /> Drafting recovery campaign…</>
          ) : (
            <>
              Launch recovery campaign
              {typeof cohortSize === 'number' && (
                <span className="opacity-70 font-normal">
                  · {cohortSize.toLocaleString('en-IN')} customers
                </span>
              )}
              →
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
