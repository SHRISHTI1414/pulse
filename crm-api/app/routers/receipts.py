"""Receipt ingestion — idempotent on event_id (README §6 crm-api receipt loop)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy.exc import IntegrityError

from ..db import SessionLocal
from ..models import Message, ReceiptEvent
from ..schemas import ReceiptEventIn, ReceiptEventOut
from ..state_machine import apply_event

log = logging.getLogger("crm.receipts")

router = APIRouter()


@router.post("/receipts", response_model=ReceiptEventOut)
def ingest_receipt(event: ReceiptEventIn) -> ReceiptEventOut:
    """Accept one receipt event.

    Idempotent: duplicate event_id → 200 OK no-op (logged, counted).
    Unknown message_id → 200 OK with `unknown_message` (so channel-service
    stops retrying — we don't want to leak retries on stale references).
    """
    with SessionLocal() as session:
        msg = session.get(Message, event.message_id)
        if msg is None:
            log.warning("receipt for unknown message_id=%s event_id=%s", event.message_id, event.event_id)
            return ReceiptEventOut(status="unknown_message")

        row = ReceiptEvent(
            message_id=event.message_id,
            event_type=event.event_type,
            event_id=event.event_id,
            occurred_at=event.occurred_at,
            received_at=datetime.now(timezone.utc),
            payload=event.payload or {},
        )
        session.add(row)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            log.info("duplicate event_id=%s for message_id=%s", event.event_id, event.message_id)
            return ReceiptEventOut(status="duplicate")

        result = apply_event(msg.status, event.event_type, msg.channel)
        if result.advanced:
            msg.status = result.new_status
        if msg.last_event_at is None or event.occurred_at > msg.last_event_at:
            msg.last_event_at = event.occurred_at
        session.commit()

        return ReceiptEventOut(
            status="accepted",
            transitioned=result.advanced,
            new_status=result.new_status.value if result.advanced else None,
            reason=result.reason or None,
        )
