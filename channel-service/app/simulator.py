"""Per-message outcome simulator + receipt callback dispatcher.

Spec (README §6 channel-service):

  WhatsApp: sent → delivered (~94%) → read (~65% of delivered)
            → clicked (~22% of read). Else terminal `failed`.
  SMS:      sent → delivered (~96%) → clicked (~6% of delivered, link click).
            No read state. Else terminal `failed`.

Chaos modes:
  calm:    events in-order, 0.2–2s spacing, ~2% failures, no duplicates.
  hostile: 0.5–20s jitter, ~15% failures, ~10% duplicate event_ids,
           per-message order shuffled, ~5% of callback POSTs fail first
           attempt → exponential backoff retry (3 attempts).
"""

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from .config import settings
from .state import bump, get_mode

log = logging.getLogger("channel.sim")

WA_DELIVERED = 0.94
WA_READ_GIVEN_DELIVERED = 0.65
WA_CLICKED_GIVEN_READ = 0.22
SMS_DELIVERED = 0.96
SMS_CLICKED_GIVEN_DELIVERED = 0.06

CALM_FAILURE_RATE = 0.02
HOSTILE_FAILURE_RATE = 0.15
HOSTILE_DUP_RATE = 0.10
HOSTILE_FIRST_ATTEMPT_FAIL_RATE = 0.05


def _make_event(message_id: int, event_type: str, offset_seconds: float) -> dict:
    return {
        "event_id": str(uuid.uuid4()),
        "message_id": message_id,
        "event_type": event_type,
        "occurred_at": (datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)).isoformat(),
    }


def _build_timeline(
    message_id: int,
    channel: str,
    failure_rate: float,
    rng: random.Random,
) -> list[dict]:
    """Build the positive-path (or single failed) event list for one message."""
    events: list[dict] = [_make_event(message_id, "sent", 0)]

    if rng.random() < failure_rate:
        events.append(_make_event(message_id, "failed", 1))
        return events

    if channel == "whatsapp":
        if rng.random() < WA_DELIVERED:
            events.append(_make_event(message_id, "delivered", 1))
            if rng.random() < WA_READ_GIVEN_DELIVERED:
                events.append(_make_event(message_id, "read", 5))
                if rng.random() < WA_CLICKED_GIVEN_READ:
                    events.append(_make_event(message_id, "clicked", 8))
        else:
            events.append(_make_event(message_id, "failed", 1))
    else:  # sms
        if rng.random() < SMS_DELIVERED:
            events.append(_make_event(message_id, "delivered", 1))
            if rng.random() < SMS_CLICKED_GIVEN_DELIVERED:
                events.append(_make_event(message_id, "clicked", 4))
        else:
            events.append(_make_event(message_id, "failed", 1))

    return events


async def _post_with_retry(
    client: httpx.AsyncClient,
    payload: dict,
    rng: random.Random,
    hostile: bool,
) -> None:
    """POST one receipt; in hostile mode retry on simulated callback failures."""
    backoffs = [0.5, 1.0, 2.0] if hostile else [0.0]
    last_err: str | None = None

    for attempt, backoff in enumerate(backoffs):
        if hostile and attempt == 0 and rng.random() < HOSTILE_FIRST_ATTEMPT_FAIL_RATE:
            bump("callbacks_failed_first_attempt")
            await asyncio.sleep(backoff)
            continue
        try:
            r = await client.post(settings.crm_receipt_url, json=payload, timeout=10.0)
            if r.status_code < 500:
                return
            last_err = f"HTTP {r.status_code}"
        except (httpx.HTTPError, asyncio.TimeoutError) as e:
            last_err = f"{type(e).__name__}: {e}"
        await asyncio.sleep(backoff)

    bump("callbacks_failed_terminal")
    log.warning("dropping event %s after retries: %s", payload.get("event_id"), last_err)


_shared_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()
# Cap concurrent in-flight POSTs. Without this, 500-msg hostile runs would
# spin up ~1500 concurrent asyncio.gather fires and saturate the httpx pool
# → PoolTimeout. 50 is plenty of chaos (jitter + shuffle + dupes still apply)
# while keeping each request inside its httpx timeout.
_fire_semaphore = asyncio.Semaphore(50)


async def _get_client() -> httpx.AsyncClient:
    """Lazy module-level client so simulators share one connection pool."""
    global _shared_client
    if _shared_client is None:
        async with _client_lock:
            if _shared_client is None:
                _shared_client = httpx.AsyncClient(
                    limits=httpx.Limits(max_connections=80, max_keepalive_connections=40),
                    timeout=httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=60.0),
                )
    return _shared_client


async def simulate_message(
    message_id: int,
    channel: str,
    recipient: str,
    body: str,
) -> None:
    """Build a timeline and POST events back to crm-api per current mode."""
    mode = get_mode()
    hostile = mode == "hostile"
    failure_rate = HOSTILE_FAILURE_RATE if hostile else CALM_FAILURE_RATE
    rng = random.Random()

    events = _build_timeline(message_id, channel, failure_rate, rng)

    if hostile:
        duplicates = [dict(ev) for ev in events if rng.random() < HOSTILE_DUP_RATE]
        bump("events_duplicated", len(duplicates))
        events.extend(duplicates)
        rng.shuffle(events)
    bump("events_emitted", len(events))

    client = await _get_client()
    if hostile:
        async def fire(ev: dict) -> None:
            # Sleep happens outside the semaphore so the chaos (jitter + shuffle)
            # is preserved; only the actual POST is throttled.
            await asyncio.sleep(rng.uniform(0.5, 20.0))
            async with _fire_semaphore:
                await _post_with_retry(client, ev, rng, hostile=True)

        await asyncio.gather(*(fire(ev) for ev in events))
    else:
        for ev in events:
            await asyncio.sleep(rng.uniform(0.2, 2.0))
            await _post_with_retry(client, ev, rng, hostile=False)
