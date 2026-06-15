<div align="center">

# Pulse

### An AI-Native Revenue Recovery CRM

**Pulse doesn't just store your customers — it tells you where you're losing money, why, and exactly what to do about it.**

[![Frontend](https://img.shields.io/badge/Live_Demo-Vercel-000000?logo=vercel&logoColor=white)](https://pulse-azure-xi.vercel.app)
[![Backend API](https://img.shields.io/badge/API_Docs-Railway-0B0D0E?logo=railway&logoColor=white)](https://pulse-production-f909.up.railway.app/docs)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Groq](https://img.shields.io/badge/LLM-Groq-F55036?logo=groq&logoColor=white)](https://groq.com)

[Live App](https://pulse-azure-xi.vercel.app) · [API Docs](https://pulse-production-f909.up.railway.app/docs) · [Architecture](#-system-architecture) · [AI Workflow](#-ai-workflow)

</div>

---

## Overview

**Pulse** is an AI-native CRM built around a single question every marketer actually cares about: *"Where is my revenue leaking, and what should I do about it today?"*

Traditional CRMs are systems of record — they store who your customers are and what they bought. Pulse is a system of *action*. It continuously reads customer, order, communication, and campaign data, computes a set of named business facts, and uses an LLM strategist to surface ranked **revenue recovery opportunities**, draft win-back campaigns, execute them across channels, and measure the revenue actually recovered.

The product is organized as one coherent, end-to-end AI loop:

> **Customer Data → Opportunity Discovery → AI Strategy → Campaign Generation → Campaign Execution → Performance Tracking → Revenue Attribution → AI Debrief**

This repository is a fully working, deployed demonstration of that loop — built around a fictional 12-outlet Delhi-NCR coffee chain, *Brew Street*, seeded with 6,000 customers and ~152,000 orders.

---

## The Business Problem

Most customer revenue is lost quietly, not dramatically. A weekly regular slowly stops coming in. A dine-in loyalist drifts to delivery and orders less. A festival-season buyer never returns for a second visit. None of these trigger an alert in a normal CRM — they just show up later as a flat revenue line.

The marketer's real job is not *storing* this data — it's continuously answering:

- **What is happening in my business right now?**
- **Which customers are slipping away, and why?**
- **What is the single highest-value action I can take today?**
- **Did the action actually grow the business?**

Doing this manually means writing SQL, exporting to spreadsheets, eyeballing cohorts, guessing at messaging, and rarely closing the loop on whether anything worked.

---

## Why Traditional CRMs Fall Short

| Traditional CRM | Pulse |
|---|---|
| System of **record** — stores customer data | System of **action** — converts data into decisions |
| You query it; it waits | It scans the data and surfaces opportunities for you |
| Reports describe *what happened* | The AI strategist recommends *what to do next* |
| Campaign building is manual | AI drafts the audience, channel, and message |
| Success measured in *opens & clicks* | Success measured in **revenue recovered** |
| Insight and action live in different tools | Detect → explain → act → measure in one flow |

A dashboard tells you the repeat-purchase rate dropped. It won't tell you *which 300 customers* drove the drop, *why* they lapsed, *what* to send them, and *how much* you got back. Pulse is built to answer exactly those four questions in sequence.

---

## How Pulse Solves It

Pulse treats the marketer's workflow as a pipeline and puts an AI strategist at the center of it:

1. **Compute facts, not vibes.** A library of **13 named SQL facts** (cohort sizes, lapsed value, delivery-drift rates, festive dormancy, opt-in rates, etc.) is computed directly against the live database. These are deterministic, auditable numbers.
2. **Constrain the AI to those facts.** The LLM strategist may only cite computed figures via `{fact:fX}` placeholders — it **never invents numbers**. Every claim in the UI is traceable to a SQL fact, and citations are validated server-side.
3. **Rank opportunities by recoverable value × recovery odds**, so the marketer always starts with the highest-impact leak.
4. **Generate the campaign** — audience snapshot, channel strategy, and tiered message copy — with one click, again grounded in facts.
5. **Execute and track** through a channel service that simulates real-world delivery receipts (delivered → read → clicked → failed) asynchronously.
6. **Attribute revenue** using a transparent `last_touch_7d` model and **debrief** the outcome in plain language.

> **Explainability is a first-class feature.** If the AI says "₹58L is recoverable from lapsed regulars," you can click through to the exact fact and the data behind it.

---

## Key Features

- 🔍 **Opportunity Discovery** — AI scans the customer base and surfaces ranked revenue-recovery opportunities across three behavioral cohorts (lapsed regulars, delivery drift, festive one-timers).
- 🧠 **Fact-Grounded AI Strategist** — every recommendation cites real, server-computed SQL facts; hallucinated figures are structurally impossible.
- ✍️ **AI Campaign Generation** — one click drafts the audience, channel strategy, and multi-tier WhatsApp/SMS copy for a chosen cohort.
- 📤 **Campaign Lifecycle** — draft → review → approve → send, with a clean state machine and human-in-the-loop approval.
- 📡 **Channel Service (Simulated)** — an independent service that mimics real messaging delivery and returns asynchronous receipts through a status state machine.
- 📈 **Performance Tracking** — per-campaign delivery, read, click, and conversion metrics.
- 💰 **Revenue Attribution** — transparent `last_touch_7d` attribution linking recovered orders back to campaigns.
- 🗣️ **AI Debrief** — an LLM-written post-mortem that cites only verified outcome stats and suggests the next experiment.
- 🛡️ **Graceful Degradation** — if the LLM provider is unavailable, deterministic demo content keeps the entire flow functional.

---

## System Architecture

![Pulse Architecture](docs/crm.png)

Pulse is a three-service application around a single PostgreSQL database:

```
┌──────────────────┐        ┌──────────────────────────────┐        ┌──────────────────────┐
│   web (React)    │ HTTPS  │       crm-api (FastAPI)        │  HTTP  │  channel-service     │
│  Vite + TS SPA   │ ─────► │  facts · LLM strategist · CRM  │ ─────► │  (FastAPI simulator) │
│      Vercel      │        │  campaigns · attribution       │ ◄───── │  delivery receipts   │
└──────────────────┘        └───────────────┬────────────────┘        └──────────────────────┘
                                            │ SQLAlchemy
                                   ┌────────▼────────┐         ┌──────────────┐
                                   │   PostgreSQL    │         │   Groq LLM   │
                                   │   (8 tables)    │         │  strategist  │
                                   └─────────────────┘         └──────────────┘
```

- **`web`** — React + TypeScript single-page app (Vite). Talks only to `crm-api`.
- **`crm-api`** — the core service: computes facts, calls the Groq strategist, runs the campaign lifecycle, and performs revenue attribution. Tables are auto-created on startup.
- **`channel-service`** — an independent FastAPI service that **simulates** message dispatch and asynchronously returns delivery/read/click receipts. It is a simulator, not a real messaging gateway.
- **PostgreSQL** — 8 tables: `stores`, `customers`, `orders`, `opportunities`, `campaigns`, `messages`, `receipt_events`, `attributions`.

> ⚠️ **Honest scope note:** the channel service is a faithful *simulation* of real-world communication systems for demo purposes. Pulse does **not** integrate with live WhatsApp/SMS providers. The simulation is detailed (async receipts, a delivery state machine, a configurable failure mode) but no real messages are sent.

---

## AI Workflow

The LLM is used at three deliberate, narrow points — never as an opaque black box.

| Stage | Input | LLM Role | Output | Guardrail |
|---|---|---|---|---|
| **1. Strategy** | 13 computed SQL facts | Rank cohorts by recoverable value × odds | 3 ranked opportunities with reasoning | Must cite `{fact:fX}`; citations validated; one retry on schema failure |
| **2. Campaign Draft** | Cohort facts + opportunity reasoning | Write audience-appropriate copy | Name, channel strategy, 2 message tiers (WhatsApp + SMS) | Strict JSON schema (Pydantic); char limits enforced |
| **3. Debrief** | Campaign outcome stats | Narrate what worked / what's next | 3–4 sentence post-mortem + next step | Cites only verified stat-facts |

**Why this design holds up:**

- **No invented numbers.** Figures are computed in SQL; the model only *references* them by id. Server-side validation strips any citation to an unknown fact.
- **Strict JSON output** via Groq's JSON mode, validated against Pydantic schemas, with a single corrective retry before failing.
- **Deterministic fallback.** If `GROQ_API_KEY` is unset or the provider errors, Pulse returns sensible demo strategy/copy/debrief output instead of crashing — the loop never breaks during a demo.

---

## Technology Stack

**Frontend**
- React 19 + TypeScript
- Vite (build tool)
- Tailwind CSS · React Router

**Backend**
- FastAPI (Python 3.12)
- SQLAlchemy 2.0 (typed ORM)
- PostgreSQL
- Pydantic v2 (schema validation)

**AI**
- Groq LLM — `llama-3.1-8b-instant` (JSON mode, schema-validated)

**Infrastructure**
- Vercel (frontend hosting)
- Railway (backend + managed PostgreSQL)

---

## Project Structure

```
pulse/
├── crm-api/                 # Core FastAPI service
│   └── app/
│       ├── main.py          # App entry; auto-creates tables on startup
│       ├── models.py        # SQLAlchemy models (8 tables)
│       ├── schemas.py       # Pydantic request/response schemas
│       ├── facts.py         # 13 named SQL facts + 3 cohort definitions
│       ├── llm.py           # Groq client (JSON mode + retry)
│       ├── state_machine.py # Message status transitions
│       └── routers/         # opportunities · campaigns · audience ·
│                            # orders · receipts · simulate · channel_config
├── web/                     # React + TypeScript + Vite SPA
│   └── src/                 # pages · components · lib (API client)
├── channel-service/         # FastAPI delivery simulator (async receipts)
├── scripts/                 # Data generation, table creation, phase gates
│   ├── generate_data.py     # Seeds 6,000 customers + ~152k orders
│   └── create_tables.py
├── docs/                    # Architecture diagram + data spec
└── README.md
```

---

## Deployment

Pulse runs as a deployed, publicly accessible demo.

| Service | Platform | URL |
|---|---|---|
| Frontend | Vercel | https://pulse-azure-xi.vercel.app |
| Backend API | Railway | https://pulse-production-f909.up.railway.app/docs |
| Database | Railway PostgreSQL | (managed) |

**Frontend → backend wiring:** the SPA reads its API base from `VITE_API_BASE_URL` (baked in at build time), pointed at the Railway backend.

### Run locally

```bash
# 1. Backend (crm-api)
cd crm-api
pip install -r requirements.txt
# set DATABASE_URL (Postgres) and optionally GROQ_API_KEY in ../.env
uvicorn app.main:app --reload --port 8000   # tables auto-create on startup

# 2. Seed demo data (6,000 customers, ~152k orders, 3 planted patterns)
cd ..
python scripts/generate_data.py

# 3. Channel service (delivery simulator)
cd channel-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# 4. Frontend
cd ../web
npm install
echo "VITE_API_BASE_URL=http://localhost:8000" > .env
npm run dev   # http://localhost:5173
```

> **Note:** `GROQ_API_KEY` is optional. Without it, Pulse serves deterministic demo strategy/copy so the full flow still works.

---

## Demo Walkthrough

A 2-minute path through the entire revenue-recovery loop:

1. **Brand Health** — open Pulse and immediately see the business state: at-risk customers, total revenue, and revenue at risk. *("What's happening right now?")*
2. **Opportunity Discovery** — the AI presents ranked revenue leaks (e.g. *Lapsed Regulars — ₹58L recoverable*). *("What should I do today?")*
3. **The Why** — open an opportunity to see the cited facts and a real sample of affected customers. *("Why these customers?")*
4. **Campaign Generation** — one click drafts the audience, channel, and message tiers.
5. **Review & Send** — approve the AI's draft and dispatch it through the channel service.
6. **Performance Tracking** — watch delivery/read/click receipts flow back in.
7. **Revenue Attribution** — recovered orders are linked back to the campaign via `last_touch_7d`.
8. **AI Debrief** — a plain-language post-mortem citing the real outcome stats. *("Did the business actually grow?")*

---

## Design Philosophy

- **AI as the protagonist, not a feature.** The strategist drives the workflow; the UI is built around its reasoning, not bolted on.
- **Every number is traceable.** Facts are computed in SQL and cited by id. Trust comes from explainability, not confidence.
- **Outcomes over vanity metrics.** The product is organized around *revenue recovered*, not opens and clicks.
- **Answer the business question on screen one.** Revenue at risk, recovery opportunities, and the highest-value action are visible immediately — never hidden behind interactions.
- **Honest about scope.** Simulated systems are labeled as simulated. The demo is impressive because it's real where it claims to be real.

---

## Lessons Learned

- **Constraining the LLM made it trustworthy.** Forcing the model to cite pre-computed facts (rather than generate figures) eliminated hallucinated numbers and made the output auditable — the single most important design decision.
- **Graceful degradation is a demo superpower.** Wrapping the LLM and the channel service so missing dependencies fall back to deterministic output meant the core flow never 500s, even with no API key or no messaging service deployed.
- **Schema-create-on-startup beats forgotten migrations.** Auto-creating tables in the FastAPI lifespan removed an entire class of "relation does not exist" deployment failures.
- **Build-time vs runtime config bites you.** Vite inlines env vars at build time, so connecting a deployed frontend to a deployed backend is a *rebuild*, not just an env edit — an easy multi-hour trap.
- **Separation of services clarifies thinking.** Keeping delivery simulation in its own service kept the core CRM logic clean and made the messaging boundary explicit and honest.

---

## Future Roadmap

Pulse is intentionally scoped as a focused demonstration. Natural next steps:

- **Real channel integrations** — swap the simulator for live WhatsApp/SMS/email providers behind the same interface.
- **Richer attribution** — add holdout groups and multi-touch models beyond `last_touch_7d`.
- **Conversational CRM** — natural-language commands ("re-engage my lapsed Saket customers") that the AI compiles into campaigns.
- **Autonomous agent mode** — give Pulse a goal ("increase repeat revenue 15%") and let it find audiences, run campaigns, and optimize within guardrails.
- **Continuous scanning** — scheduled fact recomputation and proactive opportunity alerts.

---

## Author

**Shrishti Yadav**

Built as an end-to-end demonstration of an AI-native product workflow — from raw customer data to measured revenue impact.

- **Live Demo:** https://pulse-azure-xi.vercel.app
- **API Docs:** https://pulse-production-f909.up.railway.app/docs

---

<div align="center">

*Pulse — find the revenue you're already losing.*

</div>
