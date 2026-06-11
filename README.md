# Pulse — an AI-native revenue-recovery CRM

**Thesis:** Pulse does one job — find the revenue quietly leaking out of a brand's existing customer base, and win it back. An AI strategist analyzes order history, proposes complete win-back campaigns, and a human approves before anything is sent. **Every number the AI cites is clickable** and resolves to the live data behind it.

Built for the Xeno FDE assignment. Demo brand: **Brew Street**, a fictional 12-outlet coffee/QSR chain in Delhi NCR, with ~6,000 customers and 15 months of simulated order history.

> **NOTE FOR CLAUDE CODE:** This README is the master spec. Work proceeds **strictly one phase at a time** — never build ahead into a later phase without being told "start Phase N". Before each phase, present a short plan and wait for approval. Ask before adding any dependency not listed. Simple > clever. No auth, no Docker for apps, no speculative abstractions.

---

## 1. The problem

A marketer at a multi-outlet QSR brand cannot see churn while it's happening. A customer who ordered 3x/week goes silent; nothing flags it; it surfaces months later as "flat revenue", when the win-back window has closed. The data to catch it in week one exists in the order history — but no one has time to interrogate it daily, build the segment, write the messages, pick the channel, and prove afterwards that the campaign (not coincidence) brought the customer back.

**Pulse turns that entire loop into: review what the AI found → edit → approve → see recovered revenue.**

## 2. The product loop (hero flow)

1. **Detect** — deterministic SQL computes facts about the customer base (lapse cohorts, values, channel engagement). The AI Strategist ranks the opportunities and explains why, citing only computed facts.
2. **Decide** — for the top opportunity, the AI proposes a full campaign: audience, per-tier message drafts, WhatsApp-vs-SMS per customer, with evidence-linked reasoning. The marketer edits and approves. **The AI never sends autonomously.**
3. **Deliver** — the CRM dispatches through a separate, stubbed **channel service** that simulates real-world delivery chaos and calls back asynchronously with receipts (delivered / read / clicked / failed).
4. **Debrief** — receipts settle, recovered orders are attributed to the campaign (`last_touch_7d`), and the dashboard answers the only question that matters: **how much revenue did we recover?**

## 3. Architecture

```
┌─────────────┐   send API    ┌──────────────────┐
│   crm-api    │ ────────────▶ │ channel-service   │  (separate FastAPI app)
│  (FastAPI)   │ ◀──────────── │  simulates WA/SMS │
│              │  async receipt │  outcomes + chaos │
│  Postgres    │   callbacks    └──────────────────┘
│  (Neon)      │
│  Claude API  │ ◀── Strategist / compose / debrief prompts
└──────┬───────┘
       │ REST
┌──────▼───────┐
│  pulse-web    │  React + Vite + TS (separate repo, deployed on Vercel)
└──────────────┘
```

- **Two repos** (submission requirement): `pulse-crm-backend` (this repo: `crm-api/` + `channel-service/` + `scripts/` + `docs/`) and `pulse-crm-frontend` (`pulse-web`).
- **LLM:** Anthropic Claude via API. Key in env (`ANTHROPIC_API_KEY`), never committed. Strict rule across all prompts: **the model may only cite numbers provided to it as computed facts; it never computes or invents figures.**
- **Channels modeled:** WhatsApp + SMS only (the authentic Indian-retail pair). SMS has no `read` state — the state machine encodes per-channel reality.

## 4. Data model (8 tables)

`stores` (12 NCR outlets, 3 flagged office-district) · `customers` (persona-generated, ~85% whatsapp_opt_in) · `orders` (store, dine_in/takeaway/delivery, INR amounts, 15 months) · `opportunities` (cohort_definition jsonb, **facts jsonb** — `{fact_id, label, value, query_ref}` — llm_reasoning referencing fact ids, priority_rank, status) · `campaigns` (segment snapshot, message_templates per tier, draft→approved→sending→completed) · `messages` (channel, body, status: queued→sent→delivered→read→clicked, failed terminal; **SMS never enters read**) · `receipt_events` (**UNIQUE event_id = idempotency**) · `attributions` (order↔campaign↔message, model name).

## 5. Simulated data (Phase 1 — DONE when verified)

Generator: `scripts/generate_data.py` — reproducible from `--seed`, anchored to `--today 2026-06-14`, persona-based baseline (heavy_regular 8% / regular 20% / occasional 45% / one_timer 27%), morning + evening peaks, office stores skew weekday-morning. Three planted patterns:

| Pattern | Size | Shape | Why it exists |
|---|---|---|---|
| **Lapsed weekday regulars** (hero) | ~300 | 6+ months steady, office-district stores, hard stop ~Apr 25 2026 | The valuable, recoverable cohort the Strategist must surface first |
| **Delivery drift** | ~450 | Shifted to 70%+ delivery, then 40–60% frequency decay, still active | Proves the AI distinguishes *at-risk* from *gone* |
| **Festive one-timers** | ~700 | Diwali-window promo acquisitions, 1–2 gift orders, silence | The decoy: big cohort, poor odds — the AI must *deprioritize* it |

Verification: `scripts/verify_patterns.sql` — counts within ±10%, hero cohort clustered in office stores, annualized value in lakhs, organic weekly histogram. **Phase gate: these queries pass before Phase 2 starts.**

## 6. Phase 2 — Channel service + receipt loop (the engineering centerpiece)

### channel-service
- `POST /send` — accepts batch: `[{message_id, channel, recipient, body}]`. Returns 202 immediately (`accepted` count). Processing is async.
- For each message it simulates an outcome timeline, then **calls back** to crm-api `POST /receipts` with events. Event payload: `{event_id (uuid), message_id, event_type, occurred_at}`.
- Outcome model: WhatsApp → sent → delivered (~94%) → read (~65% of delivered) → clicked (~22% of read); SMS → sent → delivered (~96%) → clicked (~6% of delivered, link click); failures: terminal `failed` instead of delivered.
- **Chaos modes** via `POST /config {mode: "calm" | "hostile"}` (+ `GET /config`):
  - **calm** — receipts arrive in order, 0.2–2s apart, ~2% failures, no duplicates.
  - **hostile** — latency jitter 0.5–20s, ~15% failures, ~10% of events sent **twice** (same event_id), per-message event order **shuffled** (clicked may arrive before delivered), and ~5% of callback POSTs fail on first attempt → channel-service retries with exponential backoff (3 attempts).
- In-memory asyncio task queue is fine. No DB in channel-service.

### crm-api receipt loop
- `POST /receipts` — idempotent ingestion: insert receipt_event; on `event_id` unique violation → 200 OK, no-op (duplicates absorbed silently, counted in logs).
- **Status state machine** on messages: monotonic rank queued < sent < delivered < read < clicked; an event only advances status (late/duplicate lower-rank events update nothing but are still stored); `failed` only from queued/sent; **`read` illegal for SMS** (store event, don't transition, log warning). All transitions in one tested module: `app/state_machine.py`.
- Campaign send pipeline: `POST /campaigns/{id}/send` → materialize audience from segment_definition → render per-tier bodies with personalization → create messages (`queued`) → batch-call channel-service `/send` (batches of 100) → mark `sent`. Campaign auto-completes when all messages reach a terminal/settled state or a timeout sweep runs.
- **Tests (pytest, required):** state machine legal/illegal transitions incl. SMS-read; duplicate event_id absorbed; out-of-order sequence converges to correct final status.
- **Phase gate:** 500 messages in hostile mode → every message's final status is consistent and correct; zero duplicate effects.

## 7. Phase 3 — The AI Strategist

- `scripts/facts.py` / `app/facts.py`: named fact queries (each has `query_ref`): lapsed-regulars cohort + count + trailing-6mo value + annualized value + store concentration; delivery-drift cohort + decay %; festive cohort + repeat rate; per-cohort WhatsApp opt-in/engagement split. Output: facts jsonb array.
- `POST /opportunities/generate` → compute facts → single Claude call → **strict JSON out**: ranked opportunities `[{title, cohort_ref, reasoning (must reference fact_ids inline like {fact:f3}), priority_rank, recommended_action}]` → persist. Prompt rules: cite only provided fact_ids; no invented numbers; rank by recoverable value × recovery odds; explicitly deprioritize poor-odds cohorts with stated reason.
- `GET /opportunities`, `GET /facts/{fact_id}/resolve` → re-runs the underlying query live, returns rows (powers **clickable evidence chips**).
- `POST /opportunities/{id}/draft-campaign` → second Claude call: audience (from cohort_definition), 2–3 message tiers (grounded in actual cohort attributes, e.g. last-visited store name, favourite item category), channel strategy (WhatsApp if opt-in & engaged, else SMS), suggested send time. Marketer edit endpoints: `PATCH /campaigns/{id}`.
- **Phase gate:** hero flow runs end-to-end via API: generate → inspect facts → draft → edit → approve → send (Phase 2 pipeline) → receipts land.

## 8. Phase 4 — Attribution, insights, debrief

- **Recovery simulation:** `POST /simulate/recovery` on channel-service (or script) — for a configurable fraction (~25%) of customers whose message reached `read`/`clicked`, POST a new realistic order to crm-api **`POST /orders/ingest`** (public ingestion API — this is also the brief's "ingest" capability, exercised live) with 1–5 day simulated delay compressed for demo.
- **Attribution:** on order ingestion, if customer has an engaged message (delivered+read or clicked) within the past 7 days → create attribution (`last_touch_7d`). Stated limitation in README: last-touch over-credits; no holdout group; acceptable and disclosed for this scope.
- `GET /campaigns/{id}/stats` → funnel (queued/sent/delivered/read/clicked/failed), per-channel split, attributed orders + recovered revenue (₹), recovery rate vs cohort size.
- **Debrief:** `POST /campaigns/{id}/debrief` → Claude writes a short narrative citing only the computed stats (same fact-id discipline), incl. "what I'd try next".
- **Phase gate:** demo sequence works: send (hostile mode) → receipts settle → simulate recovery → recovered-revenue counter moves with attributions visible.

## 9. Phase 5 — Frontend (pulse-web) + deployment

Three screens only, polished; nothing else gets UI:
1. **Opportunities** — ranked cards: title, headline value at risk, reasoning with **clickable fact chips** (chip → drawer showing live resolved rows), actions: Draft campaign / Dismiss.
2. **Campaign review** — audience summary (with peek at actual customer list), editable message tiers, channel split, Approve & Send. Chaos-mode toggle (calm/hostile) visible here or in a header — flipping it hits channel-service `/config`.
3. **Results** — live-updating funnel, per-channel stats, **Recovered revenue ₹** counter, attributed orders list, AI debrief panel. (Poll every 2s; websockets not worth it.)

Stack: React + Vite + TS, Tailwind, react-router, fetch wrapper; clean component structure; no component library bloat. Loading/empty/error states for the three screens.

Deployment: crm-api + channel-service on **Render** (US East, next to Neon), `pulse-web` on **Vercel**. CORS configured via env. Production seeded by running the generator against the prod DATABASE_URL. Frontend env: `VITE_API_BASE_URL`.

## 10. Consciously NOT built (cuts are product decisions)

No acquisition/leads/pipelines (out of brief scope) · No chat-first UI — chat is a poor surface for reviewing 300 names before messaging them; the AI proposes on visual surfaces · Email/RCS channels — two channels demonstrate channel *judgment*; four is breadth theater · No autonomous sending — human approval gate is a product position (brand-safety), not a gap · No CSV-upload chrome — ingestion is an API + documented generator · No auth/multi-tenancy · No drip journeys/scheduler — one-shot campaigns · No A/B testing.

## 11. Scale assumptions (built vs. would-build)

Built for ~10k messages/campaign: in-process async dispatch, batched sends, Postgres as the only store. At ~1M messages/day: a real queue (e.g. SQS/Kafka) replaces the in-process dispatch seam (code is shaped so that swap is one module), receipt ingestion becomes partitioned consumers keyed by message_id, stats move to incremental aggregates, and the channel callback contract gains signed payloads + replay windows. Attribution would need identity resolution + holdout groups.

## 12. Env vars

```
# crm-api
DATABASE_URL=postgresql+psycopg://...
ANTHROPIC_API_KEY=sk-ant-...
CHANNEL_SERVICE_URL=http://localhost:8001

# channel-service
CRM_RECEIPT_URL=http://localhost:8000/receipts

# pulse-web
VITE_API_BASE_URL=http://localhost:8000
```

## 13. Repo conventions

Type hints everywhere · pydantic v2 schemas for all request/response bodies · tests for the state machine + receipt idempotency (minimum) · commit per completed step · `AI_WORKFLOW.md` logged manually as the build progresses · run services: `cd crm-api && uvicorn app.main:app --reload` / `cd channel-service && uvicorn app.main:app --port 8001 --reload`.
