from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import (
    campaigns,
    channel_config,
    opportunities,
    orders,
    receipts,
    simulate,
)

app = FastAPI(title="Pulse CRM API", version="0.5.0")

# CORS — Vite dev server on 5173, plus loose Vercel preview URLs in prod.
# Wildcard for dev; tighten via env once we know the prod origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(receipts.router, tags=["receipts"])
app.include_router(campaigns.router, tags=["campaigns"])
app.include_router(opportunities.router, tags=["opportunities"])
app.include_router(orders.router, tags=["orders"])
app.include_router(simulate.router, tags=["simulate"])
app.include_router(channel_config.router, tags=["channel-config"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "crm-api"}
