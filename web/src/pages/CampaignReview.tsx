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
      <div className="flex items-center gap-2 text-gray-500 py-12">
        <Spinner size={18} /> Loading campaign…
      </div>
    )
  }

  const customerIds = campaign.segment_definition?.customer_ids ?? []
  const isDraft = campaign.status === 'draft'
  const cohort = cohortMeta(campaign.segment_definition?.cohort_ref)

  return (
    <div className="space-y-6">
      {/* Top: back link, title, status */}
      <div>
        <Link to="/opportunities" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
          ← Back to opportunities
        </Link>
        {isDraft ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block mt-2 w-full bg-transparent text-2xl font-semibold text-gray-900 focus:outline-none border-b border-transparent hover:border-gray-200 focus:border-gray-300 pb-1"
            placeholder="Campaign name"
          />
        ) : (
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">{campaign.name}</h1>
        )}
        <div className="mt-2 flex items-center gap-3 text-sm">
          <StatusPill status={campaign.status} />
          {!isDraft && (
            <Link to={`/campaigns/${cid}/results`} className="text-brand-700 hover:underline">
              View live results →
            </Link>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {/* Audience block — plain English */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Who this will go to</h2>
            <p className="mt-1 text-sm text-gray-500">
              {cohort?.description ?? 'A specific group of customers selected for this campaign.'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-semibold text-gray-900 tabular-nums">
              {customerIds.length.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-gray-500">customers</div>
          </div>
        </div>
        {campaign.segment_definition?.channel_strategy && (
          <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-700">
            <span className="text-xs uppercase tracking-wide text-gray-400 mr-2">AI sends via</span>
            {campaign.segment_definition.channel_strategy}
          </div>
        )}
      </Card>

      {/* Message editor + live preview */}
      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">Message your customer will get</h2>
        <p className="mt-1 text-sm text-gray-500">
          <code className="px-1.5 py-0.5 rounded bg-gray-100 text-xs">{`{{name}}`}</code> is
          replaced with each customer's first name. Edit freely — the preview updates as you type.
        </p>

        <div className="mt-5 grid lg:grid-cols-2 gap-8">
          {/* WhatsApp side */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex w-5 h-5 rounded-full bg-emerald-500 text-white items-center justify-center text-[10px] font-bold">W</span>
                <h3 className="text-sm font-semibold text-gray-900">WhatsApp</h3>
                <span className="text-xs text-gray-500">sent if the customer opted in</span>
              </div>
            </div>
            <ChannelEditor
              value={waBody}
              onChange={setWaBody}
              disabled={!isDraft}
              limit={WA_LIMIT}
            />
            <div className="mt-4">
              <WhatsAppPreview body={waBody} />
            </div>
          </div>
          {/* SMS side */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex w-5 h-5 rounded-full bg-blue-500 text-white items-center justify-center text-[10px] font-bold">S</span>
                <h3 className="text-sm font-semibold text-gray-900">SMS</h3>
                <span className="text-xs text-gray-500">fallback for non-WhatsApp customers</span>
              </div>
            </div>
            <ChannelEditor
              value={smsBody}
              onChange={setSmsBody}
              disabled={!isDraft}
              limit={SMS_LIMIT}
            />
            <div className="mt-4">
              <SmsPreview body={smsBody} />
            </div>
          </div>
        </div>
      </Card>

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {isDraft && !confirming && (
          <>
            <Button variant="secondary" onClick={saveEdits} disabled={busy !== null}>
              {busy === 'save' ? 'Saving…' : 'Save edits'}
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={busy !== null}>
              Send to {customerIds.length.toLocaleString('en-IN')} customers →
            </Button>
          </>
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
          <Link to={`/campaigns/${cid}/results`}>
            <Button>See results →</Button>
          </Link>
        )}
      </div>
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
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        className={`w-full text-sm rounded-md border p-3 disabled:bg-gray-50 disabled:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
          overLimit ? 'border-red-300' : 'border-gray-300'
        }`}
      />
      <div className="mt-1 flex justify-end">
        <span className={`text-xs ${overLimit ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
          {value.length} / {limit} characters
          {overLimit && ' — too long, will be truncated by carrier'}
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
    <Card className="w-full p-4 bg-amber-50 border-amber-200">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            About to send to {count.toLocaleString('en-IN')} real customers.
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Each will receive one message (WhatsApp or SMS). You can't recall messages once sent.
            Pulse will track which ones open it and which ones come back to order.
          </p>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>
            Cancel
          </Button>
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
    draft: { cls: 'bg-gray-100 text-gray-700', label: 'Draft — not sent yet' },
    approved: { cls: 'bg-blue-50 text-blue-700', label: 'Approved — about to send' },
    sending: { cls: 'bg-amber-50 text-amber-700', label: 'Sending right now' },
    completed: { cls: 'bg-emerald-50 text-emerald-700', label: 'Sent' },
  }
  const meta = map[status] ?? { cls: 'bg-gray-100 text-gray-700', label: status }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  )
}
