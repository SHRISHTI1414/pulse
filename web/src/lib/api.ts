// Tiny fetch wrapper. One file, one base URL, typed helpers.

import type {
  AudienceSample,
  Campaign,
  CampaignDetail,
  CampaignSendResult,
  CampaignStats,
  ChannelConfig,
  Debrief,
  FactResolve,
  Message,
  Opportunity,
  RecoveryResult,
} from './types'

const BASE: string = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000'

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`
    try {
      const body = await r.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      // ignore
    }
    throw new ApiError(r.status, detail)
  }
  if (r.status === 204) return undefined as T
  return r.json() as Promise<T>
}

export const api = {
  // Opportunities
  listOpportunities: () => request<Opportunity[]>(`/opportunities`),
  generateOpportunities: () => request<Opportunity[]>(`/opportunities/generate`, { method: 'POST' }),
  resolveFact: (factId: string) => request<FactResolve>(`/facts/${factId}/resolve`),
  draftCampaign: (oppId: number) =>
    request<Campaign>(`/opportunities/${oppId}/draft-campaign`, { method: 'POST' }),
  getOpportunity: (oid: number) =>
    request<Opportunity[]>(`/opportunities`).then((list) => {
      const found = list.find((o) => o.id === oid)
      if (!found) throw new ApiError(404, `opportunity ${oid} not found`)
      return found
    }),
  patchOpportunity: (oid: number, status: 'open' | 'actioned' | 'dismissed') =>
    request<Opportunity>(`/opportunities/${oid}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  audienceSample: (oid: number, limit = 10) =>
    request<AudienceSample>(`/opportunities/${oid}/audience-sample?limit=${limit}`),

  // Campaigns
  getCampaign: (cid: number) => request<CampaignDetail>(`/campaigns/${cid}`),
  patchCampaign: (cid: number, body: Partial<CampaignDetail>) =>
    request<Campaign>(`/campaigns/${cid}`, { method: 'PATCH', body: JSON.stringify(body) }),
  approveCampaign: (cid: number) =>
    request<Campaign>(`/campaigns/${cid}/approve`, { method: 'POST' }),
  sendCampaign: (cid: number) =>
    request<CampaignSendResult>(`/campaigns/${cid}/send`, { method: 'POST' }),
  campaignStats: (cid: number) => request<CampaignStats>(`/campaigns/${cid}/stats`),
  campaignMessages: (cid: number, limit = 20) =>
    request<Message[]>(`/campaigns/${cid}/messages?limit=${limit}`),
  campaignDebrief: (cid: number) =>
    request<Debrief>(`/campaigns/${cid}/debrief`, { method: 'POST' }),

  // Recovery sim
  simulateRecovery: (campaign_id: number, fraction = 0.25) =>
    request<RecoveryResult>(`/simulate/recovery`, {
      method: 'POST',
      body: JSON.stringify({ campaign_id, fraction }),
    }),

  // Channel-service config (proxied)
  getChannelConfig: () => request<ChannelConfig>(`/channel-config`),
  setChannelConfig: (mode: 'calm' | 'hostile') =>
    request<ChannelConfig>(`/channel-config`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
}

export { ApiError }
