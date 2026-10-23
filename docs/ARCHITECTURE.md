# ResQ AI Architecture & Engineering Design

ResQ AI is an evidence-aware emergency incident intelligence and decision support system. It ingests messy multimodal communication streams (unstructured witness text, 911 transcripts, scene photographs, and alert bulletins) and transforms them into verifiable, structured incident records.

> **Decision Support Mandate:** ResQ AI provides operational decision support for command teams, emergency liaisons, and intelligence analysts. It is **not** an automated dispatch system and never makes autonomous dispatch decisions.

---

## 1. System Topology & Data Flow

```
[ Unstructured Inputs ]
  - Dispatch Audio / Web Speech API (STT)
  - Emergency 911 Transcripts & Field Notes
  - Scene Photographs (JPEG/PNG/WEBP) & PDF Bulletins
            │
            ▼
┌────────────────────────────────────────────────────────┐
│               Frontend (React 18 + Vite)               │
│  - Accessible WCAG 2.2 AA Shell                       │
│  - Strict Provenance Labels (Text + Icon)             │
│  - Focus-Trapped Interactive Drawers                  │
│  - Side-by-Side Incident Fusion Workbench             │
│  - Action Report Markdown / Checklist Viewer          │
└────────────────────────────────────────────────────────┘
            │  REST API (Typed JSON / Multipart)
            ▼
┌────────────────────────────────────────────────────────┐
│            Backend (Node + TypeScript + Express)       │
│  - Security: Helmet, CORS, Rate Limiting, File Magic   │
│  - In-Memory SHA-256 Hash Cache & Idempotency Store    │
│  - Repository Interface (JSON File Store & Memory)     │
└────────────────────────────────────────────────────────┘
            │                            │
            ▼                            ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ Google Gemini Multimodal │  │  Google Search Grounding │
│      Extraction Call     │  │   (Separate Verification)│
│ - responseSchema JSON    │  │ - Official agency alerts │
│ - Delimited User Input   │  │ - Grounding Metadata only│
│ - Zod Untrusted Re-eval  │  │ - Unverified fallback    │
└──────────────────────────┘  └──────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│             Deterministic Priority Engine              │
│  - Pure function with configurable rule tables         │
│  - Missing location or conflicting facts -> Needs Review│
│  - Life-safety casualty scoring -> Critical / High     │
└────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│                 Incident Fusion Engine                 │
│  - Spatio-temporal and taxonomy candidate matching     │
│  - Conflict identification and side-by-side diff       │
│  - Strict Human-in-the-Loop confirmation               │
│  - Preserves every original dispatch & evidence item   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Principles

### A. Separation of AI Inference from Priority Decisions
AI language models can hallucinate severity or assign inconsistent triage priorities. In ResQ AI:
1. The Gemini model is **only permitted to extract factual indicators and observable hazard claims**.
2. Priority levels (`Critical`, `High`, `Moderate`, `Low`, `Needs review`) are computed **strictly by a deterministic pure function (`evaluatePriority`)**.
3. Any unresolved conflicting statement or missing physical location **strictly forces the priority to `Needs review`**.

### B. Strict Evidence Provenance Standard
Every single factual statement is stored with one of four immutable provenance tags:
- `USER_REPORTED`: Stated directly by the reporting party.
- `AI_INFERRED`: Deduced from multimodal scene analysis.
- `VERIFIED`: Corroborated by a retrieved official warning source via Google Search Grounding.
- `UNVERIFIED_OR_CONFLICTING`: Conflicting witness accounts or unverified assertions.

Badges are rendered with explicit textual labels and distinct icons (never color alone).

### C. Human-in-the-Loop Incident Fusion
Incident Fusion identifies duplicate, fragmented, or evolving reports referencing the same disaster event:
- Deterministic signals compare classification, geographic proximity, and temporal delta (within 4h to 24h operational windows).
- The Gemini model may only generate explanatory summaries of similarity.
- Merging is **never automatic**: an authorized responder must explicitly confirm or reject the merge.
- The fused master record **permanently retains links to all original source records**, raw timestamps, and conflicting assertions.

---

## 3. Technology Stack Breakdown

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Monorepo** | npm workspaces | Type-safe shared models without runtime overhead |
| **Shared Core** | TypeScript + Zod | Single source of truth for schemas, validation, priority engine |
| **Backend** | Node.js + Express + Multer | Lightweight, robust, strict binary magic-byte validation |
| **AI SDK** | `@google/genai` (Official) | Official Google SDK with `responseSchema` and Search tools |
| **Frontend** | React 18 + Vite + Tailwind | Instant reactivity, dark navy/teal aesthetic, accessible HTML5 |
| **Icons** | Lucide React | Clear accessible icons paired with text |
| **Testing** | Vitest + RTL + Supertest + Axe | End-to-end reliability, unit, integration, and WCAG AA verification |

---

## 4. Separation of Real and Demo Storage

To guarantee safety and prevent test pollution:
- **Demo Store:** `./data/demo_incidents.json` stores 4 clearly fictional emergency incidents.
- **Real Store:** `./data/incidents.json` stores real user extractions.
- When running in Demo Mode, simulated extractions are tagged with `is_simulated: true` and `source_channel: SIMULATED_DEMO`.
- Demo data can be reset to default fictional scenarios via `POST /api/incidents/reset-demo`, which (like `DELETE /api/activity`) is protected by the `ADMIN_TOKEN` server-side authorization check.
