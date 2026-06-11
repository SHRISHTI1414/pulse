// TS types that mirror the Pydantic schemas in crm-api/app/schemas.py.
// Hand-maintained to keep dependency surface minimal.

export interface Fact {
  fact_id: string
  label: string
  value: number | string
  query_ref: string
}

export interface Opportunity {
  id: number
  generated_at: string
  title: string
  cohort_definition: {
    cohort_ref: 'lapsed_regulars' | 'delivery_drift' | 'festive_onetimers'
    recommended_action?: string
  }
  facts: Fact[]
  llm_reasoning: string
  priority_rank: number
  status: 'open' | 'actioned' | 'dismissed'
}

export interface FactResolve {
  fact_id: string
  label: string
  description: string
  cohort_ref: string
  resolved_at: string
  row_count: number
  rows: Record<string, unknown>[]
}

export interface Campaign {
  id: number
  name: string
  opportunity_id: number | null
  status: 'draft' | 'approved' | 'sending' | 'completed'
  created_at: string
  approved_at: string | null
  audience_size: number | null
}

export interface MessageTemplates {
  default: { whatsapp: string; sms: string }
  tiers?: { name: string; whatsapp: string; sms: string }[]
}

export interface CampaignDetail extends Campaign {
  segment_definition: {
    cohort_ref?: string
    customer_ids: number[]
    channel_strategy?: string
    suggested_send_time?: string
  }
  message_templates: MessageTemplates
}

export interface CampaignSendResult {
  campaign_id: number
  messages_created: number
  batches_dispatched: number
  channel_breakdown: Record<string, number>
}

export interface CampaignStats {
  campaign_id: number
  status: string
  audience_size: number
  by_status: Record<string, number>
  by_channel: Record<string, Record<string, number>>
  attributed_orders: number
  recovered_revenue_inr: number
  recovery_rate_pct: number
}

export interface Message {
  id: number
  campaign_id: number
  customer_id: number
  channel: 'whatsapp' | 'sms'
  status: string
  body: string
  sent_at: string | null
  last_event_at: string | null
}

export interface Debrief {
  narrative: string
  what_id_try_next: string
}

export interface ChannelConfig {
  mode: 'calm' | 'hostile'
  counters?: Record<string, number>
}

export interface RecoveryResult {
  campaign_id: number
  eligible_customers: number
  orders_simulated: number
  attributions_created: number
  recovered_revenue_inr: number
}
