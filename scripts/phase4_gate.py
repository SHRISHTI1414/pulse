"""Phase 4 gate: send (hostile) → receipts settle → simulate recovery →
recovered revenue moves → debrief narrative cites only stat-facts.

Pre-req: both services running + GROQ_API_KEY in .env.
"""

from __future__ import annotations

import re
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
ENGAGED = {"delivered", "read", "clicked"}
ALLOWED_DEBRIEF_FACTS = {
    "f_audience_size",
    "f_delivered",
    "f_read",
    "f_clicked",
    "f_failed",
    "f_attributed_orders",
    "f_recovered_revenue_inr",
    "f_recovery_rate_pct",
}


def run() -> int:
    if not settings.groq_api_key:
        print("[gate] GROQ_API_KEY not set in .env")
        return 1

    # Health
    for name, url in [("crm-api", CRM), ("channel-service", CHAN)]:
        r = httpx.get(f"{url}/health", timeout=5.0)
        r.raise_for_status()
        print(f"       {name}: {r.json()['status']}")

    # Hostile mode for spec-aligned chaos.
    httpx.post(f"{CHAN}/config/reset-counters", timeout=5.0).raise_for_status()
    httpx.post(f"{CHAN}/config", json={"mode": "hostile"}, timeout=5.0).raise_for_status()
    print("[gate] channel-service mode: hostile")

    # Reuse the strategist hero flow — generate + draft + approve + send.
    print("[gate] POST /opportunities/generate …")
    opps = httpx.post(f"{CRM}/opportunities/generate", timeout=120.0).json()
    lapsed = next(o for o in opps if o["cohort_definition"]["cohort_ref"] == "lapsed_regulars")
    print(f"       lapsed opp id={lapsed['id']} rank={lapsed['priority_rank']}")

    print(f"[gate] POST /opportunities/{lapsed['id']}/draft-campaign …")
    campaign = httpx.post(
        f"{CRM}/opportunities/{lapsed['id']}/draft-campaign", timeout=120.0
    ).json()
    cid = campaign["id"]
    audience_size = campaign["audience_size"]
    print(f"       drafted campaign id={cid} audience={audience_size}")

    httpx.post(f"{CRM}/campaigns/{cid}/approve", timeout=15.0).raise_for_status()
    send_result = httpx.post(f"{CRM}/campaigns/{cid}/send", timeout=180.0).json()
    n_msgs = send_result["messages_created"]
    print(f"[gate] sent {n_msgs} messages")

    # Settle (hostile mode — patient)
    print("[gate] waiting for receipts …")
    start = time.time()
    deadline = start + 180
    last_settled = -1
    settled_stable_since: float | None = None
    while time.time() < deadline:
        try:
            stats = httpx.get(f"{CRM}/campaigns/{cid}/stats", timeout=30.0).json()
        except httpx.RequestError:
            time.sleep(3)
            continue
        settled = sum(stats["by_status"].get(k, 0) for k in TERMINAL_OR_SETTLED)
        if settled != last_settled:
            print(f"       t+{int(time.time() - start):>3}s settled={settled}/{n_msgs}  {stats['by_status']}")
            last_settled = settled
            settled_stable_since = time.time()
        if settled >= n_msgs:
            break
        if settled_stable_since and time.time() - settled_stable_since > 15:
            print("       settled stable — concluding")
            break
        time.sleep(3)

    pre_stats = httpx.get(f"{CRM}/campaigns/{cid}/stats", timeout=15.0).json()
    engaged = sum(pre_stats["by_status"].get(k, 0) for k in ENGAGED)
    print(f"       engaged messages (delivered/read/clicked): {engaged}")
    assert pre_stats["attributed_orders"] == 0, "pre-recovery should have zero attributed orders"
    assert pre_stats["recovered_revenue_inr"] == 0.0

    # Simulate recovery
    print("[gate] POST /simulate/recovery fraction=0.25 …")
    rec = httpx.post(
        f"{CRM}/simulate/recovery",
        json={"campaign_id": cid, "fraction": 0.25, "seed": 7},
        timeout=180.0,
    ).json()
    print(
        f"       eligible={rec['eligible_customers']}  simulated={rec['orders_simulated']}  "
        f"attributions={rec['attributions_created']}  revenue=Rs {rec['recovered_revenue_inr']:,.0f}"
    )

    # Verify stats reflect attributions
    post_stats = httpx.get(f"{CRM}/campaigns/{cid}/stats", timeout=15.0).json()
    print(f"       post-stats: attributed_orders={post_stats['attributed_orders']}  "
          f"recovered=Rs {post_stats['recovered_revenue_inr']:,.0f}  "
          f"recovery_rate={post_stats['recovery_rate_pct']}%")
    assert post_stats["attributed_orders"] == rec["attributions_created"]
    assert post_stats["recovered_revenue_inr"] == rec["recovered_revenue_inr"]
    assert post_stats["recovered_revenue_inr"] > 0, "recovered revenue must be positive after sim"

    # Debrief (Groq call)
    print("[gate] POST /campaigns/{cid}/debrief …")
    debrief = httpx.post(f"{CRM}/campaigns/{cid}/debrief", timeout=120.0).json()
    narrative = debrief["narrative"]
    next_step = debrief["what_id_try_next"]
    print(f"       narrative: {narrative}")
    print(f"       next:      {next_step}")

    # Verify debrief only cites allowed stat-facts.
    cited = set(re.findall(r"\{fact:([^}]+)\}", narrative + " " + next_step))
    bad = cited - ALLOWED_DEBRIEF_FACTS
    if bad:
        print(f"[gate] ✗ debrief cited unknown stat-facts: {bad}")
        return 1
    if not cited:
        print("[gate] WARN debrief cited zero stat-facts (allowed but suspicious)")

    print()
    print("=" * 64)
    print("Phase 4 gate")
    print("=" * 64)
    print(f"  audience                  : {audience_size}")
    print(f"  settled (hostile)         : {sum(pre_stats['by_status'].get(k, 0) for k in TERMINAL_OR_SETTLED)}/{n_msgs}")
    print(f"  engaged messages          : {engaged}")
    print(f"  orders simulated          : {rec['orders_simulated']}")
    print(f"  attributions              : {rec['attributions_created']}")
    print(f"  recovered revenue         : Rs {rec['recovered_revenue_inr']:,.0f}")
    print(f"  recovery rate vs cohort   : {post_stats['recovery_rate_pct']}%")
    print(f"  debrief stat-facts cited  : {sorted(cited) or '(none)'}")
    print()
    print("  ✓ PHASE 4 GATE PASSED")

    httpx.post(f"{CHAN}/config", json={"mode": "calm"}, timeout=5.0).raise_for_status()
    return 0


if __name__ == "__main__":
    sys.exit(run())
