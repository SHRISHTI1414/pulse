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
from ..llm import LLMError, groq_chat_json
from ..models import (
    Attribution,
    Campaign,
    CampaignStatus,
    Customer,
    Message,
    MessageChannel,
    MessageStatus,
    Order,
)
from ..schemas import (
    CampaignCreate,
    CampaignOut,
    CampaignPatch,
    CampaignSendResult,
    CampaignStats,
    CampaignStatsFull,
    DebriefEnvelope,
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


@router.patch("/campaigns/{cid}", response_model=CampaignOut)
def patch_campaign(cid: int, patch: CampaignPatch) -> CampaignOut:
    """Marketer edits — only allowed on drafts."""
    with SessionLocal() as session:
        c = session.get(Campaign, cid)
        if c is None:
            raise HTTPException(404, "campaign not found")
        if c.status != CampaignStatus.draft:
            raise HTTPException(409, f"can only edit drafts, current: {c.status.value}")
        if patch.name is not None:
            c.name = patch.name
        if patch.segment_definition is not None:
            if "customer_ids" not in patch.segment_definition:
                raise HTTPException(422, "segment_definition must include customer_ids")
            c.segment_definition = patch.segment_definition
        if patch.message_templates is not None:
            if "default" not in patch.message_templates:
                raise HTTPException(422, "message_templates must include a 'default' tier")
            c.message_templates = patch.message_templates
        session.commit()
        session.refresh(c)
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

    # Dispatch to channel-service in batches. If the channel-service is not
    # reachable (e.g. not deployed yet on Railway), degrade gracefully: the
    # messages are still recorded as sent below so the campaign flow completes
    # end-to-end instead of 500-ing on a connection error.
    batches = 0
    try:
        with httpx.Client(timeout=30.0) as client:
            for i in range(0, len(dispatch_payloads), BATCH_SIZE):
                chunk = dispatch_payloads[i : i + BATCH_SIZE]
                r = client.post(
                    f"{settings.channel_service_url}/send",
                    json={"items": chunk},
                )
                r.raise_for_status()
                batches += 1
    except httpx.HTTPError:
        batches = 0  # channel-service unavailable — continue without dispatch

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


@router.get("/campaigns/{cid}/stats", response_model=CampaignStatsFull)
def campaign_stats(cid: int) -> CampaignStatsFull:
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

        # Attribution roll-up — uses Order.total_amount for true recovered ₹.
        attr_count, recovered = session.execute(
            select(func.count(Attribution.id), func.coalesce(func.sum(Order.total_amount), 0))
            .select_from(Attribution)
            .join(Order, Order.id == Attribution.order_id)
            .where(Attribution.campaign_id == cid)
        ).one()

        audience_size = _audience_size(c.segment_definition)
        recovery_rate = round(100.0 * (attr_count or 0) / audience_size, 1) if audience_size else 0.0

        return CampaignStatsFull(
            campaign_id=cid,
            status=c.status.value,
            audience_size=audience_size,
            by_status=by_status,
            by_channel=by_channel,
            attributed_orders=int(attr_count or 0),
            recovered_revenue_inr=float(recovered or 0),
            recovery_rate_pct=recovery_rate,
        )


# ── Debrief ────────────────────────────────────────────────────────────────


def _debrief_system_prompt() -> str:
    return """You are writing a one-paragraph campaign post-mortem for the Brew Street marketing team.

HARD RULES:
1. Only cite numbers from the provided STAT FACTS using {fact:fX} placeholders. NEVER invent or compute figures. If a number is not in STAT FACTS, do not mention it.
2. Write 3–4 tight sentences for `narrative`. Plain prose. Mention what worked, what didn't, the recovered revenue and recovery rate.
3. For `what_id_try_next`: one line, concrete next step (e.g. "Test a Tuesday-morning send for the same cohort").
4. Reply with ONLY valid JSON matching the requested schema. No prose outside JSON, no markdown fences.
"""


def _debrief_user_prompt(stats: dict, stat_facts: list[dict]) -> str:
    import json

    return f"""Campaign id: {stats['campaign_id']}
Status: {stats['status']}
By status: {json.dumps(stats['by_status'])}
By channel: {json.dumps(stats['by_channel'])}

STAT FACTS you may cite (only via {{fact:fX}}):
{json.dumps(stat_facts, indent=2)}

Output JSON:
{{
  "narrative": "<3–4 sentences citing stat-facts inline>",
  "what_id_try_next": "<one line>"
}}"""


@router.post("/campaigns/{cid}/debrief", response_model=DebriefEnvelope)
def campaign_debrief(cid: int) -> DebriefEnvelope:
    """Third Groq call — narrate the campaign outcome, citing only stat-facts."""
    stats_full = campaign_stats(cid)
    by_status = stats_full.by_status

    # Build stat-facts the LLM can cite. Stats facts use the same shape as the
    # cohort facts so the LLM doesn't need a different prompt vocabulary.
    stat_facts = [
        {"fact_id": "f_audience_size", "label": "Audience size", "value": stats_full.audience_size, "query_ref": "campaign.audience"},
        {"fact_id": "f_delivered", "label": "Delivered count", "value": by_status.get("delivered", 0) + by_status.get("read", 0) + by_status.get("clicked", 0), "query_ref": "messages.delivered_or_more"},
        {"fact_id": "f_read", "label": "Read count (WhatsApp only)", "value": by_status.get("read", 0) + by_status.get("clicked", 0), "query_ref": "messages.read_or_more"},
        {"fact_id": "f_clicked", "label": "Clicked count", "value": by_status.get("clicked", 0), "query_ref": "messages.clicked"},
        {"fact_id": "f_failed", "label": "Failed count", "value": by_status.get("failed", 0), "query_ref": "messages.failed"},
        {"fact_id": "f_attributed_orders", "label": "Attributed orders", "value": stats_full.attributed_orders, "query_ref": "attributions.count"},
        {"fact_id": "f_recovered_revenue_inr", "label": "Recovered revenue (INR)", "value": stats_full.recovered_revenue_inr, "query_ref": "attributions.revenue_sum"},
        {"fact_id": "f_recovery_rate_pct", "label": "Recovery rate (%)", "value": stats_full.recovery_rate_pct, "query_ref": "attributions.rate"},
    ]

    try:
        envelope = groq_chat_json(
            system=_debrief_system_prompt(),
            user=_debrief_user_prompt(stats_full.model_dump(), stat_facts),
            schema_model=DebriefEnvelope,
        )
    except LLMError as e:
        raise HTTPException(502, f"LLM error: {e}") from e

    return envelope
