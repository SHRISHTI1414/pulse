import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { CampaignDetail } from '../lib/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import ErrorState from '../components/ErrorState'

export default function CampaignReview() {
  const { id } = useParams<{ id: string }>()
  const cid = Number(id)
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [waName, setWaName] = useState('')
  const [waBody, setWaBody] = useState('')
  const [smsBody, setSmsBody] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'save' | 'approve' | 'send' | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await api.getCampaign(cid)
      setCampaign(c)
      setName(c.name)
      setWaName(c.message_templates?.tiers?.[0]?.name ?? 'Tier 1')
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

  const approveAndSend = async () => {
    if (!campaign) return
    setBusy('approve')
    setError(null)
    try {
      // Save edits first if there are any.
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Link to="/opportunities" className="text-sm text-gray-500 hover:text-gray-700">
            ← Opportunities
          </Link>
          {isDraft ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block mt-2 w-full bg-transparent text-2xl font-semibold text-gray-900 focus:outline-none focus:border-b border-gray-300"
            />
          ) : (
            <h1 className="mt-2 text-2xl font-semibold text-gray-900">{campaign.name}</h1>
          )}
          <div className="mt-1 flex items-center gap-3 text-sm">
            <StatusPill status={campaign.status} />
            {campaign.segment_definition?.cohort_ref && (
              <span className="text-gray-500">
                Cohort: <span className="text-gray-700">{campaign.segment_definition.cohort_ref.replace(/_/g, ' ')}</span>
              </span>
            )}
          </div>
        </div>
        {campaign.status !== 'draft' && (
          <Link
            to={`/campaigns/${cid}/results`}
            className="text-sm text-brand-700 hover:underline"
          >
            View results →
          </Link>
        )}
      </div>

      {error && <ErrorState message={error} />}

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">Audience</h2>
        <p className="text-sm text-gray-500 mt-1">
          Snapshot of {customerIds.length.toLocaleString('en-IN')} customer{customerIds.length === 1 ? '' : 's'} at draft time.
          {campaign.segment_definition?.channel_strategy && (
            <> Channel strategy: <span className="text-gray-700">{campaign.segment_definition.channel_strategy}</span></>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {customerIds.slice(0, 20).map((cidv) => (
            <span key={cidv} className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700 font-mono">
              #{cidv}
            </span>
          ))}
          {customerIds.length > 20 && (
            <span className="px-2 py-0.5 text-xs text-gray-500">
              + {(customerIds.length - 20).toLocaleString('en-IN')} more
            </span>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-gray-900">Message — {waName}</h2>
        <p className="text-xs text-gray-500 mt-1">
          {`{{name}}`} is replaced with the customer's first name at send time.
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <ChannelEditor
            label="WhatsApp"
            value={waBody}
            onChange={setWaBody}
            disabled={!isDraft}
            limit={180}
          />
          <ChannelEditor
            label="SMS"
            value={smsBody}
            onChange={setSmsBody}
            disabled={!isDraft}
            limit={160}
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {isDraft && (
          <>
            <Button variant="secondary" onClick={saveEdits} disabled={busy !== null}>
              {busy === 'save' ? 'Saving…' : 'Save edits'}
            </Button>
            <Button onClick={approveAndSend} disabled={busy !== null}>
              {busy === 'approve' && <><Spinner size={14} /> Approving…</>}
              {busy === 'send' && <><Spinner size={14} /> Sending…</>}
              {busy === null && 'Approve & send'}
            </Button>
          </>
        )}
        {!isDraft && (
          <Link to={`/campaigns/${cid}/results`}>
            <Button>View results</Button>
          </Link>
        )}
      </div>
    </div>
  )
}

function ChannelEditor({
  label,
  value,
  onChange,
  disabled,
  limit,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  limit: number
}) {
  const overLimit = value.length > limit
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</label>
        <span className={`text-xs ${overLimit ? 'text-red-600' : 'text-gray-400'}`}>
          {value.length} / {limit}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        className={`w-full text-sm font-mono rounded-md border p-3 disabled:bg-gray-50 disabled:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
          overLimit ? 'border-red-300' : 'border-gray-300'
        }`}
      />
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    approved: 'bg-blue-50 text-blue-700',
    sending: 'bg-amber-50 text-amber-700',
    completed: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {status}
    </span>
  )
}
