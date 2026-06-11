"""Process-global mutable state for the channel-service simulator.

Single-process service, so a plain module-level dict is fine. If this ever
horizontally scales the mode would move to Redis or a shared config service.
"""

from __future__ import annotations

from typing import Literal

ChaosMode = Literal["calm", "hostile"]

_state: dict[str, ChaosMode] = {"mode": "calm"}

# Counters for observability (Phase 2 gate inspects these).
_counters: dict[str, int] = {
    "events_emitted": 0,
    "events_duplicated": 0,
    "callbacks_failed_first_attempt": 0,
    "callbacks_failed_terminal": 0,
}


def get_mode() -> ChaosMode:
    return _state["mode"]


def set_mode(mode: ChaosMode) -> None:
    _state["mode"] = mode


def bump(counter: str, by: int = 1) -> None:
    _counters[counter] = _counters.get(counter, 0) + by


def counters_snapshot() -> dict[str, int]:
    return dict(_counters)


def reset_counters() -> None:
    for k in list(_counters):
        _counters[k] = 0
