from fastapi import FastAPI

from .routers import config, send

app = FastAPI(title="Pulse Channel Service", version="0.2.0")
app.include_router(send.router, tags=["send"])
app.include_router(config.router, tags=["config"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "channel-service"}
