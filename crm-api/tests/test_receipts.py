"""Integration tests for /receipts.

Touches the real Neon DB — each test creates its own scratch campaign +
message rows under a UUID-tagged name, then cleans up. Safe to run alongside
the seeded dataset.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db import SessionLocal
from app.main import app
from app.models import (
    Campaign,
    Customer,
    Message,
    MessageChannel,
    MessageStatus,
    ReceiptEvent,
)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def scratch_message():
    """Create a campaign + message we can target, yield its id, then tear down."""
    tag = uuid.uuid4().hex[:8]
    with SessionLocal() as session:
        # Grab any existing customer.
        customer_id = session.execute(select(Customer.id).limit(1)).scalar_one()
        campaign = Campaign(
            name=f"test-campaign-{tag}",
            segment_definition={"customer_ids": [customer_id]},
            message_templates={"default": {"whatsapp": "Hi {{name}}"}},
            status="draft",
            created_at=datetime.now(timezone.utc),
        )
        session.add(campaign)
        session.flush()
        message = Message(
            campaign_id=campaign.id,
            customer_id=customer_id,
            channel=MessageChannel.whatsapp,
            body="test body",
            status=MessageStatus.queued,
        )
        session.add(message)
        session.commit()
        msg_id = message.id
        campaign_id = campaign.id

    yield {"message_id": msg_id, "campaign_id": campaign_id, "tag": tag}

    with SessionLocal() as session:
        session.execute(delete(ReceiptEvent).where(ReceiptEvent.message_id == msg_id))
        session.execute(delete(Message).where(Message.id == msg_id))
        session.execute(delete(Campaign).where(Campaign.id == campaign_id))
        session.commit()


def _event_body(message_id: int, event_id: str, event_type: str):
    return {
        "event_id": event_id,
        "message_id": message_id,
        "event_type": event_type,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }


class TestReceiptIdempotency:
    def test_first_post_accepts_and_transitions(self, client, scratch_message):
        mid = scratch_message["message_id"]
        eid = f"ev-{scratch_message['tag']}-1"
        r = client.post("/receipts", json=_event_body(mid, eid, "sent"))
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "accepted"
        assert body["transitioned"] is True
        assert body["new_status"] == "sent"

    def test_duplicate_event_id_is_no_op(self, client, scratch_message):
        mid = scratch_message["message_id"]
        eid = f"ev-{scratch_message['tag']}-dup"
        body = _event_body(mid, eid, "sent")
        first = client.post("/receipts", json=body)
        assert first.json()["status"] == "accepted"
        # Same event_id again — duplicate, 200 OK no-op.
        second = client.post("/receipts", json=body)
        assert second.status_code == 200
        assert second.json()["status"] == "duplicate"

        # Confirm only one row in receipt_events, message advanced once.
        with SessionLocal() as session:
            rows = session.execute(
                select(ReceiptEvent).where(ReceiptEvent.event_id == eid)
            ).all()
            assert len(rows) == 1
            msg = session.get(Message, mid)
            assert msg.status == MessageStatus.sent

    def test_out_of_order_events_settle_to_clicked(self, client, scratch_message):
        """Hostile mode can deliver events in any order. Final state must be
        the highest-rank event observed (clicked, in this case)."""
        mid = scratch_message["message_id"]
        tag = scratch_message["tag"]
        order = ["clicked", "read", "sent", "delivered"]  # arbitrary
        for i, ev_type in enumerate(order):
            r = client.post(
                "/receipts",
                json=_event_body(mid, f"ev-{tag}-{i}", ev_type),
            )
            assert r.status_code == 200

        with SessionLocal() as session:
            msg = session.get(Message, mid)
            assert msg.status == MessageStatus.clicked
            event_rows = session.execute(
                select(ReceiptEvent).where(ReceiptEvent.message_id == mid)
            ).all()
            assert len(event_rows) == 4

    def test_unknown_message_id_returns_200_no_retry(self, client):
        body = _event_body(message_id=10**12, event_id=f"ev-orphan-{uuid.uuid4().hex[:6]}", event_type="sent")
        r = client.post("/receipts", json=body)
        assert r.status_code == 200
        assert r.json()["status"] == "unknown_message"
