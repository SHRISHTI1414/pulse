"""/send — batch send, returns 202 immediately, simulation runs in background."""

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel

from ..simulator import simulate_message

router = APIRouter()


class SendItem(BaseModel):
    message_id: int
    channel: Literal["whatsapp", "sms"]
    recipient: str
    body: str


class SendBatch(BaseModel):
    items: list[SendItem]


@router.post("/send", status_code=status.HTTP_202_ACCEPTED)
async def send(batch: SendBatch) -> dict:
    for item in batch.items:
        asyncio.create_task(
            simulate_message(
                message_id=item.message_id,
                channel=item.channel,
                recipient=item.recipient,
                body=item.body,
            )
        )
    return {"accepted": len(batch.items)}
