"""Proxy /channel-config to channel-service /config.

The frontend should only ever talk to crm-api; channel-service stays internal.
This proxy lets the chaos-mode toggle in the UI flip channel-service without
the frontend needing direct access (and without paying the cost of two CORS
configs in production).
"""

from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import settings

router = APIRouter()


class ChannelMode(BaseModel):
    mode: Literal["calm", "hostile"]


@router.get("/channel-config")
def get_channel_config() -> dict:
    try:
        r = httpx.get(f"{settings.channel_service_url}/config", timeout=5.0)
        r.raise_for_status()
    except httpx.RequestError as e:
        raise HTTPException(502, f"channel-service unreachable: {e}") from e
    return r.json()


@router.post("/channel-config")
def set_channel_config(body: ChannelMode) -> dict:
    try:
        r = httpx.post(
            f"{settings.channel_service_url}/config",
            json={"mode": body.mode},
            timeout=5.0,
        )
        r.raise_for_status()
    except httpx.RequestError as e:
        raise HTTPException(502, f"channel-service unreachable: {e}") from e
    return r.json()
