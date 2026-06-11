from fastapi import FastAPI

# Phase 1: health endpoint only. The /send + /config endpoints and the
# async receipt callback loop are built in Phase 2.
app = FastAPI(title="Pulse Channel Service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "channel-service"}
