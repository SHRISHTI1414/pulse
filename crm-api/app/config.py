from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the pulse repo root (two levels above this file).
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str
    # Groq + channel-service URL are used from Phase 3 / Phase 2.
    # Defaulted so Phase 1 doesn't require them in .env.
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"
    channel_service_url: str = "http://localhost:8001"

    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()  # type: ignore[call-arg]
