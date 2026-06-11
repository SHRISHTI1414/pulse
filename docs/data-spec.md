# Pulse — Data Spec

Context: AI-native mini CRM for Brew Street, a fictional Delhi-NCR coffee/QSR chain with 12 outlets. Pulse detects revenue leaking from the existing customer base (lapsing regulars), lets an AI strategist propose win-back campaigns, sends them through a stubbed channel service, and attributes recovered revenue.

This document is the authoritative spec for the **database schema** and the **synthetic data patterns** used in development. See the root `README.md` for the full product spec.

---

## Schema (8 tables)

### `stores`
- `id` (pk)
- `name`
- `locality`
- `opened_date`
- `is_office_district` (boolean) — true for Connaught Place, Cyber City, Noida Sec-18.

Seed 12 stores across NCR localities: Connaught Place, Hauz Khas, Cyber City, Noida Sec-18, Saket, Khan Market, DLF Phase 3, Indirapuram, Vasant Kunj, Karol Bagh, Galleria Gurgaon, Greater Kailash.

### `customers`
- `id`
- `name`
- `phone`
- `email`
- `home_store_id` (fk → stores.id)
- `acquisition_date`
- `acquisition_channel` enum: `walk_in` | `festive_promo` | `referral`
- `whatsapp_opt_in` (boolean, ~85% true)
- `created_at`

### `orders`
- `id`
- `customer_id` (fk → customers.id)
- `store_id` (fk → stores.id)
- `order_channel` enum: `dine_in` | `takeaway` | `delivery`
- `total_amount` (numeric, INR)
- `items_summary` (text; e.g. "2x Cappuccino, 1x Almond Croissant")
- `ordered_at` (timestamptz)
- Index on `(customer_id, ordered_at)`

### `opportunities`
- `id`
- `generated_at`
- `title`
- `cohort_definition` (jsonb)
- `facts` (jsonb — array of `{fact_id, label, value, query_ref}`)
- `llm_reasoning` (text — references fact_ids inline, e.g. `{fact:f3}`)
- `priority_rank` (int)
- `status` enum: `open` | `actioned` | `dismissed`

### `campaigns`
- `id`
- `opportunity_id` (fk → opportunities.id, nullable)
- `name`
- `segment_definition` (jsonb)
- `message_templates` (jsonb)
- `status` enum: `draft` | `approved` | `sending` | `completed`
- `created_at`
- `approved_at` (nullable)

### `messages`
- `id`
- `campaign_id` (fk → campaigns.id)
- `customer_id` (fk → customers.id)
- `channel` enum: `whatsapp` | `sms`
- `body` (text)
- `status` enum: `queued` | `sent` | `delivered` | `read` | `clicked` | `failed`
- `sent_at`
- `last_event_at`

> State machine note: WhatsApp can reach `read`/`clicked`. SMS never enters `read` (no read receipts); its terminal positive state is `delivered` (or `clicked` if the body had a tracked link). Enforced in Phase 2 by `app/state_machine.py`.

### `receipt_events`
- `id`
- `message_id` (fk → messages.id)
- `event_type` (text)
- `event_id` (text, **UNIQUE** — idempotency key from the channel service)
- `occurred_at`
- `received_at`
- `payload` (jsonb)

### `attributions`
- `id`
- `order_id` (fk → orders.id)
- `campaign_id` (fk → campaigns.id)
- `message_id` (fk → messages.id)
- `model` (text; e.g. `last_touch_7d`)
- `created_at`

---

## Data Generator Spec (`scripts/generate_data.py`)

CLI args (defaults):
```
--seed 42
--customers 6000
--today 2026-06-14
--lapsed-regulars 300
--delivery-drift 450
--festive-onetimers 700
```

Fully reproducible from `--seed`. History window: **15 months ending at `--today`**. Uses bulk inserts, `faker` (`en_IN` locale), and `numpy` (seeded) for distributions.

### Baseline population (generated first)

Each customer gets a latent persona (not stored; used only for generation):

| Persona | Share | Frequency |
|---|---|---|
| heavy_regular | 8% | 2.5–4 orders/week |
| regular | 20% | ~1 order/week |
| occasional | 45% | 1–3 orders/month |
| one_timer | 27% | 1–2 lifetime orders |

Order realism:
- Timestamps weighted to morning peak (08:00–11:00) and evening peak (17:00–20:00). Office-district stores skew weekday-morning; others skew evening/weekend.
- AOV: dine_in / takeaway ₹200–450; delivery ₹350–650 (bigger baskets). Realistic rounding.
- `items_summary` built from a menu list (cappuccino, latte, cold brew, masala chai, croissant, sandwich, brownie, …), consistent with the amount.
- Channel mix baseline: ~55% dine_in, 20% takeaway, 25% delivery — varies by persona.
- Mild monthly noise so charts don't look synthetic.

### Pattern overlays (mutate chosen customers' order streams)

**Pattern 1 — Lapsed weekday regulars (~300, the hero cohort).** Drawn from heavy_regular / regular personas. Home store = one of the 3 office-district outlets. Weekday-morning dine_in / takeaway profile. ≥6 months of steady history. Then a **hard stop (90%)** or **steep decay (10%)** starting around **2026-04-25 (±5 days)**. Tune AOV × frequency so the cohort's **annualized value lands in the lakhs** (₹). Generator prints this value at the end.

**Pattern 2 — Delivery drift (~450, declining-not-gone).** Former dine_in regulars whose channel mix shifts to **70%+ delivery across Feb–Apr 2026**. After that, order frequency decays **40–60%**. They still order occasionally up to `--today`. Must be visibly distinct from Pattern 1 (active but declining vs. gone).

**Pattern 3 — Festive one-timers (~700, the decoy).** `acquisition_date` ∈ **2025-10-20 → 2025-11-05**, `acquisition_channel = festive_promo`. **1–2 high-AOV (₹500–900) gifting-style orders** inside that window, then nothing. Big cohort, low recovery odds — the Phase 3 strategist should learn to deprioritize it.

### Verification (`scripts/verify_patterns.sql`)

Four raw SQL queries, each commented with expected results:
1. Lapsed regulars: ≥12 orders in the 6 months before 2026-04-25 AND zero orders in the 45 days before 2026-06-14 → **~300**, concentrated in the 3 office-district stores.
2. Delivery drift: delivery share ≥60% Mar–May 2026 vs ≤30% before Feb 2026, with last-60-day order count below prior average → **~450**.
3. Festive one-timers: `festive_promo` acquisitions with ≤2 lifetime orders → **~700**.
4. Sanity histogram: orders per ISO week for the last 26 weeks (organic shape, office-store dip visible after late April).

Phase 1 acceptance: queries 1–3 land within ±10% of targets.
