"""Phase 2 gate: 500 messages in hostile mode → every final status correct,
zero duplicate effects (per README §6 phase gate).

Pre-req: both services running.
    cd crm-api         && uvicorn app.main:app --port 8000 &
    cd channel-service && uvicorn app.main:app --port 8001 &

Usage:
    python scripts/phase2_gate.py [--audience 500] [--wait 60]
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "crm-api"))

from sqlalchemy import func, select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Campaign,
    Customer,
    Message,
    MessageChannel,
    MessageStatus,
    ReceiptEvent,
)

CRM = "http://localhost:8000"
CHAN = "http://localhost:8001"

TERMINAL_OR_SETTLED: set[str] = {"delivered", "read", "clicked", "failed"}


def fetch_audience(n: int) -> list[int]:
    with SessionLocal() as session:
        rows = session.execute(select(Customer.id).limit(n)).all()
        return [r[0] for r in rows]


def run_gate(audience_size: int, wait_seconds: int) -> int:
    # 1. Both services reachable
    print("[gate] health-checking services…")
    for name, url in [("crm-api", CRM), ("channel-service", CHAN)]:
        r = httpx.get(f"{url}/health", timeout=5.0)
        r.raise_for_status()
        print(f"       {name}: {r.json()['status']}")

    # 2. Reset counters + flip to hostile
    httpx.post(f"{CHAN}/config/reset-counters", timeout=5.0).raise_for_status()
    httpx.post(f"{CHAN}/config", json={"mode": "hostile"}, timeout=5.0).raise_for_status()
    cfg = httpx.get(f"{CHAN}/config", timeout=5.0).json()
    print(f"[gate] channel-service mode: {cfg['mode']}")

    # 3. Pick audience
    audience = fetch_audience(audience_size)
    if len(audience) < audience_size:
        print(f"[gate] WARN: only {len(audience)} customers available")
    print(f"[gate] audience: {len(audience)} customers")

    # 4. Create + approve + send
    body = {
        "name": f"phase2-gate-{int(time.time())}",
        "segment_definition": {"customer_ids": audience},
        "message_templates": {
            "default": {
                "whatsapp": "Hi {{name}}, miss your morning Brew? Reply to chat.",
                "sms": "Brew Street: hi {{name}}, miss us? See offers at brew.st/r",
            }
        },
    }
    r = httpx.post(f"{CRM}/campaigns", json=body, timeout=30.0)
    r.raise_for_status()
    cid = r.json()["id"]
    print(f"[gate] campaign {cid} created")

    httpx.post(f"{CRM}/campaigns/{cid}/approve", timeout=10.0).raise_for_status()
    print(f"[gate] campaign {cid} approved")

    send_resp = httpx.post(f"{CRM}/campaigns/{cid}/send", timeout=60.0)
    send_resp.raise_for_status()
    send_payload = send_resp.json()
    print(
        f"[gate] dispatched: messages={send_payload['messages_created']} "
        f"batches={send_payload['batches_dispatched']} "
        f"channels={send_payload['channel_breakdown']}"
    )
    messages_created = send_payload["messages_created"]

    # 5. Poll until messages settle, OR settled stops moving for ≥12s.
    # (Don't use channel-service "events_emitted" — that's bumped at scheduling
    # time, before sleeps + semaphore-throttled POSTs, so it goes flat early.)
    start = time.time()
    deadline = start + wait_seconds
    stats: dict = {}
    last_settled = -1
    settled_stable_since: float | None = None
    while time.time() < deadline:
        try:
            stats = httpx.get(f"{CRM}/campaigns/{cid}/stats", timeout=30.0).json()
        except httpx.RequestError:
            time.sleep(3)
            continue
        by_status = stats["by_status"]
        settled = sum(by_status.get(s, 0) for s in TERMINAL_OR_SETTLED)

        if settled != last_settled:
            print(
                f"       t+{int(time.time() - start):>3}s "
                f"settled={settled}/{messages_created}  {by_status}"
            )
            last_settled = settled
            settled_stable_since = time.time()

        if settled >= messages_created:
            break

        # If settled hasn't moved in 12s AND we're past the 20s jitter window,
        # accept what we have and let validation decide.
        if (
            settled_stable_since
            and time.time() - settled_stable_since > 12
            and time.time() - start > 35
        ):
            print(f"       settled count idle for >12s; concluding")
            break

        time.sleep(3)

    # 6. Validate.
    print()
    print("=" * 64)
    print("Phase 2 gate — validation")
    print("=" * 64)

    by_status = stats["by_status"]
    by_channel = stats["by_channel"]
    settled = sum(by_status.get(s, 0) for s in TERMINAL_OR_SETTLED)
    unsettled = messages_created - settled

    print(f"  messages_created   : {messages_created}")
    print(f"  settled            : {settled}")
    print(f"  unsettled          : {unsettled}")
    print(f"  by_status          : {by_status}")
    print(f"  by_channel         : {by_channel}")

    # Per-message DB checks.
    with SessionLocal() as session:
        # SMS messages must never be in `read` state.
        sms_read_violations = (
            session.execute(
                select(func.count())
                .where(Message.campaign_id == cid)
                .where(Message.channel == MessageChannel.sms)
                .where(Message.status == MessageStatus.read)
            ).scalar_one()
        )

        # Duplicate effect check: each receipt_event row is unique by event_id.
        # Both counts in ONE query for a consistent snapshot.
        msg_ids_sub = select(Message.id).where(Message.campaign_id == cid).subquery()
        total_events, unique_event_ids = session.execute(
            select(
                func.count(),
                func.count(func.distinct(ReceiptEvent.event_id)),
            ).where(ReceiptEvent.message_id.in_(select(msg_ids_sub)))
        ).one()

    print(f"  receipt_events     : {total_events} stored, {unique_event_ids} unique")
    print(f"  SMS-read illegal   : {sms_read_violations}")

    # channel-service counters (generous timeout — service may still be draining)
    cs_counters = httpx.get(f"{CHAN}/config", timeout=30.0).json()["counters"]
    print(f"  channel counters   : {cs_counters}")

    duplicates_emitted = cs_counters.get("events_duplicated", 0)

    print()
    print("─" * 64)
    failures: list[str] = []
    if unsettled != 0:
        failures.append(f"{unsettled} message(s) still unsettled after {wait_seconds}s")
    if sms_read_violations != 0:
        failures.append(f"{sms_read_violations} SMS message(s) in illegal `read` state")
    if total_events != unique_event_ids:
        failures.append(
            f"receipt_events table has duplicates ({total_events} rows, {unique_event_ids} unique)"
        )
    if duplicates_emitted > 0 and unique_event_ids == total_events:
        # Good: duplicates were emitted by channel-service AND absorbed by /receipts.
        print(f"  ✓ {duplicates_emitted} duplicate emissions absorbed idempotently")

    # Flip back to calm so subsequent runs aren't surprised.
    httpx.post(f"{CHAN}/config", json={"mode": "calm"}, timeout=5.0).raise_for_status()

    if failures:
        print("\n  ✗ PHASE 2 GATE FAILED:")
        for f in failures:
            print(f"      - {f}")
        return 1

    print("  ✓ PHASE 2 GATE PASSED")
    return 0


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--audience", type=int, default=500)
    p.add_argument("--wait", type=int, default=80, help="seconds to wait for settle")
    args = p.parse_args()
    sys.exit(run_gate(args.audience, args.wait))


if __name__ == "__main__":
    main()
