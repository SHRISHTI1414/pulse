"""Named SQL facts. Each fact is one number the LLM is allowed to cite,
plus an optional detail query that powers Phase 5's clickable evidence chips.

The strategist prompt's hard rule: the model may only cite numbers from
this registry via {fact:fX} placeholders. It must never invent or compute.

All queries are anchored to --today = 2026-06-14 (matches Phase 1 data spec).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class FactDef:
    id: str
    label: str
    description: str
    cohort_ref: str  # lapsed_regulars | delivery_drift | festive_onetimers
    value_sql: str  # must return one row with column `value`
    detail_sql: str | None  # rows for GET /facts/{id}/resolve; default = value_sql


# ── Reusable date anchors (IST) ─────────────────────────────────────────────

TODAY = "2026-06-14 23:59+05:30"
LAPSE_CUTOFF = "2026-04-25 00:00+05:30"
SIX_MO_BEFORE_CUTOFF = "2025-10-25 00:00+05:30"
LAST_45D_START = "2026-04-30 00:00+05:30"
DRIFT_START = "2026-02-01 00:00+05:30"
DRIFT_END = "2026-05-01 00:00+05:30"
RECENT_WINDOW_START = "2026-03-01 00:00+05:30"
RECENT_WINDOW_END = "2026-06-01 00:00+05:30"
FESTIVE_START = "2025-10-20"
FESTIVE_END = "2025-11-05"

# ── Cohort CTEs reused across multiple facts ───────────────────────────────

CTE_LAPSED = f"""
WITH per_cust AS (
    SELECT
        customer_id,
        COUNT(*) FILTER (WHERE ordered_at >= TIMESTAMPTZ '{SIX_MO_BEFORE_CUTOFF}' AND ordered_at < TIMESTAMPTZ '{LAPSE_CUTOFF}') AS pre_cutoff_count,
        COUNT(*) FILTER (WHERE ordered_at >= TIMESTAMPTZ '{LAST_45D_START}' AND ordered_at < TIMESTAMPTZ '{TODAY}') AS last_45d_count,
        SUM(total_amount) FILTER (WHERE ordered_at >= TIMESTAMPTZ '{SIX_MO_BEFORE_CUTOFF}' AND ordered_at < TIMESTAMPTZ '{LAPSE_CUTOFF}') AS pre_cutoff_value
    FROM orders
    GROUP BY customer_id
),
lapsed AS (
    SELECT customer_id, pre_cutoff_value
    FROM per_cust
    WHERE pre_cutoff_count >= 12 AND last_45d_count = 0
)
"""

CTE_DRIFT = f"""
WITH per_cust AS (
    SELECT
        customer_id,
        COUNT(*) FILTER (WHERE ordered_at >= TIMESTAMPTZ '{RECENT_WINDOW_START}' AND ordered_at < TIMESTAMPTZ '{RECENT_WINDOW_END}') AS recent_total,
        COUNT(*) FILTER (WHERE ordered_at >= TIMESTAMPTZ '{RECENT_WINDOW_START}' AND ordered_at < TIMESTAMPTZ '{RECENT_WINDOW_END}' AND order_channel = 'delivery') AS recent_delivery,
        COUNT(*) FILTER (WHERE ordered_at < TIMESTAMPTZ '{DRIFT_START}') AS prior_total,
        COUNT(*) FILTER (WHERE ordered_at < TIMESTAMPTZ '{DRIFT_START}' AND order_channel = 'delivery') AS prior_delivery,
        COUNT(*) FILTER (WHERE ordered_at >= TIMESTAMPTZ '2026-04-15 00:00+05:30' AND ordered_at < TIMESTAMPTZ '{TODAY}') AS last_60d,
        COUNT(*) FILTER (WHERE ordered_at < TIMESTAMPTZ '{DRIFT_START}')::float
            / GREATEST(EXTRACT(EPOCH FROM (TIMESTAMPTZ '{DRIFT_START}' - MIN(ordered_at))) / 86400.0 / 60.0, 1.0) AS prior_per_60d_avg
    FROM orders
    GROUP BY customer_id
),
drift AS (
    SELECT customer_id, recent_total, recent_delivery, prior_total, prior_delivery, last_60d, prior_per_60d_avg
    FROM per_cust
    WHERE recent_total >= 3
      AND recent_delivery::float / recent_total >= 0.60
      AND prior_total >= 5
      AND prior_delivery::float / prior_total <= 0.30
      AND last_60d < prior_per_60d_avg
)
"""

CTE_FESTIVE = f"""
WITH order_summary AS (
    SELECT customer_id,
           COUNT(*) AS lifetime_orders,
           SUM(total_amount) AS lifetime_value,
           MAX(ordered_at) AS last_order_at
    FROM orders GROUP BY customer_id
),
festive AS (
    SELECT c.id AS customer_id,
           COALESCE(os.lifetime_orders, 0) AS lifetime_orders,
           COALESCE(os.lifetime_value, 0) AS lifetime_value,
           os.last_order_at
    FROM customers c
    LEFT JOIN order_summary os ON os.customer_id = c.id
    WHERE c.acquisition_channel = 'festive_promo'
      AND COALESCE(os.lifetime_orders, 0) <= 2
)
"""


# ── Fact registry ──────────────────────────────────────────────────────────

FACTS: dict[str, FactDef] = {
    # ── Lapsed weekday regulars (hero cohort) ───────────────────────────────
    "f_lapsed_size": FactDef(
        id="f_lapsed_size",
        label="Lapsed weekday regulars — cohort size",
        description="Customers with ≥12 orders in the 6 months before 2026-04-25 and zero orders in the last 45 days.",
        cohort_ref="lapsed_regulars",
        value_sql=CTE_LAPSED + "SELECT COUNT(*) AS value FROM lapsed",
        detail_sql=CTE_LAPSED + """
            SELECT c.id, c.name, c.phone, c.whatsapp_opt_in, s.name AS home_store
            FROM lapsed l
            JOIN customers c ON c.id = l.customer_id
            JOIN stores s ON s.id = c.home_store_id
            ORDER BY l.pre_cutoff_value DESC
            LIMIT 100
        """,
    ),
    "f_lapsed_trailing_6mo_value": FactDef(
        id="f_lapsed_trailing_6mo_value",
        label="Lapsed cohort — trailing 6-month revenue (INR)",
        description="Sum of total_amount for the lapsed cohort across the 6 months before lapse cutoff.",
        cohort_ref="lapsed_regulars",
        value_sql=CTE_LAPSED + "SELECT COALESCE(SUM(pre_cutoff_value), 0) AS value FROM lapsed",
        detail_sql=None,
    ),
    "f_lapsed_annualized_value": FactDef(
        id="f_lapsed_annualized_value",
        label="Lapsed cohort — annualized revenue at risk (INR)",
        description="Trailing 6-month revenue × 2; the headline 'value leaking' number.",
        cohort_ref="lapsed_regulars",
        value_sql=CTE_LAPSED + "SELECT COALESCE(SUM(pre_cutoff_value), 0) * 2 AS value FROM lapsed",
        detail_sql=None,
    ),
    "f_lapsed_office_share_pct": FactDef(
        id="f_lapsed_office_share_pct",
        label="Lapsed cohort — % concentrated in office-district stores",
        description="Share of lapsed customers whose home store is one of the 3 office-district outlets.",
        cohort_ref="lapsed_regulars",
        value_sql=CTE_LAPSED + """
            SELECT ROUND(
                100.0 * COUNT(*) FILTER (WHERE s.is_office_district) / NULLIF(COUNT(*), 0),
                1
            ) AS value
            FROM lapsed l
            JOIN customers c ON c.id = l.customer_id
            JOIN stores s ON s.id = c.home_store_id
        """,
        detail_sql=CTE_LAPSED + """
            SELECT s.name, s.is_office_district, COUNT(*) AS customers
            FROM lapsed l
            JOIN customers c ON c.id = l.customer_id
            JOIN stores s ON s.id = c.home_store_id
            GROUP BY s.name, s.is_office_district
            ORDER BY customers DESC
        """,
    ),
    "f_lapsed_whatsapp_optin_pct": FactDef(
        id="f_lapsed_whatsapp_optin_pct",
        label="Lapsed cohort — % opted in to WhatsApp",
        description="WhatsApp opt-in share within the lapsed cohort.",
        cohort_ref="lapsed_regulars",
        value_sql=CTE_LAPSED + """
            SELECT ROUND(
                100.0 * COUNT(*) FILTER (WHERE c.whatsapp_opt_in) / NULLIF(COUNT(*), 0),
                1
            ) AS value
            FROM lapsed l JOIN customers c ON c.id = l.customer_id
        """,
        detail_sql=None,
    ),
    # ── Delivery drift cohort ───────────────────────────────────────────────
    "f_drift_size": FactDef(
        id="f_drift_size",
        label="Delivery-drift cohort size",
        description="Former dine_in regulars whose channel mix shifted to ≥60% delivery in Mar–May 2026 and whose recent frequency dropped below their prior average.",
        cohort_ref="delivery_drift",
        value_sql=CTE_DRIFT + "SELECT COUNT(*) AS value FROM drift",
        detail_sql=CTE_DRIFT + """
            SELECT c.id, c.name, c.whatsapp_opt_in, s.name AS home_store,
                   d.recent_total, d.recent_delivery,
                   ROUND(100.0 * d.recent_delivery / d.recent_total, 1) AS recent_delivery_pct
            FROM drift d
            JOIN customers c ON c.id = d.customer_id
            JOIN stores s ON s.id = c.home_store_id
            ORDER BY d.recent_total DESC
            LIMIT 100
        """,
    ),
    "f_drift_avg_recent_delivery_pct": FactDef(
        id="f_drift_avg_recent_delivery_pct",
        label="Drift cohort — avg delivery share in Mar–May 2026",
        description="Mean recent_delivery / recent_total within the drift cohort.",
        cohort_ref="delivery_drift",
        value_sql=CTE_DRIFT + """
            SELECT ROUND(AVG(100.0 * recent_delivery / NULLIF(recent_total, 0))::numeric, 1) AS value FROM drift
        """,
        detail_sql=None,
    ),
    "f_drift_avg_freq_decay_pct": FactDef(
        id="f_drift_avg_freq_decay_pct",
        label="Drift cohort — avg frequency decay (%) last 60 days vs prior average",
        description="100 × (1 − last_60d / prior_per_60d_avg), averaged across the drift cohort.",
        cohort_ref="delivery_drift",
        value_sql=CTE_DRIFT + """
            SELECT ROUND(
                AVG(100.0 * (1.0 - last_60d / NULLIF(prior_per_60d_avg, 0)))::numeric, 1
            ) AS value FROM drift
        """,
        detail_sql=None,
    ),
    "f_drift_whatsapp_optin_pct": FactDef(
        id="f_drift_whatsapp_optin_pct",
        label="Drift cohort — % opted in to WhatsApp",
        description="WhatsApp opt-in share within the delivery-drift cohort.",
        cohort_ref="delivery_drift",
        value_sql=CTE_DRIFT + """
            SELECT ROUND(
                100.0 * COUNT(*) FILTER (WHERE c.whatsapp_opt_in) / NULLIF(COUNT(*), 0),
                1
            ) AS value
            FROM drift d JOIN customers c ON c.id = d.customer_id
        """,
        detail_sql=None,
    ),
    # ── Festive one-timers (decoy) ──────────────────────────────────────────
    "f_festive_size": FactDef(
        id="f_festive_size",
        label="Festive one-timers cohort size",
        description="festive_promo acquisitions with ≤2 lifetime orders.",
        cohort_ref="festive_onetimers",
        value_sql=CTE_FESTIVE + "SELECT COUNT(*) AS value FROM festive",
        detail_sql=CTE_FESTIVE + """
            SELECT c.id, c.name, c.acquisition_date, f.lifetime_orders, f.lifetime_value
            FROM festive f JOIN customers c ON c.id = f.customer_id
            ORDER BY f.lifetime_value DESC
            LIMIT 100
        """,
    ),
    "f_festive_avg_lifetime_value": FactDef(
        id="f_festive_avg_lifetime_value",
        label="Festive one-timers — avg lifetime spend per customer (INR)",
        description="Mean lifetime spend per customer in the festive cohort.",
        cohort_ref="festive_onetimers",
        value_sql=CTE_FESTIVE + "SELECT ROUND(AVG(lifetime_value)::numeric, 0) AS value FROM festive",
        detail_sql=None,
    ),
    "f_festive_pct_dormant_180d": FactDef(
        id="f_festive_pct_dormant_180d",
        label="Festive cohort — % with zero orders in last 180 days",
        description="Share of festive cohort whose last order is more than 180 days old. High = poor recovery odds (they have not engaged since the promo).",
        cohort_ref="festive_onetimers",
        value_sql=CTE_FESTIVE + f"""
            SELECT ROUND(
                100.0 * COUNT(*) FILTER (
                    WHERE last_order_at IS NULL
                       OR last_order_at < TIMESTAMPTZ '{TODAY}'::timestamptz - INTERVAL '180 days'
                ) / NULLIF(COUNT(*), 0),
                1
            ) AS value FROM festive
        """,
        detail_sql=None,
    ),
    "f_festive_whatsapp_optin_pct": FactDef(
        id="f_festive_whatsapp_optin_pct",
        label="Festive cohort — % opted in to WhatsApp",
        description="WhatsApp opt-in share within the festive cohort.",
        cohort_ref="festive_onetimers",
        value_sql=CTE_FESTIVE + """
            SELECT ROUND(
                100.0 * COUNT(*) FILTER (WHERE c.whatsapp_opt_in) / NULLIF(COUNT(*), 0),
                1
            ) AS value
            FROM festive f JOIN customers c ON c.id = f.customer_id
        """,
        detail_sql=None,
    ),
}


# ── Cohort customer-id resolvers (used by draft-campaign to snapshot audience) ──

COHORT_AUDIENCE_SQL: dict[str, str] = {
    "lapsed_regulars": CTE_LAPSED + "SELECT customer_id FROM lapsed",
    "delivery_drift": CTE_DRIFT + "SELECT customer_id FROM drift",
    "festive_onetimers": CTE_FESTIVE + "SELECT customer_id FROM festive",
}


# ── API ─────────────────────────────────────────────────────────────────────


def compute_fact(session: Session, fact_id: str) -> dict[str, Any]:
    fact = FACTS[fact_id]
    value = session.execute(text(fact.value_sql)).scalar()
    if value is None:
        value = 0
    # Normalize numpy/decimal to plain python.
    if hasattr(value, "item"):
        value = value.item()
    try:
        if value == int(value):
            value = int(value)
        else:
            value = float(value)
    except (TypeError, ValueError):
        pass
    return {
        "fact_id": fact.id,
        "label": fact.label,
        "value": value,
        "query_ref": fact.id,
    }


def compute_all_facts(session: Session) -> list[dict[str, Any]]:
    return [compute_fact(session, fid) for fid in FACTS]


def resolve_fact(session: Session, fact_id: str) -> dict[str, Any]:
    fact = FACTS[fact_id]
    sql = fact.detail_sql or fact.value_sql
    rows = session.execute(text(sql)).mappings().all()
    return {
        "fact_id": fact.id,
        "label": fact.label,
        "description": fact.description,
        "cohort_ref": fact.cohort_ref,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "row_count": len(rows),
        "rows": [dict(r) for r in rows],
    }


def cohort_customer_ids(session: Session, cohort_ref: str) -> list[int]:
    sql = COHORT_AUDIENCE_SQL.get(cohort_ref)
    if sql is None:
        raise KeyError(f"unknown cohort_ref: {cohort_ref}")
    rows = session.execute(text(sql)).all()
    return [r[0] for r in rows]
