"""/config — flip the simulator between calm and hostile modes."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from ..state import counters_snapshot, get_mode, reset_counters, set_mode

router = APIRouter()


class ConfigBody(BaseModel):
    mode: Literal["calm", "hostile"]


@router.get("/config")
def read_config() -> dict:
    return {"mode": get_mode(), "counters": counters_snapshot()}


@router.post("/config")
def update_config(body: ConfigBody) -> dict:
    set_mode(body.mode)
    return {"mode": body.mode}


@router.post("/config/reset-counters")
def reset() -> dict:
    reset_counters()
    return {"ok": True}
