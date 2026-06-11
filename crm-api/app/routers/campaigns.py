"""Campaign create / approve / send / inspect — Phase 2 pipeline.

Phase 2 supports only explicit segments: `{"customer_ids": [...]}`. Phase 3's
strategist will resolve cohort references into customer_ids before this point.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from sqlalchemy import func, insert, select

from ..config import settings
from ..db import SessionLocal
from ..models import (
    Campaign,
    CampaignStatus,
    Customer,
    Message,
    MessageChannel,
    MessageStatus,
)
from ..schemas import (
    CampaignCreate,
    CampaignOut,
    CampaignSendResult,
    CampaignStats,
    MessageOut,
)

log = logging.getLogger("crm.campaigns")

router = APIRouter()

BATCH_SIZE = 100


# ── Helpers ────────────────────────────────────────────────────────────────


def _audience_size(seg: dict) -> int:
    return len(seg.get("customer_ids", []))


def _campaign_out(c: Campaign, audience_size: int | None = None) -> CampaignOut:
    return CampaignOut(
        id=c.id,
        name=c.name,
        opportunity_id=c.opportunity_id,
        status=c.status.value,
        created_at=c.created_at,
        approved_at=c.approved_at,
        audience_size=audience_size,
    )


def _render(template: str, customer: Customer) -> str:
    first_name = customer.name.split(" ")[0] if customer.name else "there"
    return template.replace("{{name}}", first_name)


def _choose_channel(customer: Customer) -> MessageChannel:
    return MessageChannel.whatsapp if customer.whatsapp_opt_in else MessageChannel.sms


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/campaigns", response_model=CampaignOut, status_code=201)
def create_campaign(body: CampaignCreate) -> CampaignOut:
    if "customer_ids" not in body.segment_definition:
        raise HTTPException(
            422, "Phase 2 segment_definition must include a 'customer_ids' list"
        )
    if "default" not in body.message_templates:
        raise HTTPException(422, "message_templates must include a 'default' tier")

    with SessionLocal() as session:
        campaign = Campaign(
            name=body.name,
            opportunity_id=body.opportunity_id,
            segment_definition=body.segment_definition,
            message_templates=body.message_templates,
            status=CampaignStatus.draft,
            created_at=datetime.now(timezone.utc),
        )
        session.add(campaign)
        session.commit()
        session.refresh(campaign)
        return _campaign_out(campaign, audience_size=_audience_size(body.segment_definition))


@router.get("/campaigns/{cid}", response_model=CampaignOut)
def get_campaign(cid: int) -> CampaignOut:
    with SessionLocal() as session:
        c = session.get(Campaign, cid)
        if c is None:
            raise HTTPException(404, "campaign not found")
        return _campaign_out(c, audience_size=_audience_size(c.segment_definition))


@router.post("/campaigns/{cid}/approve", response_model=CampaignOut)
def approve_campaign(cid: int) -> CampaignOut:
    with SessionLocal() as session:
        c = session.get(Campaign, cid)
        if c is None:
            raise HTTPException(404, "campaign not found")
        if c.status != CampaignStatus.draft:
            raise HTTPException(409, f"can only approve drafts, current: {c.status.value}")
        c.status = CampaignStatus.approved
        c.approved_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(c)
        return _campaign_out(c, audience_size=_audience_size(c.segment_definition))


@router.post("/campaigns/{cid}/send", response_model=CampaignSendResult)
def send_campaign(cid: int) -> CampaignSendResult:
    """Materialize audience → create messages (queued) → batch /send → mark sent.

    Sync handler intentionally: this does sync SQLAlchemy work (Neon round-trips
    for 500+ inserts) — running as `def` puts it in FastAPI's threadpool, leaving
    the event loop free to service receipt callbacks from channel-service during
    the same window. A previous async version blocked the event loop and caused
    every concurrent /receipts request to time out.
    """
    with SessionLocal() as session:
        campaign = session.get(Campaign, cid)
        if campaign is None:
            raise HTTPException(404, "campaign not found")
        if campaign.status != CampaignStatus.approved:
            raise HTTPException(409, f"campaign must be approved, current: {campaign.status.value}")

        audience_ids: list[int] = campaign.segment_definition.get("customer_ids", [])
        if not audience_ids:
            raise HTTPException(422, "segment_definition has empty customer_ids")

        customers = list(
            session.execute(select(Customer).where(Customer.id.in_(audience_ids))).scalars()
        )
        templates = campaign.message_templates["default"]

        message_rows: list[dict] = []
        for c in customers:
            ch = _choose_channel(c)
            tpl = templates.get(ch.value) or templates.get("whatsapp") or "Hi {{name}}"
            body = _render(tpl, c)
            message_rows.append(
                {
                    "campaign_id": campaign.id,
                    "customer_id": c.id,
                    "channel": ch.value,
                    "body": body,
                    "status": MessageStatus.queued.value,
                }
            )

        if not message_rows:
            raise HTTPException(422, "no customers resolved from segment_definition")

        result = session.execute(insert(Message).returning(Message.id), message_rows)
        msg_ids = [row.id for row in result]

        dispatch_payloads = [
            {
                "message_id": mid,
                "channel": row["channel"],
                "recipient": c.phone,
                "body": row["body"],
            }
            for c, mid, row in zip(customers, msg_ids, message_rows)
        ]

        campaign.status = CampaignStatus.sending
        session.commit()

    # Dispatch to channel-service in batches.
    batches = 0
    with httpx.Client(timeout=30.0) as client:
        for i in range(0, len(dispatch_payloads), BATCH_SIZE):
            chunk = dispatch_payloads[i : i + BATCH_SIZE]
            r = client.post(
                f"{settings.channel_service_url}/send",
                json={"items": chunk},
            )
            r.raise_for_status()
            batches += 1

    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        session.execute(
            Message.__table__.update()
            .where(Message.id.in_(msg_ids))
            .values(status=MessageStatus.sent.value, sent_at=now)
        )
        session.commit()

    channel_breakdown = Counter(p["channel"] for p in dispatch_payloads)
    return CampaignSendResult(
        campaign_id=cid,
        messages_created=len(dispatch_payloads),
        batches_dispatched=batches,
        channel_breakdown=dict(channel_breakdown),
    )


@router.get("/campaigns/{cid}/messages", response_model=list[MessageOut])
def list_messages(cid: int, limit: int = 50) -> list[MessageOut]:
    with SessionLocal() as session:
        rows = list(
            session.execute(
                select(Message).where(Message.campaign_id == cid).limit(limit)
            ).scalars()
        )
        return [
            MessageOut(
                id=m.id,
                campaign_id=m.campaign_id,
                customer_id=m.customer_id,
                channel=m.channel.value,
                status=m.status.value,
                body=m.body,
                sent_at=m.sent_at,
                last_event_at=m.last_event_at,
            )
            for m in rows
        ]


@router.get("/campaigns/{cid}/stats", response_model=CampaignStats)
def campaign_stats(cid: int) -> CampaignStats:
    with SessionLocal() as session:
        c = session.get(Campaign, cid)
        if c is None:
            raise HTTPException(404, "campaign not found")

        rows = list(
            session.execute(
                select(Message.channel, Message.status, func.count())
                .where(Message.campaign_id == cid)
                .group_by(Message.channel, Message.status)
            ).all()
        )
        by_status: dict[str, int] = {}
        by_channel: dict[str, dict[str, int]] = {}
        for channel, st, n in rows:
            by_status[st.value] = by_status.get(st.value, 0) + n
            by_channel.setdefault(channel.value, {})[st.value] = n

        return CampaignStats(
            campaign_id=cid,
            status=c.status.value,
            audience_size=_audience_size(c.segment_definition),
            by_status=by_status,
            by_channel=by_channel,
        )
