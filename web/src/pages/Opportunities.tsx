import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Opportunity } from '../lib/types'
import { indexFacts, renderWithFactChips } from '../lib/factCitations'
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
  const [draftingId, setDraftingId] = useState<number | null>(null)

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

  const onDraft = async (oppId: number) => {
    setDraftingId(oppId)
    try {
      const campaign = await api.draftCampaign(oppId)
      navigate(`/campaigns/${campaign.id}`)
    } catch (e) {
      setError((e as Error).message)
      setDraftingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Revenue opportunities</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ranked by recoverable value × recovery odds. The AI cites only computed facts —
            click any chip to see the live underlying rows.
          </p>
        </div>
        <Button onClick={onGenerate} disabled={generating}>
          {generating ? <><Spinner size={14} /> Generating…</> : 'Re-generate'}
        </Button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!opps && !error && (
        <div className="flex items-center gap-2 text-gray-500 py-12">
          <Spinner size={18} /> Loading opportunities…
        </div>
      )}

      {opps && opps.length === 0 && !error && (
        <EmptyState
          title="No opportunities yet"
          message="Generate ranked win-back opportunities from the live customer base."
          action={
            <Button onClick={onGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate opportunities'}
            </Button>
          }
        />
      )}

      {opps && opps.length > 0 && (
        <div className="space-y-4">
          {opps.map((o) => (
            <OpportunityCard
              key={o.id}
              opp={o}
              onDraft={() => onDraft(o.id)}
              drafting={draftingId === o.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OpportunityCard({
  opp,
  onDraft,
  drafting,
}: {
  opp: Opportunity
  onDraft: () => void
  drafting: boolean
}) {
  const factsById = indexFacts(opp.facts)
  const cohortBadgeClass: Record<string, string> = {
    lapsed_regulars: 'bg-brand-50 text-brand-700 border-brand-100',
    delivery_drift: 'bg-amber-50 text-amber-700 border-amber-200',
    festive_onetimers: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  const cohort = opp.cohort_definition.cohort_ref
  const badge = cohortBadgeClass[cohort] ?? 'bg-gray-100 text-gray-700 border-gray-200'

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center justify-center w-10 h-10 rounded-md bg-gray-900 text-white font-semibold text-lg shrink-0">
          {opp.priority_rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{opp.title}</h2>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badge}`}>
              {cohort.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            {renderWithFactChips(opp.llm_reasoning, factsById)}
          </p>
          {opp.cohort_definition.recommended_action && (
            <p className="mt-3 text-xs text-gray-500">
              <span className="font-medium uppercase tracking-wide text-gray-400 mr-2">
                Action
              </span>
              {opp.cohort_definition.recommended_action}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end">
        <Button onClick={onDraft} disabled={drafting}>
          {drafting ? <><Spinner size={14} /> Drafting…</> : 'Draft campaign →'}
        </Button>
      </div>
    </Card>
  )
}
