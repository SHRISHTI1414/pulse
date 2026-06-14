"""Groq client — strict JSON output validated against a Pydantic schema.

Why a single thin wrapper:
  - Groq is OpenAI-compatible, so we can talk to it via httpx without an SDK.
  - The Phase 3 spec requires the model to emit strict JSON. We use Groq's
    response_format={"type":"json_object"} and validate with Pydantic.
  - llama-3.1-8b-instant is small and occasionally breaks schema. We retry
    once with the validation error appended as context, then hard-fail.
"""

from __future__ import annotations

import json
import logging
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .config import settings

log = logging.getLogger("crm.llm")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

T = TypeVar("T", bound=BaseModel)


class LLMError(RuntimeError):
    """Raised when Groq fails to return JSON matching the schema after retry."""


def groq_chat_json(
    system: str,
    user: str,
    schema_model: type[T],
    *,
    temperature: float = 0.15,
    max_retries: int = 1,
    timeout_s: float = 60.0,
) -> T:
    """Single Groq call, JSON mode, validated against schema_model.

    Raises LLMError on schema failure (after one retry). Raises httpx errors
    on network failure (callers may want to surface as 502).
    """
    if not settings.groq_api_key:
        raise LLMError("GROQ_API_KEY is not set in environment")

    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    last_err: str | None = None
    for attempt in range(max_retries + 1):
        body = {
            "model": settings.groq_model,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        try:
            with httpx.Client(timeout=timeout_s) as client:
                r = client.post(GROQ_URL, headers=headers, json=body)
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError) as e:
            # Network failure, non-200 from Groq (bad/expired key, rate limit,
            # wrong model), or malformed envelope. Surface as LLMError so callers
            # can fall back to demo output instead of returning a 500.
            raise LLMError(f"Groq request failed: {e}") from e

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as e:
            last_err = f"JSON parse error: {e}"
            log.warning("groq attempt %d: %s — content was: %.200s", attempt, last_err, content)
            messages.append({"role": "assistant", "content": content})
            messages.append({
                "role": "user",
                "content": (
                    f"Your previous response was not valid JSON: {e}. "
                    "Return ONLY a JSON object matching the requested schema. "
                    "No prose, no markdown fences."
                ),
            })
            continue

        try:
            return schema_model.model_validate(parsed)
        except ValidationError as e:
            last_err = f"Pydantic validation error: {e.errors()[:3]}"
            log.warning("groq attempt %d: %s", attempt, last_err)
            messages.append({"role": "assistant", "content": content})
            messages.append({
                "role": "user",
                "content": (
                    f"Your previous response failed schema validation. Errors: {e.errors()[:5]}. "
                    "Return ONLY a JSON object matching the requested schema."
                ),
            })

    raise LLMError(f"Groq response failed validation after {max_retries + 1} attempts: {last_err}")
