import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Opportunity } from '../lib/types'
import { indexFacts, renderWithFactChips } from '../lib/factCitations'
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

  // Pull the headline ₹-at-risk number from the lapsed opportunity (rank 1).
  const headlineValue = useMemo(() => {
    if (!opps) return null
    const lapsed = opps.find((o) => o.cohort_definition.cohort_ref === 'lapsed_regulars')
    if (!lapsed) return null
    const f = lapsed.facts.find((x) => x.fact_id === 'f_lapsed_annualized_value')
    if (!f || typeof f.value !== 'number') return null
    return f.value
  }, [opps])

  return (
    <div className="space-y-8">
      <IntroPanel />

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            What's leaking — and what to do about it
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl">
            Pulse looked through your 6,000 customers and 152,000 orders, then ranked the three
            biggest groups of people drifting away. Click any number to see the actual customers
            behind it.
          </p>
        </div>
        <Button onClick={onGenerate} disabled={generating} variant={opps && opps.length ? 'secondary' : 'primary'}>
          {generating ? <><Spinner size={14} /> Asking AI…</> : (opps && opps.length ? 'Re-analyse' : 'Find opportunities')}
        </Button>
      </div>

      {headlineValue !== null && (
        <HeadlineRibbon valueInr={headlineValue} />
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      {!opps && !error && (
        <div className="flex items-center gap-2 text-gray-500 py-12">
          <Spinner size={18} /> Loading what we've found so far…
        </div>
      )}

      {opps && opps.length === 0 && !error && (
        <EmptyState
          title="Nothing analysed yet"
          message="Ask Pulse to look through your customer base and find the biggest revenue at risk."
          action={
            <Button onClick={onGenerate} disabled={generating}>
              {generating ? 'Asking AI…' : 'Find opportunities'}
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

// ── Hero / intro / context ────────────────────────────────────────────────

function IntroPanel() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('pulse:intro-dismissed') !== '1'
    } catch {
      return true
    }
  })
  if (!open) return null
  const dismiss = () => {
    setOpen(false)
    try { localStorage.setItem('pulse:intro-dismissed', '1') } catch { /* ignore */ }
  }
  return (
    <Card className="p-5 sm:p-6 bg-gradient-to-br from-brand-50 via-white to-white border-brand-100">
      <div className="flex items-start gap-4">
        <div className="hidden sm:flex w-10 h-10 rounded-full bg-brand-600 text-white items-center justify-center font-bold text-lg shrink-0">
          ✦
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900">How Pulse works</h2>
          <ol className="mt-2 space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
            <li>
              <span className="font-medium">Find</span> — the AI scans the customer base for groups
              that used to be regulars and have quietly stopped.
            </li>
            <li>
              <span className="font-medium">Decide</span> — for each group, you see exactly how
              much revenue is at risk and why. Every number is clickable.
            </li>
            <li>
              <span className="font-medium">Send</span> — Pulse drafts the WhatsApp / SMS message,
              you review and approve. Nothing goes out without you.
            </li>
            <li>
              <span className="font-medium">Measure</span> — when someone comes back, Pulse credits
              the campaign and shows you the ₹ recovered.
            </li>
          </ol>
        </div>
        <button
          onClick={dismiss}
          className="text-xs text-gray-400 hover:text-gray-600 -mr-1 -mt-1 px-2 py-1"
          aria-label="Hide intro"
        >
          Got it ✕
        </button>
      </div>
    </Card>
  )
}

function HeadlineRibbon({ valueInr }: { valueInr: number }) {
  const lakhs = valueInr / 100000
  return (
    <Card className="p-6 bg-gradient-to-r from-gray-900 to-gray-800 border-gray-900 text-white">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/60">Revenue at risk this year</div>
          <div className="mt-1 text-4xl font-semibold tabular-nums">
            ₹{lakhs.toFixed(1)}<span className="text-2xl text-white/70 ml-1">lakh</span>
          </div>
          <div className="mt-1 text-xs text-white/60">
            Based on the trailing-6-month value of customers who stopped ordering. Annualised.
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <div className="text-xs uppercase tracking-wider text-white/60">Pulse can address</div>
          <div className="mt-1 text-sm text-white/80">
            Three distinct groups — most recoverable first.
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── Per-opportunity card ──────────────────────────────────────────────────

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
  const cohort = cohortMeta(opp.cohort_definition.cohort_ref)

  // Pull the most evocative number for the card-level headline.
  const headlineFact = opp.facts.find((f) =>
    f.fact_id === 'f_lapsed_annualized_value' ||
    f.fact_id === 'f_drift_size' ||
    f.fact_id === 'f_festive_size',
  )

  const accent = cohort ? ACCENT_CLASSES[cohort.accent] : ACCENT_CLASSES.gray

  return (
    <Card className="overflow-hidden">
      <div className={`h-1 w-full ${accent.bar}`} />
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border ${accent.badge}`}>
                Priority #{opp.priority_rank}
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{cohort?.shortLabel ?? opp.cohort_definition.cohort_ref}</span>
            </div>
            <h3 className="mt-2 text-xl font-semibold text-gray-900">
              {cohort?.title ?? opp.title}
            </h3>
            {cohort?.description && (
              <p className="mt-1 text-sm text-gray-500 max-w-2xl">{cohort.description}</p>
            )}
          </div>
          {headlineFact && typeof headlineFact.value === 'number' && (
            <CardHeadlineNumber fact={headlineFact} />
          )}
        </div>

        {/* AI quote block */}
        <div className="mt-5 border-l-4 border-gray-200 pl-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
            <span className="inline-flex w-4 h-4 rounded-full bg-gray-900 text-white items-center justify-center text-[8px] font-bold">
              ✦
            </span>
            <span>AI strategist</span>
          </div>
          <p className="mt-1.5 text-[15px] leading-relaxed text-gray-800">
            {renderWithFactChips(opp.llm_reasoning, factsById)}
          </p>
        </div>

        {opp.cohort_definition.recommended_action && (
          <div className="mt-4 flex items-start gap-2 text-sm">
            <span className="text-gray-400 mt-0.5">→</span>
            <p className="text-gray-700">
              <span className="font-medium">Recommended:</span> {opp.cohort_definition.recommended_action}
            </p>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-gray-500 max-w-md">
            Click any highlighted number above to see the actual customers behind it — the AI cited
            only computed facts, never invented numbers.
          </p>
          <Button onClick={onDraft} disabled={drafting}>
            {drafting ? <><Spinner size={14} /> Drafting campaign…</> : 'Draft a campaign →'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function CardHeadlineNumber({ fact }: { fact: { value: number | string; label: string; fact_id: string } }) {
  let display: string
  let suffix: string | null = null
  const v = typeof fact.value === 'number' ? fact.value : Number(fact.value)
  if (fact.fact_id === 'f_lapsed_annualized_value' && !Number.isNaN(v)) {
    display = `₹${(v / 100000).toFixed(1)}`
    suffix = 'lakh / yr at risk'
  } else if (!Number.isNaN(v)) {
    display = v.toLocaleString('en-IN')
    suffix = 'customers'
  } else {
    display = String(fact.value)
  }
  return (
    <div className="text-right shrink-0">
      <div className="text-3xl font-semibold text-gray-900 tabular-nums">{display}</div>
      {suffix && <div className="text-xs text-gray-500">{suffix}</div>}
    </div>
  )
}
