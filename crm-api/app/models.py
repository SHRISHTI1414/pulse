"""SQLAlchemy models for Pulse.

Schema is documented in docs/data-spec.md and README.md §4. Eight tables:
stores, customers, orders, opportunities, campaigns, messages,
receipt_events, attributions.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Enums (Postgres-native via SQLAlchemy Enum type)
# ---------------------------------------------------------------------------


class AcquisitionChannel(str, enum.Enum):
    walk_in = "walk_in"
    festive_promo = "festive_promo"
    referral = "referral"


class OrderChannel(str, enum.Enum):
    dine_in = "dine_in"
    takeaway = "takeaway"
    delivery = "delivery"


class OpportunityStatus(str, enum.Enum):
    open = "open"
    actioned = "actioned"
    dismissed = "dismissed"


class CampaignStatus(str, enum.Enum):
    draft = "draft"
    approved = "approved"
    sending = "sending"
    completed = "completed"


class MessageChannel(str, enum.Enum):
    whatsapp = "whatsapp"
    sms = "sms"


class MessageStatus(str, enum.Enum):
    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    read = "read"
    clicked = "clicked"
    failed = "failed"


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    opened_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_office_district: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    home_store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    acquisition_date: Mapped[date] = mapped_column(Date, nullable=False)
    acquisition_channel: Mapped[AcquisitionChannel] = mapped_column(
        SAEnum(AcquisitionChannel, name="acquisition_channel"), nullable=False
    )
    whatsapp_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    home_store: Mapped[Store] = relationship()


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    order_channel: Mapped[OrderChannel] = mapped_column(
        SAEnum(OrderChannel, name="order_channel"), nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    items_summary: Mapped[str] = mapped_column(Text, nullable=False)
    ordered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_orders_customer_ordered_at", "customer_id", "ordered_at"),
    )


class Opportunity(Base):
    __tablename__ = "opportunities"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    cohort_definition: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # facts: array of {fact_id, label, value, query_ref}. Powers clickable
    # evidence chips in Phase 5 — GET /facts/{fact_id}/resolve re-runs the
    # underlying query live.
    facts: Mapped[list] = mapped_column(JSONB, nullable=False)
    llm_reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    priority_rank: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[OpportunityStatus] = mapped_column(
        SAEnum(OpportunityStatus, name="opportunity_status"),
        nullable=False,
        default=OpportunityStatus.open,
    )


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    opportunity_id: Mapped[int | None] = mapped_column(
        ForeignKey("opportunities.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    segment_definition: Mapped[dict] = mapped_column(JSONB, nullable=False)
    message_templates: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[CampaignStatus] = mapped_column(
        SAEnum(CampaignStatus, name="campaign_status"),
        nullable=False,
        default=CampaignStatus.draft,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Message(Base):
    """A single outbound message attempt.

    State-machine note (enforced in Phase 2 by app/state_machine.py):
    Monotonic rank queued < sent < delivered < read < clicked. Events only
    advance status; late/duplicate lower-rank events are stored but do not
    transition. `failed` is terminal and may only come from queued/sent.
    `read` is illegal for SMS (no read receipts) — the event is stored, no
    transition occurs, and a warning is logged.
    """

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    channel: Mapped[MessageChannel] = mapped_column(
        SAEnum(MessageChannel, name="message_channel"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[MessageStatus] = mapped_column(
        SAEnum(MessageStatus, name="message_status"),
        nullable=False,
        default=MessageStatus.queued,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReceiptEvent(Base):
    __tablename__ = "receipt_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    # Idempotency key from the channel service. Unique across all events.
    # Phase 2 receipt loop relies on this constraint to absorb duplicates.
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    __table_args__ = (
        UniqueConstraint("event_id", name="uq_receipt_events_event_id"),
    )


class Attribution(Base):
    __tablename__ = "attributions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), nullable=False)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
