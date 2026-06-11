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
