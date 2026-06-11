# Pulse — Session Handoff

> Read this first if you're a new Claude session picking up the build.
> The full product spec is `README.md`. This file is just the *state*.

## What Pulse is

AI-native mini CRM for a fictional 12-outlet Delhi-NCR coffee chain
("Brew Street"). Hero loop: AI strategist finds lapsing-customer cohorts →
proposes win-back campaigns → marketer approves → channel-service simulates
WhatsApp/SMS delivery (with chaos modes) → receipts settle → attribution
fires when customers come back → debrief explains what happened.

Built for the Xeno FDE take-home assignment. README is the master spec
and explicitly forbids building ahead — work proceeds one phase at a time
with the user's approval.

## Where the code lives

- **Project root:** `~/Documents/xeno/pulse/` (this folder).
- **Git:** initialised here, branch `main`, **8 commits**, latest is
  Phase 5 Track A. Not pushed to GitHub yet (user said wait).
- **Don't touch `~/Documents/BIGBETSAI/Mahrea/`** — different project,
  user has been firm on this.

## Stack (locked in by spec)

- Backend: Python 3.12 + FastAPI + SQLAlchemy 2.0 + psycopg v3 + Pydantic v2
- LLM: **Groq** (`llama-3.1-8b-instant`) — swapped from Anthropic Claude
  at user's request. Strict JSON mode + Pydantic schema validation + 1 retry.
- DB: Neon Postgres free tier (URL in `.env`)
- Frontend: React 19 + Vite 8 + TS + Tailwind v4 + react-router-dom

## What's done (Phases 1 – 5 Track A)

| Phase | Built | Gate result |
|---|---|---|
| 1 | 8-table schema, seeded data generator (6k customers, ~150k orders, 3 planted patterns), verification SQL | All 3 patterns within ±10%, hero cohort ₹95 lakh annualized |
| 2 | State machine, `/receipts` idempotent ingest, channel-service `/send` + `/config` (calm/hostile), campaign send pipeline | 500 msgs hostile: 500/500 settled, 0 dup effects, 0 SMS-read violations; 29/29 pytest pass |
| 3 | 13 named facts + resolver, Groq strategist `/opportunities/generate`, `/draft-campaign`, `PATCH /campaigns/{id}` | Lapsed=rank 1, festive deprioritized, fact-id discipline holds |
| 4 | `/orders/ingest` + `last_touch_7d` attribution, `/simulate/recovery`, extended `/stats`, `/debrief` (Groq) | ₹15,177 recovered, 20.8% recovery rate, debrief cites only allowed facts |
| **5 Track A** | Frontend `web/`: Opportunities + Campaign Review + Results screens, FactChip drawer, FunnelBar, chaos toggle (via `/channel-config` proxy), Tailwind v4 | **`npm run build` clean — UI smoke test by user pending** |

Git log:
```
a404101 Phase 5 Track A: frontend pulse-web — 3 screens, Tailwind v4 + react-router, CORS + /channel-config proxy
c9438d2 Phase 4
a25a944 Phase 3
45d0a21 Phase 2
f11c9ae Phase 1 (vite package-lock)
6eabc51 Phase 1 (verify SQL)
a3c073e Phase 1 (Groq swap)
56e9329 Phase 1 scaffold
```

## What's left

- **Phase 5 Track A smoke-test** — user runs `npm run dev` in `web/`,
  clicks through 3 screens against running backend, reports any issues.
- **Phase 5 Track B — Deployment** (not started). Per README §9:
  - Neon: already up (DB seeded)
  - Backend (crm-api + channel-service) → **Render** free tier
  - Frontend (`web/` → split into separate `pulse-web` repo) → **Vercel** Hobby
  - CORS allowed-origin env var
  - Confirm prod seed by running generator against prod DATABASE_URL
- **GitHub sync** — local `main` (8 commits) and remote
  `github.com/SHRISHTI1414/pulse` (1 commit, manually pushed by user
  yesterday) have **diverged histories**. Do NOT push without explicitly
  reconciling — user said they'd handle this later.

## Repo layout

```
~/Documents/xeno/pulse/
├── README.md                  ← master product spec (verbatim from user)
├── HANDOFF.md                 ← this file
├── AI_WORKFLOW.md             ← decision log (placeholder, user to fill)
├── .env                       ← DATABASE_URL + GROQ_API_KEY (gitignored)
├── .env.example
├── .venv/                     ← shared Python deps for both backend services
├── docs/data-spec.md          ← schema + pattern spec
├── crm-api/                   ← FastAPI #1 — main CRM
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py            ← FastAPI app + CORS + router includes
│   │   ├── config.py          ← pydantic-settings (reads ../../.env)
│   │   ├── db.py              ← SQLAlchemy engine (pool 20+40)
│   │   ├── models.py          ← 8 tables, all enums, JSONB, indexes
│   │   ├── schemas.py         ← all Pydantic request/response models
│   │   ├── facts.py           ← 13 named SQL facts + resolver + cohort audiences
│   │   ├── llm.py             ← Groq client (JSON mode + retry)
│   │   ├── state_machine.py   ← message status transitions (pure logic)
│   │   └── routers/
│   │       ├── receipts.py        ← POST /receipts idempotent
│   │       ├── campaigns.py       ← POST + GET + PATCH + approve + send + stats + debrief
│   │       ├── opportunities.py   ← POST /generate, GET, /facts/{id}/resolve, /draft-campaign
│   │       ├── orders.py          ← POST /orders/ingest + last_touch_7d
│   │       ├── simulate.py        ← POST /simulate/recovery
│   │       └── channel_config.py  ← proxy to channel-service /config
│   └── tests/                 ← 29 pytest tests, all passing
├── channel-service/           ← FastAPI #2 — message simulator
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── state.py           ← in-memory mode + counters
│       ├── simulator.py       ← per-msg outcome timeline + semaphore-capped POSTs
│       └── routers/{send,config}.py
├── web/                       ← React + Vite + TS + Tailwind v4
│   ├── package.json
│   ├── vite.config.ts         ← @tailwindcss/vite plugin
│   ├── .env                   ← VITE_API_BASE_URL
│   └── src/
│       ├── main.tsx + App.tsx + index.css
│       ├── lib/{api,types,factCitations}.ts(x)
│       ├── components/        ← Button, Card, Drawer, Spinner, EmptyState, ErrorState,
│       │                        FactChip, FactResolveDrawer, FunnelBar, Header
│       └── pages/             ← Opportunities, CampaignReview, Results
└── scripts/
    ├── create_tables.py
    ├── generate_data.py       ← seeded + reproducible, --reset to wipe
    ├── verify_patterns.sql
    ├── phase2_gate.py         ← 500-msg hostile mode test
    ├── phase3_gate.py         ← hero flow E2E
    └── phase4_gate.py         ← full demo: send → settle → recover → debrief
```

## How to run locally

```bash
# Backend (two terminals or background)
cd ~/Documents/xeno/pulse/crm-api
../.venv/bin/python -m uvicorn app.main:app --port 8000

cd ~/Documents/xeno/pulse/channel-service
../.venv/bin/python -m uvicorn app.main:app --port 8001

# Frontend
cd ~/Documents/xeno/pulse/web
npm run dev   # → http://localhost:5173
```

## Phase-gate discipline (from README)

> **Work proceeds strictly one phase at a time — never build ahead.
> Before each phase, present a short plan and wait for approval.**

User has consistently asked for plans before code. They also said:
- No emoji unless requested
- Don't push to GitHub without explicit ask
- Don't monitor PRs / GitHub checks
- Don't touch Mahrea (sibling project at `~/Documents/BIGBETSAI/Mahrea/`)
- Use free tiers only for deployment

## Notes for next session

- The user has an active Groq API key in `.env` (warned them to rotate
  after submission since it was pasted in chat).
- Same with the Neon DATABASE_URL.
- `web/src/pages/Results.tsx` includes a `renderDebriefText` helper that
  resolves `{fact:fX}` placeholders to live stat values for display.
- The state machine has a known-good test suite — don't touch it without
  a test failure to justify the change.
- Phase 4 gate script uses 180s timeout for `/simulate/recovery` because
  ~50 sequential Neon round-trips push past 60s on free tier.
- Channel-service simulator uses a global `asyncio.Semaphore(50)` to cap
  in-flight POSTs (otherwise httpx pool exhausts on 500-msg hostile runs).
- crm-api `/campaigns/{cid}/send` is intentionally **sync `def`** not
  async — sync SQLAlchemy work would block the event loop otherwise.
