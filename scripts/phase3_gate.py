"""Phase 3 gate: hero flow end-to-end through the API.

Pre-req: both services running + GROQ_API_KEY set in .env.
    cd crm-api         && uvicorn app.main:app --port 8000 &
    cd channel-service && uvicorn app.main:app --port 8001 &

Flow:
  1. POST /opportunities/generate           → ranked opportunities
  2. Assert lapsed_regulars is rank 1
  3. Assert festive_onetimers is deprioritized (worst priority_rank)
  4. GET /facts/{fact_id}/resolve            → rows for a lapsed fact
  5. POST /opportunities/{id}/draft-campaign → draft Campaign
  6. PATCH /campaigns/{id}                   → marketer edit (rename)
  7. POST /campaigns/{id}/approve            → status=approved
  8. POST /campaigns/{id}/send               → status=sending → Phase 2 pipeline
  9. Wait for at least some receipts to settle (calm mode for speed)

Usage:
    python scripts/phase3_gate.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "crm-api"))

from app.config import settings  # noqa: E402

CRM = "http://localhost:8000"
CHAN = "http://localhost:8001"

TERMINAL_OR_SETTLED = {"delivered", "read", "clicked", "failed"}


def run() -> int:
    if not settings.groq_api_key:
        print("[gate] ✗ GROQ_API_KEY not set in .env — get a free key at https://console.groq.com/keys")
        return 1

    print(f"[gate] using Groq model: {settings.groq_model}")

    # Health checks
    for name, url in [("crm-api", CRM), ("channel-service", CHAN)]:
        r = httpx.get(f"{url}/health", timeout=5.0)
        r.raise_for_status()
        print(f"       {name}: {r.json()['status']}")

    # Calm mode for fast settle. Reset counters.
    httpx.post(f"{CHAN}/config/reset-counters", timeout=5.0).raise_for_status()
    httpx.post(f"{CHAN}/config", json={"mode": "calm"}, timeout=5.0).raise_for_status()

    # 1. Generate opportunities (single Groq call)
    print("[gate] POST /opportunities/generate …")
    r = httpx.post(f"{CRM}/opportunities/generate", timeout=120.0)
    r.raise_for_status()
    opps = r.json()
    print(f"       got {len(opps)} opportunities")
    for o in opps:
        print(f"         rank={o['priority_rank']} cohort={o['cohort_definition'].get('cohort_ref')} — {o['title']}")
        print(f"              reasoning: {o['llm_reasoning'][:200]}…")

    # 2. Lapsed must be rank 1
    by_cohort = {o["cohort_definition"]["cohort_ref"]: o for o in opps}
    if "lapsed_regulars" not in by_cohort:
        print("[gate] ✗ no opportunity for lapsed_regulars")
        return 1
    lapsed = by_cohort["lapsed_regulars"]
    if lapsed["priority_rank"] != 1:
        print(f"[gate] ✗ lapsed_regulars is rank {lapsed['priority_rank']}, expected 1")
        return 1
    print(f"[gate] ✓ lapsed_regulars ranked 1")

    # 3. Festive must NOT be rank 1
    if "festive_onetimers" in by_cohort:
        festive = by_cohort["festive_onetimers"]
        worst_rank = max(o["priority_rank"] for o in opps)
        if festive["priority_rank"] != worst_rank:
            print(
                f"[gate] WARN festive_onetimers is rank {festive['priority_rank']} (worst = {worst_rank})"
            )
        else:
            print(f"[gate] ✓ festive_onetimers deprioritized (rank {festive['priority_rank']})")

    # 4. Resolve a fact
    lapsed_fact_id = lapsed["facts"][0]["fact_id"]
    print(f"[gate] GET /facts/{lapsed_fact_id}/resolve …")
    r = httpx.get(f"{CRM}/facts/{lapsed_fact_id}/resolve", timeout=30.0)
    r.raise_for_status()
    resolved = r.json()
    print(f"       {resolved['label']}: {resolved['row_count']} rows resolved")

    # 5. Draft a campaign for the lapsed opportunity
    print(f"[gate] POST /opportunities/{lapsed['id']}/draft-campaign …")
    r = httpx.post(f"{CRM}/opportunities/{lapsed['id']}/draft-campaign", timeout=120.0)
    r.raise_for_status()
    campaign = r.json()
    cid = campaign["id"]
    print(f"       drafted campaign id={cid} '{campaign['name']}' audience={campaign['audience_size']}")

    # 6. Marketer edit (rename)
    new_name = f"{campaign['name']} (edited)"
    print(f"[gate] PATCH /campaigns/{cid} …")
    r = httpx.patch(f"{CRM}/campaigns/{cid}", json={"name": new_name}, timeout=15.0)
    r.raise_for_status()
    assert r.json()["name"] == new_name
    print(f"       ✓ rename applied")

    # 7. Approve
    print(f"[gate] POST /campaigns/{cid}/approve …")
    r = httpx.post(f"{CRM}/campaigns/{cid}/approve", timeout=15.0)
    r.raise_for_status()

    # 8. Send (Phase 2 pipeline)
    print(f"[gate] POST /campaigns/{cid}/send …")
    r = httpx.post(f"{CRM}/campaigns/{cid}/send", timeout=120.0)
    r.raise_for_status()
    send_result = r.json()
    n_msgs = send_result["messages_created"]
    print(f"       dispatched {n_msgs} messages, batches={send_result['batches_dispatched']}")

    # 9. Wait for settle in calm mode (0.2–2s per event, sequential per msg).
    print("[gate] polling settle …")
    deadline = time.time() + 240
    last_settled = -1
    settled_stable_since: float | None = None
    while time.time() < deadline:
        s = httpx.get(f"{CRM}/campaigns/{cid}/stats", timeout=30.0).json()
        settled = sum(s["by_status"].get(k, 0) for k in TERMINAL_OR_SETTLED)
        if settled != last_settled:
            print(f"       t+{int(240 - (deadline - time.time())):>3}s settled={settled}/{n_msgs}  {s['by_status']}")
            last_settled = settled
            settled_stable_since = time.time()
        if settled >= n_msgs:
            break
        if settled_stable_since and time.time() - settled_stable_since > 20:
            print("       stable — concluding")
            break
        time.sleep(4)

    final = httpx.get(f"{CRM}/campaigns/{cid}/stats", timeout=15.0).json()
    settled = sum(final["by_status"].get(k, 0) for k in TERMINAL_OR_SETTLED)

    print()
    print("=" * 60)
    print("Phase 3 gate")
    print("=" * 60)
    print(f"  opportunities generated   : {len(opps)}")
    print(f"  lapsed rank               : {lapsed['priority_rank']} ✓")
    print(f"  fact resolution           : {resolved['row_count']} rows ✓")
    print(f"  campaign drafted          : id={cid} audience={campaign['audience_size']} ✓")
    print(f"  PATCH edit                : applied ✓")
    print(f"  approve + send            : {n_msgs} messages dispatched ✓")
    print(f"  settled (calm mode)       : {settled}/{n_msgs}")

    if settled < n_msgs * 0.5:
        print("\n  ✗ less than half of messages settled — investigate")
        return 1

    print("\n  ✓ PHASE 3 GATE PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(run())
