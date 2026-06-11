"""Pydantic v2 request/response schemas. Per README §13: all bodies typed."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Receipts ────────────────────────────────────────────────────────────────


class ReceiptEventIn(BaseModel):
    event_id: str
    message_id: int
    event_type: Literal["sent", "delivered", "read", "clicked", "failed"]
    occurred_at: datetime
    payload: dict[str, Any] | None = None


class ReceiptEventOut(BaseModel):
    status: Literal["accepted", "duplicate", "unknown_message"]
    transitioned: bool = False
    new_status: str | None = None
    reason: str | None = None


# ── Campaigns ───────────────────────────────────────────────────────────────


class CampaignCreate(BaseModel):
    """Create a draft campaign.

    `segment_definition` shapes supported in Phase 2:
      * {"customer_ids": [1, 2, 3, ...]}   — explicit list
    Phase 3 will add cohort_ref resolution.

    `message_templates` shape (one tier in Phase 2):
      * {"default": {"whatsapp": "Hi {{name}}, ...", "sms": "Hi {{name}}, ..."}}
    """

    name: str
    opportunity_id: int | None = None
    segment_definition: dict[str, Any]
    message_templates: dict[str, Any]


class CampaignOut(BaseModel):
    id: int
    name: str
    opportunity_id: int | None
    status: str
    created_at: datetime
    approved_at: datetime | None
    audience_size: int | None = None


class CampaignSendResult(BaseModel):
    campaign_id: int
    messages_created: int
    batches_dispatched: int
    channel_breakdown: dict[str, int]


class MessageOut(BaseModel):
    id: int
    campaign_id: int
    customer_id: int
    channel: str
    status: str
    body: str
    sent_at: datetime | None
    last_event_at: datetime | None


class CampaignStats(BaseModel):
    campaign_id: int
    status: str
    audience_size: int
    by_status: dict[str, int]
    by_channel: dict[str, dict[str, int]]


class CampaignPatch(BaseModel):
    """Marketer edit endpoint — allow tweaking name + templates + segment.

    All fields optional; only provided ones are applied. Status-changing edits
    (approve, send) have their own endpoints.
    """

    name: str | None = None
    segment_definition: dict[str, Any] | None = None
    message_templates: dict[str, Any] | None = None


# ── Opportunities / facts (Phase 3) ─────────────────────────────────────────


class FactOut(BaseModel):
    fact_id: str
    label: str
    value: Any
    query_ref: str


class GeneratedOpportunityItem(BaseModel):
    title: str
    cohort_ref: Literal["lapsed_regulars", "delivery_drift", "festive_onetimers"]
    reasoning: str  # may reference {fact:fX}
    priority_rank: int
    recommended_action: str


class GeneratedOpportunitiesEnvelope(BaseModel):
    """Schema the LLM must emit. The envelope is enforced via Pydantic."""

    opportunities: list[GeneratedOpportunityItem]


class OpportunityOut(BaseModel):
    id: int
    generated_at: datetime
    title: str
    cohort_definition: dict[str, Any]
    facts: list[FactOut]
    llm_reasoning: str
    priority_rank: int
    status: str


class FactResolveOut(BaseModel):
    fact_id: str
    label: str
    description: str
    cohort_ref: str
    resolved_at: str
    row_count: int
    rows: list[dict[str, Any]]


# ── Draft campaign (Phase 3 second Groq call) ───────────────────────────────


class MessageTier(BaseModel):
    name: str
    whatsapp: str
    sms: str


class DraftCampaignEnvelope(BaseModel):
    """Schema the LLM must emit for draft-campaign."""

    name: str
    tiers: list[MessageTier]
    channel_strategy: str
    suggested_send_time: str


# ── Orders ingestion + attribution (Phase 4) ────────────────────────────────


class OrderIngestIn(BaseModel):
    customer_id: int
    store_id: int
    order_channel: Literal["dine_in", "takeaway", "delivery"]
    total_amount: float
    items_summary: str
    ordered_at: datetime


class AttributionOut(BaseModel):
    id: int
    order_id: int
    campaign_id: int
    message_id: int
    model: str
    created_at: datetime


class OrderIngestOut(BaseModel):
    order_id: int
    attribution: AttributionOut | None


class RecoverySimResult(BaseModel):
    campaign_id: int
    eligible_customers: int
    orders_simulated: int
    attributions_created: int
    recovered_revenue_inr: float


# ── Extended stats (Phase 4) ────────────────────────────────────────────────


class CampaignStatsFull(BaseModel):
    campaign_id: int
    status: str
    audience_size: int
    by_status: dict[str, int]
    by_channel: dict[str, dict[str, int]]
    attributed_orders: int
    recovered_revenue_inr: float
    recovery_rate_pct: float


# ── Debrief (Phase 4) ───────────────────────────────────────────────────────


class DebriefEnvelope(BaseModel):
    """LLM-emitted debrief narrative. Cites only provided stat-facts."""

    narrative: str  # 3–4 sentences citing {fact:fX}
    what_id_try_next: str  # one line
