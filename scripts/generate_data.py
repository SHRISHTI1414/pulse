"""Generate realistic Brew Street data with three planted patterns.

See README §5 and docs/data-spec.md. Reproducible from --seed.

Usage:
    python scripts/generate_data.py [--reset] [--seed 42] [--customers 6000]
                                    [--today 2026-06-14]
                                    [--lapsed-regulars 300]
                                    [--delivery-drift 450]
                                    [--festive-onetimers 700]

--reset truncates the 8 tables before generating. Without it, the script
refuses to run if the customers table is non-empty.
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import numpy as np
from faker import Faker
from sqlalchemy import insert, text

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "crm-api"))

from app.db import SessionLocal  # noqa: E402
from app.models import Customer, Order, Store  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))

# ── Reference data ──────────────────────────────────────────────────────────

STORE_DEFS: list[tuple[str, str, bool]] = [
    ("Brew Street Connaught Place", "Connaught Place", True),
    ("Brew Street Hauz Khas", "Hauz Khas", False),
    ("Brew Street Cyber City", "Cyber City", True),
    ("Brew Street Noida Sec-18", "Noida Sec-18", True),
    ("Brew Street Saket", "Saket", False),
    ("Brew Street Khan Market", "Khan Market", False),
    ("Brew Street DLF Phase 3", "DLF Phase 3", False),
    ("Brew Street Indirapuram", "Indirapuram", False),
    ("Brew Street Vasant Kunj", "Vasant Kunj", False),
    ("Brew Street Karol Bagh", "Karol Bagh", False),
    ("Brew Street Galleria Gurgaon", "Galleria Gurgaon", False),
    ("Brew Street Greater Kailash", "Greater Kailash", False),
]

# (name, price_inr). First BEV_END entries are beverages.
MENU: list[tuple[str, int]] = [
    ("Cappuccino", 180),
    ("Latte", 200),
    ("Americano", 150),
    ("Masala Chai", 120),
    ("Cold Brew", 240),
    ("Iced Latte", 230),
    ("Hot Chocolate", 220),
    ("Flat White", 210),
    ("Mocha", 240),
    # Food below
    ("Croissant", 160),
    ("Almond Croissant", 180),
    ("Veg Sandwich", 220),
    ("Chicken Sandwich", 280),
    ("Brownie", 140),
    ("Muffin", 120),
    ("Cookie", 80),
    ("Cheesecake", 260),
    ("Pasta", 320),
    ("Wrap", 240),
]
BEV_END = 9

PERSONAS = ["heavy_regular", "regular", "occasional", "one_timer"]
PERSONA_SHARES = [0.08, 0.20, 0.45, 0.27]
PERSONA_WEEKLY = {
    "heavy_regular": 3.0,
    "regular": 1.0,
    # 0.4/wk ≈ 1.7/mo — in spec's "1–3 orders/month" band; tuned so Pattern 1
    # query doesn't pick up natural lapsers in occasional cohort.
    "occasional": 0.4,
    "one_timer": 0.0,  # handled separately
}


# ── Helpers ─────────────────────────────────────────────────────────────────


def build_items_summary(target_amount: float, rng: np.random.Generator) -> str:
    """Pick 1–3 plausible items whose prices roughly match target_amount."""
    items: list[tuple[str, int]] = []
    bev_idx = int(rng.integers(0, BEV_END))
    bev = MENU[bev_idx]
    qty = int(rng.choice([1, 2], p=[0.75, 0.25]))
    items.append((bev[0], qty))
    remaining = target_amount - bev[1] * qty
    n_food = int(rng.choice([0, 1, 2], p=[0.30, 0.55, 0.15]))
    for _ in range(n_food):
        if remaining < 60:
            break
        food_idx = BEV_END + int(rng.integers(0, len(MENU) - BEV_END))
        food = MENU[food_idx]
        items.append((food[0], 1))
        remaining -= food[1]
    return ", ".join(f"{q}x {n}" for n, q in items)


def pick_channel(persona: str, rng: np.random.Generator) -> str:
    if persona == "heavy_regular":
        return str(rng.choice(["dine_in", "takeaway", "delivery"], p=[0.60, 0.25, 0.15]))
    if persona == "regular":
        return str(rng.choice(["dine_in", "takeaway", "delivery"], p=[0.55, 0.20, 0.25]))
    if persona == "occasional":
        return str(rng.choice(["dine_in", "takeaway", "delivery"], p=[0.50, 0.20, 0.30]))
    return str(rng.choice(["dine_in", "takeaway", "delivery"], p=[0.45, 0.20, 0.35]))


def pick_amount(channel: str, rng: np.random.Generator) -> float:
    if channel == "delivery":
        return float(np.round(rng.uniform(350, 650) / 10) * 10)
    return float(np.round(rng.uniform(200, 450) / 10) * 10)


def pick_hour(is_office: bool, is_weekend: bool, rng: np.random.Generator) -> int:
    if is_office and not is_weekend:
        slot = rng.choice(["morning", "evening", "other"], p=[0.60, 0.25, 0.15])
    elif not is_weekend:
        slot = rng.choice(["morning", "evening", "other"], p=[0.35, 0.40, 0.25])
    else:
        slot = rng.choice(["morning", "evening", "other"], p=[0.25, 0.50, 0.25])
    if slot == "morning":
        return int(rng.integers(8, 11))
    if slot == "evening":
        return int(rng.integers(17, 20))
    return int(rng.choice([7, 12, 13, 14, 15, 16, 21]))


# ── Generation ──────────────────────────────────────────────────────────────


def generate_customers(
    n: int,
    rng: np.random.Generator,
    faker: Faker,
    store_ids: list[int],
    today: date,
    history_start: date,
) -> list[dict]:
    persona_assignment = rng.choice(PERSONAS, size=n, p=PERSONA_SHARES)
    span = (today - history_start).days
    customers: list[dict] = []
    for i in range(n):
        persona = str(persona_assignment[i])
        # heavy/regular need ≥240 days of history so Pattern 1 has runway.
        if persona in ("heavy_regular", "regular"):
            min_days, max_days = 240, span
        elif persona == "occasional":
            min_days, max_days = 30, span
        else:
            min_days, max_days = 0, span
        days_ago = int(rng.integers(min_days, max_days + 1))
        acq_date = today - timedelta(days=days_ago)

        store_id = int(rng.choice(store_ids))
        # Baseline acquisition: walk_in dominant, some referral. festive_promo
        # is reserved for Pattern 3 — assigning it at baseline would inflate Q3.
        acq_ch = str(rng.choice(["walk_in", "referral"], p=[0.70, 0.30]))
        whatsapp = bool(rng.random() < 0.85)

        customers.append(
            {
                "_persona": persona,
                "_local_id": i,
                "name": faker.name(),
                "phone": faker.phone_number()[:30],
                "email": faker.email(),
                "home_store_id": store_id,
                "acquisition_date": acq_date,
                "acquisition_channel": acq_ch,
                "whatsapp_opt_in": whatsapp,
                "created_at": datetime.combine(acq_date, time(10, 0), tzinfo=IST),
            }
        )
    return customers


def generate_baseline_orders(
    customers: list[dict],
    store_lookup: dict[int, dict],
    rng: np.random.Generator,
    today: date,
    history_start: date,
) -> dict[int, list[dict]]:
    orders_by_local: dict[int, list[dict]] = defaultdict(list)
    store_id_list = list(store_lookup.keys())
    today_dt = datetime.combine(today, time.max, tzinfo=IST)

    for c in customers:
        persona = c["_persona"]
        start_date = max(c["acquisition_date"], history_start)
        if start_date >= today:
            continue
        span_days = (today - start_date).days

        if persona == "one_timer":
            n_orders = int(rng.choice([1, 2], p=[0.65, 0.35]))
        else:
            weeks = max(1, span_days / 7)
            mean_per_week = PERSONA_WEEKLY[persona]
            n_orders = int(rng.poisson(mean_per_week * weeks))
        if n_orders == 0:
            continue

        home_info = store_lookup[c["home_store_id"]]
        home_is_office = home_info["is_office"]

        for _ in range(n_orders):
            day_offset = int(rng.integers(0, span_days + 1))
            order_date = start_date + timedelta(days=day_offset)
            is_weekend = order_date.weekday() >= 5
            hour = pick_hour(home_is_office, is_weekend, rng)
            minute = int(rng.integers(0, 60))
            ts = datetime(
                order_date.year, order_date.month, order_date.day, hour, minute, tzinfo=IST
            )
            if ts > today_dt:
                continue

            # 85% at home store, otherwise any
            if rng.random() < 0.85:
                store_id = c["home_store_id"]
            else:
                store_id = int(rng.choice(store_id_list))

            channel = pick_channel(persona, rng)
            amount = pick_amount(channel, rng)
            items = build_items_summary(amount, rng)

            orders_by_local[c["_local_id"]].append(
                {
                    "_local_cid": c["_local_id"],
                    "store_id": store_id,
                    "order_channel": channel,
                    "total_amount": Decimal(str(amount)),
                    "items_summary": items,
                    "ordered_at": ts,
                }
            )
    return orders_by_local


# ── Pattern overlays ────────────────────────────────────────────────────────


def apply_pattern_lapsed(
    customers: list[dict],
    orders_by_local: dict[int, list[dict]],
    n_target: int,
    rng: np.random.Generator,
    today: date,
    store_lookup: dict[int, dict],
) -> list[int]:
    """Pattern 1: ~300 lapsed weekday regulars in office-district stores."""
    office_store_ids = [sid for sid, info in store_lookup.items() if info["is_office"]]
    eligible = [
        c
        for c in customers
        if c["_persona"] in ("heavy_regular", "regular")
        and c["home_store_id"] in office_store_ids
        and (today - c["acquisition_date"]).days >= 240
    ]
    if len(eligible) < n_target:
        print(f"  WARN: only {len(eligible)} eligible for lapsed, wanted {n_target}")
        n_target = len(eligible)

    chosen_idx = rng.choice(len(eligible), size=n_target, replace=False)
    selected = [eligible[int(i)] for i in chosen_idx]

    cutoff_base = date(2026, 4, 25)
    for c in selected:
        cutoff = cutoff_base + timedelta(days=int(rng.integers(-5, 6)))
        cutoff_dt = datetime.combine(cutoff, time.min, tzinfo=IST)
        hard_stop = bool(rng.random() < 0.9)

        new_orders: list[dict] = []
        for o in orders_by_local.get(c["_local_id"], []):
            ts = o["ordered_at"]
            if ts < cutoff_dt:
                # Force weekday-morning dine_in/takeaway at an office store.
                if ts.weekday() >= 5:
                    shift = ts.weekday() - 4
                    ts = ts - timedelta(days=shift)
                ts = ts.replace(
                    hour=int(rng.integers(8, 11)), minute=int(rng.integers(0, 60))
                )
                o["ordered_at"] = ts
                o["order_channel"] = "dine_in" if rng.random() < 0.7 else "takeaway"
                o["store_id"] = int(rng.choice(office_store_ids))
                # Lift AOV — pushes cohort annualized value into lakhs.
                amount = float(np.round(rng.uniform(280, 480) / 10) * 10)
                o["total_amount"] = Decimal(str(amount))
                o["items_summary"] = build_items_summary(amount, rng)
                new_orders.append(o)
            else:
                if not hard_stop and rng.random() < 0.10:
                    new_orders.append(o)
        orders_by_local[c["_local_id"]] = new_orders

    return [c["_local_id"] for c in selected]


def apply_pattern_drift(
    customers: list[dict],
    orders_by_local: dict[int, list[dict]],
    n_target: int,
    rng: np.random.Generator,
    today: date,
    exclude: list[int],
) -> list[int]:
    """Pattern 2: ~450 delivery-drift customers, declining but not gone."""
    exclude_set = set(exclude)
    cutoff_dt = datetime(2026, 4, 25, tzinfo=IST)
    # "Former dine_in regulars" → require genuine prior density. ≥20 pre-cutoff
    # orders keeps low-N occasional customers (who fail Q2's recent_total ≥ 3 /
    # prior_total ≥ 5 thresholds after decay) out of the pool.
    def pre_cutoff_count(cid: int) -> int:
        return sum(1 for o in orders_by_local.get(cid, []) if o["ordered_at"] < cutoff_dt)

    eligible = [
        c
        for c in customers
        if c["_persona"] in ("heavy_regular", "regular", "occasional")
        and c["_local_id"] not in exclude_set
        and (today - c["acquisition_date"]).days >= 180
        and pre_cutoff_count(c["_local_id"]) >= 20
    ]
    if len(eligible) < n_target:
        n_target = len(eligible)

    chosen_idx = rng.choice(len(eligible), size=n_target, replace=False)
    selected = [eligible[int(i)] for i in chosen_idx]

    drift_start = datetime(2026, 2, 1, tzinfo=IST)
    drift_end = datetime(2026, 5, 1, tzinfo=IST)

    for c in selected:
        decay_rate = float(rng.uniform(0.4, 0.6))
        new_orders: list[dict] = []
        for o in orders_by_local.get(c["_local_id"], []):
            ts = o["ordered_at"]
            if ts < drift_start:
                # Spec: "former dine_in regulars" — force pre-drift history to
                # be dine_in dominant so Q2's prior_delivery ≤ 30% filter holds.
                if o["order_channel"] == "delivery" and rng.random() < 0.85:
                    o["order_channel"] = "dine_in" if rng.random() < 0.75 else "takeaway"
                    amount = pick_amount(o["order_channel"], rng)
                    o["total_amount"] = Decimal(str(amount))
                    o["items_summary"] = build_items_summary(amount, rng)
                new_orders.append(o)
            elif ts < drift_end:
                # Drift window: shift ~88% to delivery (well above spec's 70%).
                if rng.random() < 0.88:
                    o["order_channel"] = "delivery"
                    amount = float(np.round(rng.uniform(380, 650) / 10) * 10)
                    o["total_amount"] = Decimal(str(amount))
                    o["items_summary"] = build_items_summary(amount, rng)
                new_orders.append(o)
            else:
                # Post-drift: frequency decay 40–60%; kept orders stay
                # delivery-leaning (they're still a delivery customer, just less).
                if rng.random() > decay_rate:
                    if rng.random() < 0.80:
                        o["order_channel"] = "delivery"
                        amount = float(np.round(rng.uniform(380, 650) / 10) * 10)
                        o["total_amount"] = Decimal(str(amount))
                        o["items_summary"] = build_items_summary(amount, rng)
                    new_orders.append(o)
        orders_by_local[c["_local_id"]] = new_orders

    return [c["_local_id"] for c in selected]


def apply_pattern_festive(
    customers: list[dict],
    orders_by_local: dict[int, list[dict]],
    n_target: int,
    rng: np.random.Generator,
    exclude: list[int],
) -> list[int]:
    """Pattern 3: ~700 festive one-timers — Diwali-window acquisitions."""
    exclude_set = set(exclude)
    eligible = [c for c in customers if c["_local_id"] not in exclude_set]
    if len(eligible) < n_target:
        n_target = len(eligible)

    chosen_idx = rng.choice(len(eligible), size=n_target, replace=False)
    selected = [eligible[int(i)] for i in chosen_idx]

    for c in selected:
        new_acq = date(2025, 10, 20) + timedelta(days=int(rng.integers(0, 17)))
        c["acquisition_date"] = new_acq
        c["acquisition_channel"] = "festive_promo"
        c["created_at"] = datetime.combine(new_acq, time(11, 0), tzinfo=IST)

        n_orders = int(rng.choice([1, 2], p=[0.55, 0.45]))
        new_orders: list[dict] = []
        for _ in range(n_orders):
            order_day = new_acq + timedelta(days=int(rng.integers(0, 5)))
            hour = int(rng.integers(11, 20))
            minute = int(rng.integers(0, 60))
            ts = datetime(
                order_day.year, order_day.month, order_day.day, hour, minute, tzinfo=IST
            )
            channel = str(rng.choice(["takeaway", "delivery"], p=[0.4, 0.6]))
            amount = float(np.round(rng.uniform(500, 900) / 10) * 10)
            new_orders.append(
                {
                    "_local_cid": c["_local_id"],
                    "store_id": c["home_store_id"],
                    "order_channel": channel,
                    "total_amount": Decimal(str(amount)),
                    "items_summary": build_items_summary(amount, rng),
                    "ordered_at": ts,
                }
            )
        orders_by_local[c["_local_id"]] = new_orders

    return [c["_local_id"] for c in selected]


# ── Driver ──────────────────────────────────────────────────────────────────


def reset_tables(session) -> None:
    print("[reset] TRUNCATE attributions, receipt_events, messages, campaigns,")
    print("        opportunities, orders, customers, stores RESTART IDENTITY CASCADE")
    session.execute(
        text(
            "TRUNCATE attributions, receipt_events, messages, campaigns, "
            "opportunities, orders, customers, stores "
            "RESTART IDENTITY CASCADE"
        )
    )
    session.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--customers", type=int, default=6000)
    parser.add_argument("--today", type=str, default="2026-06-14")
    parser.add_argument("--lapsed-regulars", type=int, default=300)
    parser.add_argument("--delivery-drift", type=int, default=450)
    parser.add_argument("--festive-onetimers", type=int, default=700)
    parser.add_argument("--reset", action="store_true", help="TRUNCATE all tables first")
    args = parser.parse_args()

    today = date.fromisoformat(args.today)
    history_start = today - timedelta(days=int(30.4 * 15))

    print(f"[seed]       {args.seed}")
    print(f"[today]      {today}")
    print(f"[history]    {history_start} → {today} ({(today - history_start).days} days)")
    print(f"[customers]  {args.customers}")
    print(
        f"[patterns]   lapsed={args.lapsed_regulars} drift={args.delivery_drift} "
        f"festive={args.festive_onetimers}"
    )
    print()

    rng = np.random.default_rng(args.seed)
    faker = Faker("en_IN")
    Faker.seed(args.seed)

    with SessionLocal() as session:
        existing = session.execute(text("SELECT COUNT(*) FROM customers")).scalar() or 0
        if existing > 0:
            if not args.reset:
                print(f"[abort] customers has {existing} rows; pass --reset to wipe.")
                sys.exit(1)
            reset_tables(session)

        # Stores
        print("[stores]   inserting 12 stores")
        store_rows = []
        for name, locality, is_office in STORE_DEFS:
            opened_offset = int(rng.integers(900, 2200))
            store_rows.append(
                {
                    "name": name,
                    "locality": locality,
                    "opened_date": today - timedelta(days=opened_offset),
                    "is_office_district": is_office,
                }
            )
        result = session.execute(
            insert(Store).returning(Store.id, Store.name, Store.is_office_district),
            store_rows,
        )
        store_lookup: dict[int, dict] = {}
        for row in result:
            store_lookup[row.id] = {"name": row.name, "is_office": row.is_office_district}
        session.commit()
        store_ids = list(store_lookup.keys())
        print(f"           {len(store_lookup)} stores inserted")

        # Customers (in memory)
        print(f"[custs]    generating {args.customers} customer profiles")
        customers = generate_customers(args.customers, rng, faker, store_ids, today, history_start)
        persona_counts: dict[str, int] = defaultdict(int)
        for c in customers:
            persona_counts[c["_persona"]] += 1
        print(f"           personas: {dict(persona_counts)}")

        # Baseline orders
        print("[orders]   generating baseline order streams")
        orders_by_local = generate_baseline_orders(
            customers, store_lookup, rng, today, history_start
        )
        baseline_count = sum(len(v) for v in orders_by_local.values())
        print(f"           baseline orders: {baseline_count:,}")

        # Patterns
        print("[p1]       overlay: lapsed weekday regulars")
        lapsed_ids = apply_pattern_lapsed(
            customers, orders_by_local, args.lapsed_regulars, rng, today, store_lookup
        )
        print(f"           selected: {len(lapsed_ids)}")

        print("[p2]       overlay: delivery drift")
        drift_ids = apply_pattern_drift(
            customers, orders_by_local, args.delivery_drift, rng, today, lapsed_ids
        )
        print(f"           selected: {len(drift_ids)}")

        print("[p3]       overlay: festive one-timers")
        festive_ids = apply_pattern_festive(
            customers, orders_by_local, args.festive_onetimers, rng, lapsed_ids + drift_ids
        )
        print(f"           selected: {len(festive_ids)}")

        # Insert customers
        print("[insert]   customers")
        customer_rows = [
            {
                "name": c["name"],
                "phone": c["phone"],
                "email": c["email"],
                "home_store_id": c["home_store_id"],
                "acquisition_date": c["acquisition_date"],
                "acquisition_channel": c["acquisition_channel"],
                "whatsapp_opt_in": c["whatsapp_opt_in"],
                "created_at": c["created_at"],
            }
            for c in customers
        ]
        result = session.execute(insert(Customer).returning(Customer.id), customer_rows)
        real_ids = [row.id for row in result]
        session.commit()
        for c, rid in zip(customers, real_ids):
            c["_real_id"] = rid
        print(f"           inserted {len(real_ids):,} customers")

        # Insert orders
        local_to_real = {c["_local_id"]: c["_real_id"] for c in customers}
        all_orders = []
        for local_id, orders in orders_by_local.items():
            real_cid = local_to_real[local_id]
            for o in orders:
                all_orders.append(
                    {
                        "customer_id": real_cid,
                        "store_id": o["store_id"],
                        "order_channel": o["order_channel"],
                        "total_amount": o["total_amount"],
                        "items_summary": o["items_summary"],
                        "ordered_at": o["ordered_at"],
                    }
                )
        total_orders = len(all_orders)
        print(f"[insert]   {total_orders:,} orders (batches of 10k)")
        batch = 10_000
        for i in range(0, total_orders, batch):
            chunk = all_orders[i : i + batch]
            session.execute(insert(Order), chunk)
            session.commit()
            print(f"           {min(i + batch, total_orders):,}/{total_orders:,}")

        # Hero cohort value (computed in memory for speed)
        lapsed_set = set(lapsed_ids)
        cutoff = datetime(2026, 4, 25, tzinfo=IST)
        six_mo_before = cutoff - timedelta(days=180)
        trailing_value = Decimal("0")
        trailing_orders = 0
        for c in customers:
            if c["_local_id"] not in lapsed_set:
                continue
            for o in orders_by_local.get(c["_local_id"], []):
                if six_mo_before <= o["ordered_at"] < cutoff:
                    trailing_value += o["total_amount"]
                    trailing_orders += 1
        annualized = trailing_value * 2

        print()
        print("=" * 60)
        print("Generation summary")
        print("=" * 60)
        print(f"  Stores                  : {len(store_lookup)}")
        print(f"  Customers               : {len(customers):,}")
        print(f"  Orders                  : {total_orders:,}")
        print(f"  Pattern 1 (lapsed)      : {len(lapsed_ids)}")
        print(f"  Pattern 2 (drift)       : {len(drift_ids)}")
        print(f"  Pattern 3 (festive)     : {len(festive_ids)}")
        print()
        print(f"  Hero cohort trailing-6mo orders : {trailing_orders:,}")
        print(f"  Hero cohort trailing-6mo value  : Rs {trailing_value:,.0f}")
        print(f"  Hero cohort ANNUALIZED VALUE    : Rs {annualized:,.0f}")
        print(f"                                     ({annualized / 100000:,.2f} lakh)")
        print()


if __name__ == "__main__":
    main()
