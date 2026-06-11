-- Pulse Phase 1 verification queries.
--
-- Run after scripts/generate_data.py. Each block has an expected result in
-- its header comment; Phase 1 closes only when queries 1–3 land within ±10%.
--
-- Anchored to --today = 2026-06-14 (cutoff for the lapse cohort: 2026-04-25).

-- ─────────────────────────────────────────────────────────────────────────
-- Query 1 — Lapsed weekday regulars (the hero cohort).
--   Customers with ≥12 orders in the 6 months before 2026-04-25
--   AND zero orders in the 45 days before 2026-06-14.
--   Expected: ~300 (Pattern 1 plants 300, with 10% steep-decay variants
--   that may still register a few late orders).
-- ─────────────────────────────────────────────────────────────────────────
WITH window_orders AS (
    SELECT
        customer_id,
        COUNT(*) FILTER (
            WHERE ordered_at >= TIMESTAMPTZ '2025-10-25 00:00+05:30'
              AND ordered_at <  TIMESTAMPTZ '2026-04-25 00:00+05:30'
        ) AS pre_cutoff_count,
        COUNT(*) FILTER (
            WHERE ordered_at >= TIMESTAMPTZ '2026-04-30 00:00+05:30'
              AND ordered_at <  TIMESTAMPTZ '2026-06-14 23:59+05:30'
        ) AS last_45d_count
    FROM orders
    GROUP BY customer_id
)
SELECT COUNT(*) AS lapsed_count
FROM window_orders
WHERE pre_cutoff_count >= 12
  AND last_45d_count = 0;

-- Query 1b — Same cohort, grouped by home store (concentration check).
--   Expected: heavy clustering on the 3 office-district stores
--   (Connaught Place, Cyber City, Noida Sec-18).
WITH window_orders AS (
    SELECT
        customer_id,
        COUNT(*) FILTER (
            WHERE ordered_at >= TIMESTAMPTZ '2025-10-25 00:00+05:30'
              AND ordered_at <  TIMESTAMPTZ '2026-04-25 00:00+05:30'
        ) AS pre_cutoff_count,
        COUNT(*) FILTER (
            WHERE ordered_at >= TIMESTAMPTZ '2026-04-30 00:00+05:30'
              AND ordered_at <  TIMESTAMPTZ '2026-06-14 23:59+05:30'
        ) AS last_45d_count
    FROM orders
    GROUP BY customer_id
),
lapsed AS (
    SELECT customer_id FROM window_orders
    WHERE pre_cutoff_count >= 12 AND last_45d_count = 0
)
SELECT
    s.name,
    s.is_office_district,
    COUNT(*) AS customers
FROM lapsed l
JOIN customers c ON c.id = l.customer_id
JOIN stores    s ON s.id = c.home_store_id
GROUP BY s.name, s.is_office_district
ORDER BY customers DESC;


-- ─────────────────────────────────────────────────────────────────────────
-- Query 2 — Delivery-drift cohort (declining-not-gone).
--   Delivery share ≥60% across Mar–May 2026,
--   AND ≤30% before Feb 2026,
--   AND last-60-day order count < prior monthly average.
--   Expected: ~450.
-- ─────────────────────────────────────────────────────────────────────────
WITH per_customer AS (
    SELECT
        customer_id,
        COUNT(*) FILTER (
            WHERE ordered_at >= TIMESTAMPTZ '2026-03-01 00:00+05:30'
              AND ordered_at <  TIMESTAMPTZ '2026-06-01 00:00+05:30'
        ) AS recent_total,
        COUNT(*) FILTER (
            WHERE ordered_at >= TIMESTAMPTZ '2026-03-01 00:00+05:30'
              AND ordered_at <  TIMESTAMPTZ '2026-06-01 00:00+05:30'
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
              AND ordered_at <  TIMESTAMPTZ '2026-06-14 23:59+05:30'
        ) AS last_60d,
        -- Average orders per 60d in their prior-history window.
        COUNT(*) FILTER (
            WHERE ordered_at < TIMESTAMPTZ '2026-02-01 00:00+05:30'
        )::float
            / GREATEST(
                EXTRACT(EPOCH FROM (
                    TIMESTAMPTZ '2026-02-01 00:00+05:30' - MIN(ordered_at)
                )) / 86400.0 / 60.0,
                1.0
            ) AS prior_per_60d_avg
    FROM orders
    GROUP BY customer_id
)
SELECT COUNT(*) AS drift_count
FROM per_customer
WHERE recent_total >= 3
  AND recent_delivery::float / recent_total >= 0.60
  AND prior_total >= 5
  AND prior_delivery::float / prior_total <= 0.30
  AND last_60d < prior_per_60d_avg;


-- ─────────────────────────────────────────────────────────────────────────
-- Query 3 — Festive one-timers (the decoy cohort).
--   festive_promo acquisitions with ≤2 lifetime orders.
--   Expected: ~700.
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS festive_onetimer_count
FROM customers c
WHERE c.acquisition_channel = 'festive_promo'
  AND (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) <= 2;


-- ─────────────────────────────────────────────────────────────────────────
-- Query 4 — Sanity histogram: orders per ISO week, last 26 weeks.
--   Expected: organic-looking shape, with an office-store dip visible
--   from late April onward (Pattern 1's hard stop).
-- ─────────────────────────────────────────────────────────────────────────
SELECT
    DATE_TRUNC('week', ordered_at AT TIME ZONE 'Asia/Kolkata')::date AS week_start,
    COUNT(*)                                                          AS total_orders,
    COUNT(*) FILTER (WHERE s.is_office_district)                      AS office_district_orders
FROM orders o
JOIN stores s ON s.id = o.store_id
WHERE ordered_at >= TIMESTAMPTZ '2025-12-14 00:00+05:30'
GROUP BY week_start
ORDER BY week_start;
