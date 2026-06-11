from fastapi import FastAPI

from .routers import campaigns, opportunities, orders, receipts, simulate

app = FastAPI(title="Pulse CRM API", version="0.4.0")
app.include_router(receipts.router, tags=["receipts"])
app.include_router(campaigns.router, tags=["campaigns"])
app.include_router(opportunities.router, tags=["opportunities"])
app.include_router(orders.router, tags=["orders"])
app.include_router(simulate.router, tags=["simulate"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "crm-api"}
