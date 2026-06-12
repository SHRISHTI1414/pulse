"""Audience-sample endpoint for the Cohort Detail screen.

Returns a small sample of real customers from a cohort, with the attributes
that make the cohort make sense (orders before lapse, monthly spend before
lapse, home store, last order date).

Uses the same cohort definitions as the strategist (app/facts.py) — so
'lapsed_regulars' here resolves the same SQL CTE as f_lapsed_size etc.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from ..db import SessionLocal
from ..facts import LAPSE_CUTOFF, SIX_MO_BEFORE_CUTOFF, TODAY
from ..models import Opportunity

router = APIRouter()


class AudienceCustomer(BaseModel):
    id: int
    name: str
    home_store: str
    pre_lapse_orders: int | None = None
    pre_lapse_monthly_spend: float | None = None
    last_order_at: str | None = None
    avg_lifetime_value: float | None = None


class AudienceSample(BaseModel):
    cohort_ref: str
    sample_size: int
    rows: list[AudienceCustomer]


# Per-cohort SQL: returns top-N customers in the cohort with audience-detail
# columns the UI needs. The CTE defining the cohort itself is copy-paste from
# facts.py — kept here so this endpoint stays self-contained.

_SAMPLE_SQL = {
    "lapsed_regulars": f"""
        WITH per_cust AS (
            SELECT
                customer_id,
                COUNT(*) FILTER (
                    WHERE ordered_at >= TIMESTAMPTZ '{SIX_MO_BEFORE_CUTOFF}'
                      AND ordered_at < TIMESTAMPTZ '{LAPSE_CUTOFF}'
                ) AS pre_cutoff_count,
                COUNT(*) FILTER (
                    WHERE ordered_at >= TIMESTAMPTZ '2026-04-30 00:00+05:30'
                      AND ordered_at < TIMESTAMPTZ '{TODAY}'
                ) AS last_45d_count,
                SUM(total_amount) FILTER (
                    WHERE ordered_at >= TIMESTAMPTZ '{SIX_MO_BEFORE_CUTOFF}'
                      AND ordered_at < TIMESTAMPTZ '{LAPSE_CUTOFF}'
                ) AS pre_cutoff_value,
                MAX(ordered_at) FILTER (
                    WHERE ordered_at < TIMESTAMPTZ '{LAPSE_CUTOFF}'
                ) AS last_order_before_cutoff
            FROM orders
            GROUP BY customer_id
        ),
        lapsed AS (
            SELECT customer_id, pre_cutoff_count, pre_cutoff_value,
                   last_order_before_cutoff
            FROM per_cust
            WHERE pre_cutoff_count >= 12 AND last_45d_count = 0
        )
        SELECT
            c.id,
            c.name,
            s.name AS home_store,
            l.pre_cutoff_count AS pre_lapse_orders,
            ROUND(l.pre_cutoff_value::numeric / 6.0, 0) AS pre_lapse_monthly_spend,
            TO_CHAR(l.last_order_before_cutoff, 'YYYY-MM-DD') AS last_order_at,
            NULL::numeric AS avg_lifetime_value
        FROM lapsed l
        JOIN customers c ON c.id = l.customer_id
        JOIN stores    s ON s.id = c.home_store_id
        ORDER BY l.pre_cutoff_value DESC
        LIMIT :n
    """,
    "delivery_drift": f"""
        WITH per_cust AS (
            SELECT
                customer_id,
                COUNT(*) FILTER (
                    WHERE ordered_at >= TIMESTAMPTZ '2026-03-01 00:00+05:30'
                      AND ordered_at < TIMESTAMPTZ '2026-06-01 00:00+05:30'
                ) AS recent_total,
                COUNT(*) FILTER (
                    WHERE ordered_at >= TIMESTAMPTZ '2026-03-01 00:00+05:30'
                      AND ordered_at < TIMESTAMPTZ '2026-06-01 00:00+05:30'
                      AND order_channel = 'delivery'
                ) AS recent_delivery,
                COUNT(*) FILTER (
                    WHERE ordered_at < TIMESTAMPTZ '2026-02-01 00:00+05:30'
                ) AS prior_total,
                COUNT(*) FILTER (
                    WHERE ordered_at < TIMESTAMPTZ '2026-02-01 00:00+05:30'
                      AND order_channel = 'delivery'
                ) AS prior_delivery,
                COUNT(*) FILTER (
                    WHERE ordered_at >= TIMESTAMPTZ '2026-04-15 00:00+05:30'
                      AND ordered_at < TIMESTAMPTZ '{TODAY}'
                ) AS last_60d,
                COUNT(*) FILTER (
                    WHERE ordered_at < TIMESTAMPTZ '2026-02-01 00:00+05:30'
                )::float
                  / GREATEST(EXTRACT(EPOCH FROM (TIMESTAMPTZ '2026-02-01 00:00+05:30' - MIN(ordered_at))) / 86400.0 / 60.0, 1.0)
                  AS prior_per_60d_avg,
                SUM(total_amount) AS lifetime_value,
                MAX(ordered_at) AS last_order
            FROM orders
            GROUP BY customer_id
        ),
        drift AS (
            SELECT customer_id, recent_total, recent_delivery, prior_total,
                   prior_delivery, last_60d, prior_per_60d_avg, lifetime_value,
                   last_order
            FROM per_cust
            WHERE recent_total >= 3
              AND recent_delivery::float / recent_total >= 0.60
              AND prior_total >= 5
              AND prior_delivery::float / prior_total <= 0.30
              AND last_60d < prior_per_60d_avg
        )
        SELECT
            c.id,
            c.name,
            s.name AS home_store,
            d.recent_total AS pre_lapse_orders,
            NULL::numeric AS pre_lapse_monthly_spend,
            TO_CHAR(d.last_order, 'YYYY-MM-DD') AS last_order_at,
            ROUND((d.lifetime_value / NULLIF(d.recent_total + d.prior_total, 0))::numeric, 0) AS avg_lifetime_value
        FROM drift d
        JOIN customers c ON c.id = d.customer_id
        JOIN stores    s ON s.id = c.home_store_id
        ORDER BY d.recent_total DESC
        LIMIT :n
    """,
    "festive_onetimers": f"""
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
        SELECT
            c.id,
            c.name,
            s.name AS home_store,
            f.lifetime_orders AS pre_lapse_orders,
            NULL::numeric AS pre_lapse_monthly_spend,
            TO_CHAR(f.last_order_at, 'YYYY-MM-DD') AS last_order_at,
            ROUND(f.lifetime_value::numeric, 0) AS avg_lifetime_value
        FROM festive f
        JOIN customers c ON c.id = f.customer_id
        JOIN stores    s ON s.id = c.home_store_id
        ORDER BY f.lifetime_value DESC
        LIMIT :n
    """,
}


@router.get(
    "/opportunities/{oid}/audience-sample",
    response_model=AudienceSample,
)
def get_audience_sample(oid: int, limit: int = 10) -> AudienceSample:
    if limit < 1 or limit > 50:
        raise HTTPException(422, "limit must be 1..50")

    with SessionLocal() as session:
        opp = session.get(Opportunity, oid)
        if opp is None:
            raise HTTPException(404, "opportunity not found")
        cohort_ref = opp.cohort_definition.get("cohort_ref")
        sql = _SAMPLE_SQL.get(cohort_ref)
        if sql is None:
            raise HTTPException(422, f"unknown cohort_ref: {cohort_ref}")

        rows = list(session.execute(text(sql), {"n": limit}).mappings())
        return AudienceSample(
            cohort_ref=cohort_ref,
            sample_size=len(rows),
            rows=[
                AudienceCustomer(
                    id=int(r["id"]),
                    name=str(r["name"]),
                    home_store=str(r["home_store"]),
                    pre_lapse_orders=int(r["pre_lapse_orders"]) if r["pre_lapse_orders"] is not None else None,
                    pre_lapse_monthly_spend=float(r["pre_lapse_monthly_spend"]) if r["pre_lapse_monthly_spend"] is not None else None,
                    last_order_at=r["last_order_at"],
                    avg_lifetime_value=float(r["avg_lifetime_value"]) if r["avg_lifetime_value"] is not None else None,
                )
                for r in rows
            ],
        )
