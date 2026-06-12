// Screen 2 — "Here are the customers causing it"
// Bridges the abstract revenue-at-risk number on the home with the
// concrete people, then leads into drafting a campaign for them.

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { AudienceSample, Fact, Opportunity } from '../lib/types'
import { ACCENT_CLASSES, cohortMeta } from '../lib/cohort'
import Button from '../components/Button'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import ErrorState from '../components/ErrorState'
import CohortMetricTile from '../components/CohortMetricTile'
import SampleCustomerRow from '../components/SampleCustomerRow'

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
        api.audienceSample(oid, 10).catch(() => null), // tolerate missing audience
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
      <div className="flex items-center gap-2 text-gray-500 py-12">
        <Spinner size={18} /> Loading cohort…
      </div>
    )
  }

  const cohort = cohortMeta(opp.cohort_definition.cohort_ref)
  const accent = cohort ? ACCENT_CLASSES[cohort.accent] : ACCENT_CLASSES.gray
  const factsById: Record<string, Fact> = Object.fromEntries(opp.facts.map((f) => [f.fact_id, f]))

  return (
    <div className="space-y-8">
      <div>
        <Link to="/opportunities" className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
          ← Opportunities
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border ${accent.badge}`}>
                ● Priority {opp.priority_rank}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-gray-900 tracking-tight">
              {cohort?.title ?? opp.title}
            </h1>
            {cohort?.description && (
              <p className="mt-2 text-sm text-gray-500 max-w-2xl leading-relaxed">
                {cohort.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* The three metric tiles — real business signals */}
      <section>
        <SectionHeader title="Why these customers are slipping" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

      {/* Sample of the audience */}
      <section>
        <SectionHeader
          title={
            audience
              ? `Sample of the audience · ${audience.sample_size} of ${
                  factsById[`f_${opp.cohort_definition.cohort_ref?.split('_')[0]}_size`]?.value ?? '…'
                }`
              : 'Sample of the audience'
          }
          subtitle="Real customers from this cohort, sorted by their pre-lapse spend."
        />
        <Card className="p-2 sm:p-4">
          {!audience ? (
            <div className="flex items-center gap-2 text-gray-500 py-6 px-3">
              <Spinner size={16} /> Loading customers…
            </div>
          ) : audience.rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 px-3">No customer rows resolved.</p>
          ) : (
            <div>
              {audience.rows.map((c) => (
                <SampleCustomerRow key={c.id} c={c} />
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* What the AI recommends — one sentence, ground truth */}
      {opp.cohort_definition.recommended_action && (
        <section>
          <SectionHeader title="What the AI recommends" />
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
                ✦
              </div>
              <p className="text-base text-gray-800 leading-relaxed">
                {opp.cohort_definition.recommended_action}
              </p>
            </div>
          </Card>
        </section>
      )}

      {/* Full reasoning — collapsed by default */}
      <section>
        <button
          onClick={() => setShowReasoning((v) => !v)}
          className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
        >
          {showReasoning ? 'Hide' : 'Show'} the AI's full reasoning
          <span className="text-xs">{showReasoning ? '▾' : '▸'}</span>
        </button>
        {showReasoning && (
          <Card className="mt-3 p-5 bg-gray-50 border-gray-200">
            <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
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

      {/* Big CTA — only path to drafting */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Link to="/opportunities" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to opportunities
        </Link>
        <Button onClick={onDraft} disabled={drafting}>
          {drafting ? <><Spinner size={14} /> Drafting campaign…</> : `Draft a campaign for these ${factsById[`f_${opp.cohort_definition.cohort_ref?.split('_')[0]}_size`]?.value ?? ''} →`}
        </Button>
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}
