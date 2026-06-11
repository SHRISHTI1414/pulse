"""Public order ingestion + last_touch_7d attribution — README §8.

Stated limitations (documented up front, not a gap):
  * Last-touch over-credits the most recent engaged message.
  * No holdout group — we can't say what would have happened without the campaign.
Acceptable for this scope; baked into the README.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..db import SessionLocal
from ..models import Attribution, Customer, Message, MessageStatus, Order, Store
from ..schemas import AttributionOut, OrderIngestIn, OrderIngestOut

log = logging.getLogger("crm.orders")

router = APIRouter()

ATTRIBUTION_WINDOW_DAYS = 7
ATTRIBUTION_MODEL = "last_touch_7d"

# Messages count as "engaged" if they reached any of these statuses.
ENGAGED_STATUSES = (
    MessageStatus.delivered,
    MessageStatus.read,
    MessageStatus.clicked,
)


@router.post("/orders/ingest", response_model=OrderIngestOut, status_code=201)
def ingest_order(body: OrderIngestIn) -> OrderIngestOut:
    """Accept a new order; if an engaged message preceded it within 7 days,
    write a last_touch_7d attribution row.
    """
    with SessionLocal() as session:
        # Validate FKs upfront (clearer error than IntegrityError).
        if session.get(Customer, body.customer_id) is None:
            raise HTTPException(404, f"customer {body.customer_id} not found")
        if session.get(Store, body.store_id) is None:
            raise HTTPException(404, f"store {body.store_id} not found")

        order = Order(
            customer_id=body.customer_id,
            store_id=body.store_id,
            order_channel=body.order_channel,
            total_amount=Decimal(str(body.total_amount)),
            items_summary=body.items_summary,
            ordered_at=body.ordered_at,
        )
        session.add(order)
        session.flush()  # populate order.id

        cutoff = body.ordered_at - timedelta(days=ATTRIBUTION_WINDOW_DAYS)
        recent_message = session.execute(
            select(Message)
            .where(Message.customer_id == body.customer_id)
            .where(Message.status.in_(ENGAGED_STATUSES))
            .where(Message.last_event_at.is_not(None))
            .where(Message.last_event_at >= cutoff)
            .where(Message.last_event_at <= body.ordered_at)
            .order_by(Message.last_event_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        attribution_out: AttributionOut | None = None
        if recent_message is not None:
            attr = Attribution(
                order_id=order.id,
                campaign_id=recent_message.campaign_id,
                message_id=recent_message.id,
                model=ATTRIBUTION_MODEL,
                created_at=datetime.now(timezone.utc),
            )
            session.add(attr)
            session.flush()
            attribution_out = AttributionOut(
                id=attr.id,
                order_id=attr.order_id,
                campaign_id=attr.campaign_id,
                message_id=attr.message_id,
                model=attr.model,
                created_at=attr.created_at,
            )

        session.commit()
        return OrderIngestOut(order_id=order.id, attribution=attribution_out)
