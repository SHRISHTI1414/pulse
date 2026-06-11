from fastapi import FastAPI

from .routers import campaigns, opportunities, receipts

app = FastAPI(title="Pulse CRM API", version="0.3.0")
app.include_router(receipts.router, tags=["receipts"])
app.include_router(campaigns.router, tags=["campaigns"])
app.include_router(opportunities.router, tags=["opportunities"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "crm-api"}
