"""Pure-logic tests for the message status state machine."""

from __future__ import annotations

import pytest

from app.models import MessageChannel, MessageStatus
from app.state_machine import apply_event

WA = MessageChannel.whatsapp
SMS = MessageChannel.sms


# ── Positive path on WhatsApp ──────────────────────────────────────────────

class TestPositivePathWhatsApp:
    def test_queued_to_sent(self):
        r = apply_event(MessageStatus.queued, "sent", WA)
        assert r.advanced and r.new_status == MessageStatus.sent

    def test_sent_to_delivered(self):
        r = apply_event(MessageStatus.sent, "delivered", WA)
        assert r.advanced and r.new_status == MessageStatus.delivered

    def test_delivered_to_read(self):
        r = apply_event(MessageStatus.delivered, "read", WA)
        assert r.advanced and r.new_status == MessageStatus.read

    def test_read_to_clicked(self):
        r = apply_event(MessageStatus.read, "clicked", WA)
        assert r.advanced and r.new_status == MessageStatus.clicked


# ── Positive path on SMS (no read state) ───────────────────────────────────

class TestPositivePathSMS:
    def test_sms_queued_to_sent(self):
        r = apply_event(MessageStatus.queued, "sent", SMS)
        assert r.advanced and r.new_status == MessageStatus.sent

    def test_sms_sent_to_delivered(self):
        r = apply_event(MessageStatus.sent, "delivered", SMS)
        assert r.advanced and r.new_status == MessageStatus.delivered

    def test_sms_read_event_does_not_transition(self):
        r = apply_event(MessageStatus.delivered, "read", SMS)
        assert not r.advanced
        assert r.new_status == MessageStatus.delivered
        assert "SMS" in r.reason

    def test_sms_delivered_to_clicked_via_link_click(self):
        # SMS can reach clicked directly from delivered (link click).
        r = apply_event(MessageStatus.delivered, "clicked", SMS)
        assert r.advanced and r.new_status == MessageStatus.clicked


# ── failed (terminal, only from queued/sent) ───────────────────────────────

class TestFailedTerminal:
    def test_failed_from_queued(self):
        r = apply_event(MessageStatus.queued, "failed", WA)
        assert r.advanced and r.new_status == MessageStatus.failed

    def test_failed_from_sent(self):
        r = apply_event(MessageStatus.sent, "failed", SMS)
        assert r.advanced and r.new_status == MessageStatus.failed

    @pytest.mark.parametrize(
        "current",
        [MessageStatus.delivered, MessageStatus.read, MessageStatus.clicked],
    )
    def test_cannot_fail_after_delivered(self, current):
        r = apply_event(current, "failed", WA)
        assert not r.advanced
        assert r.new_status == current

    def test_failed_is_terminal_no_further_transition(self):
        r = apply_event(MessageStatus.failed, "delivered", WA)
        assert not r.advanced
        assert r.new_status == MessageStatus.failed


# ── Monotonic guarantees: no regressions, no duplicates ────────────────────

class TestMonotonic:
    @pytest.mark.parametrize(
        "current,event",
        [
            (MessageStatus.delivered, "sent"),
            (MessageStatus.read, "delivered"),
            (MessageStatus.clicked, "read"),
            (MessageStatus.sent, "sent"),  # same status — no-op
            (MessageStatus.delivered, "delivered"),
        ],
    )
    def test_lower_or_equal_rank_event_does_not_regress(self, current, event):
        r = apply_event(current, event, WA)
        assert not r.advanced
        assert r.new_status == current

    def test_clicked_is_terminal_positive(self):
        # Even another clicked event doesn't transition.
        r = apply_event(MessageStatus.clicked, "clicked", WA)
        assert not r.advanced


# ── Out-of-order convergence ───────────────────────────────────────────────

class TestOutOfOrderConvergence:
    """In hostile mode events can arrive in any order. The final status,
    computed by replaying events through apply_event in arrival order, must
    equal the highest-rank event the message actually generated.
    """

    def test_wa_clicked_then_read_then_delivered_then_sent(self):
        status = MessageStatus.queued
        for ev in ["clicked", "read", "delivered", "sent"]:
            r = apply_event(status, ev, WA)
            status = r.new_status
        assert status == MessageStatus.clicked

    def test_wa_arbitrary_permutation(self):
        # Same event set, different order: still settles to clicked.
        status = MessageStatus.queued
        for ev in ["delivered", "clicked", "sent", "read"]:
            status = apply_event(status, ev, WA).new_status
        assert status == MessageStatus.clicked

    def test_sms_read_event_in_stream_does_not_break_clicked(self):
        # SMS gets a spurious read event — ignored, but clicked still wins.
        status = MessageStatus.queued
        for ev in ["sent", "delivered", "read", "clicked"]:
            status = apply_event(status, ev, SMS).new_status
        assert status == MessageStatus.clicked

    def test_failed_arriving_after_delivered_is_ignored(self):
        # Spec: failed only from queued/sent. A late failed after delivered
        # is dropped, and the positive path stays valid.
        status = MessageStatus.queued
        for ev in ["sent", "delivered", "failed", "read", "clicked"]:
            status = apply_event(status, ev, WA).new_status
        assert status == MessageStatus.clicked


# ── Unknown event type ────────────────────────────────────────────────────

class TestUnknownEvent:
    def test_unknown_event_type_is_no_op(self):
        r = apply_event(MessageStatus.sent, "blorped", WA)
        assert not r.advanced
        assert "unknown" in r.reason
