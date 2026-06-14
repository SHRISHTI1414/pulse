"""Strategist endpoints — README §7.

The LLM is constrained to cite facts via {fact:fX} placeholders. It never
computes or invents figures. Schema is enforced by Pydantic + one retry.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from ..db import SessionLocal
from ..facts import FACTS, cohort_customer_ids, compute_all_facts, resolve_fact
from ..llm import LLMError, groq_chat_json
from ..models import Campaign, CampaignStatus, Opportunity, OpportunityStatus
from ..schemas import (
    CampaignOut,
    DraftCampaignEnvelope,
    FactResolveOut,
    GeneratedOpportunitiesEnvelope,
    GeneratedOpportunityItem,
    MessageTier,
    OpportunityOut,
)

log = logging.getLogger("crm.opportunities")

router = APIRouter()


COHORT_REFS = ("lapsed_regulars", "delivery_drift", "festive_onetimers")


# ── Prompts ────────────────────────────────────────────────────────────────


def _strategist_system_prompt() -> str:
    return """You are the marketing strategist for Brew Street, a 12-outlet coffee chain in Delhi NCR. Your job: review the customer base's COMPUTED FACTS and propose ranked win-back opportunities.

HARD RULES:
1. Only cite numbers from the FACTS list using {fact:fX} placeholders inside `reasoning`. NEVER invent or compute figures. If a number is not in FACTS, do not mention it.
2. Rank opportunities by recoverable value × recovery odds. Higher value × higher odds = lower priority_rank (1 = top).
3. The three cohorts are `lapsed_regulars`, `delivery_drift`, `festive_onetimers`. Return one opportunity per cohort.
4. If a cohort has poor recovery odds (e.g. very low repeat rate), say so explicitly in `reasoning` and give it a worse priority_rank.
5. Reply with ONLY valid JSON matching the requested schema. No prose outside JSON, no markdown fences.
"""


def _strategist_user_prompt(facts: list[dict]) -> str:
    facts_json = json.dumps(facts, indent=2, default=str)
    return f"""Here are the FACTS computed from the live customer base. Each has a fact_id you can cite as {{fact:f_lapsed_size}} etc:

{facts_json}

The three cohorts to consider:
- lapsed_regulars — customers who were weekly+ regulars (≥12 orders in 6 months pre-cutoff) and have stopped ordering in the last 45 days.
- delivery_drift — former dine_in regulars whose channel mix shifted to delivery-heavy and whose frequency is declining.
- festive_onetimers — Diwali-window promo acquisitions who never came back (≤2 lifetime orders).

Output JSON with this exact shape:
{{
  "opportunities": [
    {{
      "title": "<short headline>",
      "cohort_ref": "<one of lapsed_regulars | delivery_drift | festive_onetimers>",
      "reasoning": "<2–4 sentences. Cite facts inline as {{fact:fX}}. State recovery odds and why this ranks where it does.>",
      "priority_rank": <1 = top>,
      "recommended_action": "<one sentence: what to do>"
    }}
  ]
}}

Return one opportunity per cohort (3 total). Rank 1 should be the most recoverable revenue. Rank 3 should explicitly call out poor recovery odds if applicable."""


def _draft_system_prompt() -> str:
    return """You are drafting a win-back campaign for a specific Brew Street customer cohort. Write tight, warm message copy.

HARD RULES:
1. Only cite numbers via {fact:fX} placeholders (or omit numbers entirely).
2. Use {{name}} as a placeholder for the customer's first name. Do not include other personalisation tokens.
3. WhatsApp copy can be 1–2 short sentences (≤180 chars). SMS must be ≤160 chars total.
4. No emoji unless the brand voice calls for it (it doesn't here — keep clean, professional, warm).
5. Reply with ONLY valid JSON matching the requested schema. No prose, no markdown fences.
"""


def _draft_user_prompt(cohort_ref: str, facts: list[dict], opportunity_reasoning: str) -> str:
    cohort_label = {
        "lapsed_regulars": "weekday morning regulars who stopped ordering ~6 weeks ago",
        "delivery_drift": "former dine-in regulars who switched to delivery and are now ordering less often",
        "festive_onetimers": "customers acquired through last Diwali's festive offer who haven't returned",
    }[cohort_ref]
    facts_json = json.dumps(facts, indent=2, default=str)
    return f"""Cohort: {cohort_ref}
Cohort summary: {cohort_label}

Strategist reasoning:
{opportunity_reasoning}

Facts you may cite (only via {{fact:fX}}):
{facts_json}

Draft 2 message tiers (e.g. "warm reminder" and "incentive"). For each tier, write both a WhatsApp body (≤180 chars) and an SMS body (≤160 chars).

Output JSON:
{{
  "name": "<campaign name>",
  "tiers": [
    {{"name": "<tier label>", "whatsapp": "<body>", "sms": "<body>"}},
    {{"name": "<tier label>", "whatsapp": "<body>", "sms": "<body>"}}
  ],
  "channel_strategy": "<one line: when to use WhatsApp vs SMS>",
  "suggested_send_time": "<one line>"
}}"""


# ── Helpers ────────────────────────────────────────────────────────────────


def _allowed_fact_ids() -> set[str]:
    return set(FACTS.keys())


def _validate_fact_citations(text: str) -> list[str]:
    """Return any {fact:fX} citations in the text that aren't in the registry."""
    import re

    cited = re.findall(r"\{fact:([^}]+)\}", text)
    allowed = _allowed_fact_ids()
    return [c for c in cited if c not in allowed]


def _opportunity_out(o: Opportunity) -> OpportunityOut:
    return OpportunityOut(
        id=o.id,
        generated_at=o.generated_at,
        title=o.title,
        cohort_definition=o.cohort_definition,
        facts=o.facts,
        llm_reasoning=o.llm_reasoning,
        priority_rank=o.priority_rank,
        status=o.status.value,
    )


# ── Deterministic demo fallbacks ────────────────────────────────────────────
# Used when Groq is unavailable (no/expired GROQ_API_KEY, network failure, rate
# limit). They keep the demo fully functional without an LLM provider and only
# cite real fact_ids so downstream citation validation passes.

_COHORT_COPY: dict[str, tuple[str, str]] = {
    "lapsed_regulars": (
        "Win back lapsed weekly regulars",
        "Send a warm 'we miss you' WhatsApp with a returning-customer incentive.",
    ),
    "delivery_drift": (
        "Re-engage dine-in regulars drifting to delivery",
        "Invite them back in-store with a dine-in-only perk.",
    ),
    "festive_onetimers": (
        "Convert festive one-timers into repeat buyers",
        "Follow up with a time-boxed second-visit offer.",
    ),
}
_COHORT_RANK = {"lapsed_regulars": 1, "delivery_drift": 2, "festive_onetimers": 3}


def _fallback_opportunities(facts: list[dict]) -> GeneratedOpportunitiesEnvelope:
    by_cohort: dict[str, list[dict]] = {}
    for f in facts:
        by_cohort.setdefault(FACTS[f["fact_id"]].cohort_ref, []).append(f)

    items: list[GeneratedOpportunityItem] = []
    for cohort in COHORT_REFS:
        title, action = _COHORT_COPY[cohort]
        cfacts = by_cohort.get(cohort, [])
        size_fact = next((f["fact_id"] for f in cfacts if f["fact_id"].endswith("_size")), None)
        cite = f" Roughly {{fact:{size_fact}}} customers are affected." if size_fact else ""
        items.append(
            GeneratedOpportunityItem(
                title=title,
                cohort_ref=cohort,  # type: ignore[arg-type]
                reasoning=(
                    f"{title}.{cite} This recommendation was generated in demo mode "
                    "without the live strategist model."
                ),
                priority_rank=_COHORT_RANK[cohort],
                recommended_action=action,
            )
        )
    return GeneratedOpportunitiesEnvelope(opportunities=items)


def _fallback_draft(cohort_ref: str) -> DraftCampaignEnvelope:
    return DraftCampaignEnvelope(
        name=f"{_COHORT_COPY[cohort_ref][0]} (demo draft)",
        tiers=[
            MessageTier(
                name="Warm reminder",
                whatsapp="Hi {{name}}, we miss you at Brew Street! Your usual is waiting whenever you are.",
                sms="Hi {{name}}, we miss you at Brew Street. Drop by for your usual soon!",
            ),
            MessageTier(
                name="Incentive",
                whatsapp="Hi {{name}}, here's 20% off your next Brew Street order. See you soon!",
                sms="Hi {{name}}, enjoy 20% off your next Brew Street order. See you soon!",
            ),
        ],
        channel_strategy="Lead with WhatsApp for opted-in customers; fall back to SMS otherwise.",
        suggested_send_time="Weekday mornings, 8–10am IST.",
    )


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/opportunities/generate", response_model=list[OpportunityOut])
def generate_opportunities() -> list[OpportunityOut]:
    """Compute facts → Groq call → persist ranked opportunities."""
    with SessionLocal() as session:
        facts = compute_all_facts(session)

    try:
        envelope = groq_chat_json(
            system=_strategist_system_prompt(),
            user=_strategist_user_prompt(facts),
            schema_model=GeneratedOpportunitiesEnvelope,
        )
    except LLMError as e:
        log.warning("strategist LLM unavailable (%s) — using deterministic demo fallback", e)
        envelope = _fallback_opportunities(facts)

    # Validate no hallucinated fact ids in reasoning.
    for item in envelope.opportunities:
        bad = _validate_fact_citations(item.reasoning)
        if bad:
            log.warning("LLM cited unknown fact ids: %s — dropping citations", bad)
            for b in bad:
                item.reasoning = item.reasoning.replace(f"{{fact:{b}}}", "[unknown]")

    now = datetime.now(timezone.utc)
    out: list[OpportunityOut] = []
    with SessionLocal() as session:
        for item in envelope.opportunities:
            cohort_facts = [f for f in facts if FACTS[f["fact_id"]].cohort_ref == item.cohort_ref]
            opp = Opportunity(
                generated_at=now,
                title=item.title,
                cohort_definition={
                    "cohort_ref": item.cohort_ref,
                    "recommended_action": item.recommended_action,
                },
                facts=cohort_facts,
                llm_reasoning=item.reasoning,
                priority_rank=item.priority_rank,
                status=OpportunityStatus.open,
            )
            session.add(opp)
            session.flush()
            out.append(_opportunity_out(opp))
        session.commit()

    out.sort(key=lambda o: o.priority_rank)
    return out


@router.get("/opportunities", response_model=list[OpportunityOut])
def list_opportunities() -> list[OpportunityOut]:
    with SessionLocal() as session:
        rows = list(
            session.execute(
                select(Opportunity).order_by(Opportunity.priority_rank.asc())
            ).scalars()
        )
        return [_opportunity_out(o) for o in rows]


class OpportunityPatch(BaseModel):
    status: OpportunityStatus


@router.patch("/opportunities/{oid}", response_model=OpportunityOut)
def patch_opportunity(oid: int, body: OpportunityPatch) -> OpportunityOut:
    """Marketer action — set an opportunity to dismissed / open / actioned.

    Dismiss is treated as 'not now' — the next /opportunities/generate will
    produce a fresh row if the cohort still exists. We never delete history.
    """
    with SessionLocal() as session:
        opp = session.get(Opportunity, oid)
        if opp is None:
            raise HTTPException(404, "opportunity not found")
        opp.status = body.status
        session.commit()
        session.refresh(opp)
        return _opportunity_out(opp)


@router.get("/facts/{fact_id}/resolve", response_model=FactResolveOut)
def get_fact_resolve(fact_id: str) -> FactResolveOut:
    if fact_id not in FACTS:
        raise HTTPException(404, f"unknown fact_id: {fact_id}")
    with SessionLocal() as session:
        return FactResolveOut(**resolve_fact(session, fact_id))


@router.post("/opportunities/{oid}/draft-campaign", response_model=CampaignOut, status_code=201)
def draft_campaign(oid: int) -> CampaignOut:
    """Second Groq call → draft Campaign row (segment_definition = audience snapshot)."""
    with SessionLocal() as session:
        opp = session.get(Opportunity, oid)
        if opp is None:
            raise HTTPException(404, "opportunity not found")
        cohort_ref = opp.cohort_definition.get("cohort_ref")
        if cohort_ref not in COHORT_REFS:
            raise HTTPException(422, f"opportunity has invalid cohort_ref: {cohort_ref}")

        # Snapshot audience at draft time.
        customer_ids = cohort_customer_ids(session, cohort_ref)
        if not customer_ids:
            raise HTTPException(422, f"cohort {cohort_ref} resolved to 0 customers")

        cohort_facts = opp.facts
        reasoning = opp.llm_reasoning

    try:
        envelope = groq_chat_json(
            system=_draft_system_prompt(),
            user=_draft_user_prompt(cohort_ref, cohort_facts, reasoning),
            schema_model=DraftCampaignEnvelope,
        )
    except LLMError as e:
        log.warning("draft LLM unavailable (%s) — using deterministic demo fallback", e)
        envelope = _fallback_draft(cohort_ref)

    # Convert tiers → message_templates dict. The Phase 2 send pipeline
    # currently uses only "default"; we pick tier 1 as default, store the
    # rest so the marketer can swap/edit.
    templates: dict = {"default": {"whatsapp": "", "sms": ""}, "tiers": []}
    for i, tier in enumerate(envelope.tiers):
        templates["tiers"].append({"name": tier.name, "whatsapp": tier.whatsapp, "sms": tier.sms})
        if i == 0:
            templates["default"] = {"whatsapp": tier.whatsapp, "sms": tier.sms}

    segment_definition = {
        "cohort_ref": cohort_ref,
        "customer_ids": customer_ids,
        "channel_strategy": envelope.channel_strategy,
        "suggested_send_time": envelope.suggested_send_time,
    }

    with SessionLocal() as session:
        campaign = Campaign(
            opportunity_id=oid,
            name=envelope.name,
            segment_definition=segment_definition,
            message_templates=templates,
            status=CampaignStatus.draft,
            created_at=datetime.now(timezone.utc),
        )
        session.add(campaign)
        session.commit()
        session.refresh(campaign)
        return CampaignOut(
            id=campaign.id,
            name=campaign.name,
            opportunity_id=campaign.opportunity_id,
            status=campaign.status.value,
            created_at=campaign.created_at,
            approved_at=campaign.approved_at,
            audience_size=len(customer_ids),
        )
