from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .config import settings

# Pool sized for Phase 2 hostile-mode burst: ~1500 receipt events arriving
# over ~20s = peak ~75 concurrent /receipts. Each holds a connection for
# ~100ms, giving ~8 concurrent at steady state. Pool of 60 has plenty of
# headroom and stays well under Neon free-tier connection limits.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=40,
    pool_recycle=300,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
