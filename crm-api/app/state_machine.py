"""Message status state machine.

See README §6 (crm-api receipt loop). Rules:

  * Monotonic positive path: queued < sent < delivered < read < clicked.
    An incoming event only advances the message; late/duplicate lower-rank
    events do not transition (the event is still stored).
  * `failed` is terminal and may only come from queued or sent.
  * `read` is illegal for SMS (no read receipts). The event is stored but
    no transition occurs.
  * Once a message is in a terminal state (clicked or failed), no further
    transitions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from .models import MessageChannel, MessageStatus

# Rank along the positive path. `failed` is off-path (sentinel rank).
_POSITIVE_RANK: Final[dict[MessageStatus, int]] = {
    MessageStatus.queued: 0,
    MessageStatus.sent: 1,
    MessageStatus.delivered: 2,
    MessageStatus.read: 3,
    MessageStatus.clicked: 4,
}

# event_type → status it would transition to.
_EVENT_TO_STATUS: Final[dict[str, MessageStatus]] = {
    "sent": MessageStatus.sent,
    "delivered": MessageStatus.delivered,
    "read": MessageStatus.read,
    "clicked": MessageStatus.clicked,
    "failed": MessageStatus.failed,
}


@dataclass(frozen=True)
class TransitionResult:
    old_status: MessageStatus
    new_status: MessageStatus
    advanced: bool
    reason: str = ""


def apply_event(
    current_status: MessageStatus,
    event_type: str,
    channel: MessageChannel,
) -> TransitionResult:
    """Decide whether an incoming event advances the message status.

    Pure function. The caller is responsible for storing the event row and,
    if `advanced`, persisting the new status.
    """
    target = _EVENT_TO_STATUS.get(event_type)
    if target is None:
        return TransitionResult(
            current_status, current_status, False, f"unknown event_type: {event_type!r}"
        )

    # Failed is terminal in both directions.
    if current_status == MessageStatus.failed:
        return TransitionResult(current_status, current_status, False, "already failed")
    if current_status == MessageStatus.clicked:
        return TransitionResult(current_status, current_status, False, "already clicked (terminal positive)")

    if target == MessageStatus.failed:
        if current_status in (MessageStatus.queued, MessageStatus.sent):
            return TransitionResult(current_status, MessageStatus.failed, True)
        return TransitionResult(
            current_status,
            current_status,
            False,
            f"illegal failed transition from {current_status.value}",
        )

    # SMS has no read receipts. Store the event but never transition.
    if target == MessageStatus.read and channel == MessageChannel.sms:
        return TransitionResult(
            current_status, current_status, False, "SMS does not support read receipts"
        )

    cur_rank = _POSITIVE_RANK[current_status]
    target_rank = _POSITIVE_RANK[target]
    if target_rank > cur_rank:
        return TransitionResult(current_status, target, True)
    return TransitionResult(
        current_status,
        current_status,
        False,
        f"non-advancing event ({target.value} rank {target_rank} ≤ {current_status.value} rank {cur_rank})",
    )
