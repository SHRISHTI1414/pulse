// Screen 3 — "AI-drafted recovery campaign"

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { CampaignDetail } from '../lib/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import ErrorState from '../components/ErrorState'
import { cohortMeta } from '../lib/cohort'
import { SmsPreview, WhatsAppPreview } from '../components/PhoneMockup'
import PageGuide from '../components/PageGuide'

const WA_LIMIT = 180
const SMS_LIMIT = 160

export default function CampaignReview() {
  const { id } = useParams<{ id: string }>()
  const cid = Number(id)
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [waBody, setWaBody] = useState('')
  const [smsBody, setSmsBody] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'save' | 'approve' | 'send' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'sms'>('whatsapp')

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await api.getCampaign(cid)
      setCampaign(c)
      setName(c.name)
      setWaBody(c.message_templates?.default?.whatsapp ?? '')
      setSmsBody(c.message_templates?.default?.sms ?? '')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [cid])

  useEffect(() => { load() }, [load])

  const saveEdits = async () => {
    if (!campaign) return
    setBusy('save')
    try {
      await api.patchCampaign(cid, {
        name,
        message_templates: {
          ...campaign.message_templates,
          default: { whatsapp: waBody, sms: smsBody },
        },
      })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const doSend = async () => {
    if (!campaign) return
    setBusy('approve')
    setError(null)
    try {
      await api.patchCampaign(cid, {
        name,
        message_templates: {
          ...campaign.message_templates,
          default: { whatsapp: waBody, sms: smsBody },
        },
      })
      await api.approveCampaign(cid)
      setBusy('send')
      await api.sendCampaign(cid)
      navigate(`/campaigns/${cid}/results`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
      setConfirming(false)
    }
  }

  if (error && !campaign) return <ErrorState message={error} onRetry={load} />
  if (!campaign) {
    return (
      <div className="flex items-center gap-3 text-espresso-400 py-16 justify-center">
        <Spinner size={20} /> <span className="text-sm">Loading recovery campaign…</span>
      </div>
    )
  }

  const customerIds = campaign.segment_definition?.customer_ids ?? []
  const isDraft = campaign.status === 'draft'
  const cohort = cohortMeta(campaign.segment_definition?.cohort_ref)

  return (
    <div className="space-y-8">
      <PageGuide variant="campaign" />

      {/* Recovery step indicator */}
      <RecoveryStepIndicator step={confirming ? 3 : 2} />

      <div>
        <Link
          to={campaign.opportunity_id ? `/opportunities/${campaign.opportunity_id}` : '/opportunities'}
          className="inline-flex items-center gap-1.5 text-sm text-espresso-400 hover:text-brand-600 font-medium"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Why you're losing revenue
        </Link>

        {isDraft ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block mt-4 w-full bg-transparent font-display text-3xl font-semibold text-espresso-900 focus:outline-none border-b-2 border-transparent hover:border-espresso-100 focus:border-brand-300 pb-2 transition-colors"
            placeholder="Campaign name"
          />
        ) : (
          <h1 className="mt-4 font-display text-3xl font-semibold text-espresso-900">{campaign.name}</h1>
        )}

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <StatusPill status={campaign.status} />
          {!isDraft && (
            <Link to={`/campaigns/${cid}/results`} className="text-sm text-brand-600 hover:text-brand-700 font-semibold">
              View revenue recovered →
            </Link>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {/* WHO the AI is targeting for recovery */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-espresso-400 mb-3">
          Who the AI is targeting for recovery
        </h2>
        <Card className="p-5 bg-gradient-to-r from-cream-50 to-white">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold text-espresso-900">
                {customerIds.length.toLocaleString('en-IN')} customers
              </div>
              <div className="text-sm text-espresso-400">
                {cohort?.title ?? 'Win-back segment'} · each gets WhatsApp (if opted in) or SMS
              </div>
            </div>
            {campaign.opportunity_id && (
              <Link
                to={`/opportunities/${campaign.opportunity_id}`}
                className="text-sm text-brand-600 hover:text-brand-700 font-semibold"
              >
                See full segment →
              </Link>
            )}
          </div>
        </Card>
      </section>

      {/* AI-DRAFTED RECOVERY MESSAGE */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-espresso-400 mb-1">
          AI-drafted recovery message
        </h2>
        <p className="text-sm text-espresso-400 mb-3">
          Pulse drafted this based on the segment's behavior. Edit freely — preview updates live.
        </p>

        <Card className="overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-espresso-50 px-6">
            {(['whatsapp', 'sms'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-espresso-400 hover:text-espresso-600'
                }`}
              >
                <span className={`w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold ${
                  tab === 'whatsapp' ? 'bg-emerald-500' : 'bg-blue-500'
                }`}>
                  {tab === 'whatsapp' ? 'W' : 'S'}
                </span>
                {tab === 'whatsapp' ? 'WhatsApp' : 'SMS'}
              </button>
            ))}
          </div>

          <div className="p-6">
            <p className="text-xs text-espresso-400 mb-1">
              <code className="px-2 py-0.5 rounded-md bg-cream-100 text-brand-700 text-xs font-mono font-semibold">{`{{name}}`}</code>
              {' '}is replaced with each customer's first name.
            </p>
            <div className="grid lg:grid-cols-2 gap-10 items-start mt-4">
              <div>
                {activeTab === 'whatsapp' ? (
                  <>
                    <p className="text-xs text-espresso-400 mb-3">Sent to customers who opted in to WhatsApp</p>
                    <ChannelEditor value={waBody} onChange={setWaBody} disabled={!isDraft} limit={WA_LIMIT} />
                  </>
                ) : (
                  <>
                    <p className="text-xs text-espresso-400 mb-3">Fallback for customers without WhatsApp</p>
                    <ChannelEditor value={smsBody} onChange={setSmsBody} disabled={!isDraft} limit={SMS_LIMIT} />
                  </>
                )}
              </div>
              <div className="lg:sticky lg:top-24">
                {activeTab === 'whatsapp' ? (
                  <WhatsAppPreview body={waBody} />
                ) : (
                  <SmsPreview body={smsBody} />
                )}
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* EXPECTED RECOVERY OUTCOME */}
      {isDraft && (
        <Card className="p-5 bg-emerald-50 border-emerald-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-espresso-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">AI</div>
            <div>
              <p className="text-sm text-emerald-800 leading-relaxed">
                Pulse estimates this campaign will recover revenue from ~18% of the audience. Revenue attribution will track orders placed within 7 days of message engagement.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="sticky bottom-0 -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 bg-cream-100/90 backdrop-blur-md border-t border-espresso-100">
        {isDraft && !confirming && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary" onClick={saveEdits} disabled={busy !== null}>
              {busy === 'save' ? 'Saving…' : 'Save edits'}
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={busy !== null} size="lg">
              Send to {customerIds.length.toLocaleString('en-IN')} customers →
            </Button>
          </div>
        )}
        {isDraft && confirming && (
          <ConfirmSend
            count={customerIds.length}
            busy={busy}
            onCancel={() => setConfirming(false)}
            onConfirm={doSend}
          />
        )}
        {!isDraft && (
          <div className="flex justify-end">
            <Link to={`/campaigns/${cid}/results`}>
              <Button size="lg">See revenue recovered →</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function RecoveryStepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Leak found', done: true },
    { n: 2, label: 'Investigated', done: true },
    { n: 3, label: 'Send recovery', done: false },
    { n: 4, label: 'Measure recovery', done: false },
  ]
  const currentIdx = step === 3 ? 2 : 2

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((s, i) => {
        const active = i === currentIdx
        const done = s.done
        return (
          <div key={s.n} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`w-6 h-px ${done || active ? 'bg-emerald-300' : 'bg-espresso-200'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                done ? 'bg-emerald-500 text-white'
                  : active ? 'bg-brand-600 text-white'
                    : 'bg-espresso-100 text-espresso-400'
              }`}>
                {done ? '✓' : s.n}
              </span>
              <span className={`text-xs font-medium ${
                active ? 'text-brand-700' : done ? 'text-espresso-600' : 'text-espresso-400'
              }`}>
                {s.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChannelEditor({
  value,
  onChange,
  disabled,
  limit,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  limit: number
}) {
  const overLimit = value.length > limit
  const pct = Math.min(100, (value.length / limit) * 100)
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={5}
        className={`w-full text-sm rounded-xl border p-4 disabled:bg-cream-50 disabled:text-espresso-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300 transition-all leading-relaxed ${
          overLimit ? 'border-red-300 bg-red-50/30' : 'border-espresso-200 bg-white'
        }`}
      />
      <div className="mt-2 flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-espresso-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overLimit ? 'bg-red-400' : 'bg-brand-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-medium tabular-nums ${overLimit ? 'text-red-600' : 'text-espresso-400'}`}>
          {value.length}/{limit}
        </span>
      </div>
    </div>
  )
}

function ConfirmSend({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number
  busy: 'save' | 'approve' | 'send' | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Card className="p-5 bg-amber-50 border-amber-200">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900">
            Send recovery campaign to {count.toLocaleString('en-IN')} customers?
          </p>
          <p className="text-sm text-amber-800/80 mt-1 leading-relaxed">
            Each customer gets one message. Pulse tracks delivery, opens, clicks, and any orders they place within 7 days. Revenue recovered will appear on your results dashboard.
          </p>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy !== null}>
            {busy === 'approve' && <><Spinner size={14} /> Approving…</>}
            {busy === 'send' && <><Spinner size={14} /> Sending…</>}
            {busy === null && 'Yes, send now'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    draft: { cls: 'bg-espresso-100 text-espresso-600', label: 'Draft' },
    approved: { cls: 'bg-blue-50 text-blue-700', label: 'Approved' },
    sending: { cls: 'bg-amber-50 text-amber-700', label: 'Sending…' },
    completed: { cls: 'bg-emerald-50 text-emerald-700', label: 'Sent' },
  }
  const meta = map[status] ?? { cls: 'bg-espresso-100 text-espresso-600', label: status }
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  )
}
