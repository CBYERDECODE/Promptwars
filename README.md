# ResQ AI | Incident Intelligence & Decision Support

[![Build & Test Status](https://img.shields.io/badge/tests-39%20passed-brightgreen.svg)]()
[![Accessibility](https://img.shields.io/badge/accessibility-axe--core%20audited%20(automated)-teal.svg)]()
[![Gemini API](https://img.shields.io/badge/Google%20GenAI-Official%20SDK-4285F4.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()


> *Transforming messy emergency reports into verifiable, evidence-aware incident records with deterministic prioritization, multi-report Incident Fusion, and exportable action intelligence.*  
> **Mandate:** ResQ AI is decision support, not an automated dispatch system.

---

## Persistent Operational Notice
**In immediate danger, contact local emergency services now. Do not wait for AI analysis.**  
ResQ AI provides analytical decision support for emergency managers; it does not replace official emergency services. Official regional hotlines: **United States: 911** &bull; **India: 112 / NDMA 1078** &bull; **European Union / UK: 112 / 999**.

---

 

## ⚡ Quick Start & Run Commands

### 1. Prerequisites
- **Node.js:** v20.x or v22.x+ (tested on Node v24.17.0)
- **NPM:** v10.x+

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/anjalitiwari2007/Promptwars.git
cd Promptwars

# Install all workspace dependencies
npm install
```

### 3. Environment Setup (Optional)
ResQ AI works out-of-the-box with **zero credentials**; the frontend starts in **Simulated Demo Mode** until the backend reports that Gemini is configured (`/api/health` → `gemini.configured: true`), at which point it automatically switches to **Live AI Mode**.  
To enable live Gemini inference, copy `.env.example` and set your key:
```bash
cp .env.example .env
# Edit .env and supply GEMINI_API_KEY=your_key_here
# Optional: set ADMIN_TOKEN to protect demo-reset / activity-log deletion endpoints
# Optional: set CORS_ORIGIN to a comma-separated allowlist of trusted frontend origins
```

### 4. Run Development Servers
```bash
npm run dev
```
- **Frontend:** http://localhost:5173 *(Vite falls back to the next free port — e.g. http://localhost:5174 — if 5173 is already in use)*
- **Backend API:** http://localhost:3001

> **Local-development CORS note:** the backend only accepts the origins listed in `CORS_ORIGIN` (comma-separated). If `CORS_ORIGIN` is unset, it defaults to the documented local-dev origins `http://localhost:5173`, `http://localhost:5174`, `http://localhost:4173` (plus their `127.0.0.1` equivalents). Add your own origin there if your dev server runs elsewhere; wildcard origins are never allowed.

---

## 🧪 Verification & Testing Commands

Execute the test suites and quality gates against real local test runners:

```bash
# 1. Monorepo Typecheck (All workspaces)
npm run typecheck

# 2. Workspace Linting
npm run lint

# 3. Automated Test Suite (39/39 Passing)
npm test

# 4. Production Build (Shared -> Backend -> Frontend Vite bundle)
npm run build
```

### Verified Test Results (Executed on Node v24.17.0, macOS)

| Suite | Tests | Result | Focus Areas |
| :--- | :---: | :---: | :--- |
| **`@resq-ai/shared`** | 9 | **9 / 9 Passed** | Deterministic priority rules (`Critical`, `High`, `Moderate`, `Low`, `Needs review`), forced `Needs review` on missing location or conflicting claims, and safe `reported_at` timestamp validation/fallback. |
| **`@resq-ai/backend`** | 24 | **24 / 24 Passed** | Multimodal Zod validation, genuine magic-byte check, spoofed signature rejection, oversized upload rejection, unconfigured Gemini graceful error handling, fusion preview/confirmation audit retention, **idempotent fusion (repeat/reversed/self-pair blocked without data corruption)**, strict CORS allowlist, admin-token authorization for destructive endpoints, non-greedy location extraction and structural location confidence, action report export, idempotency replay. |
| **`@resq-ai/frontend`** | 6 | **6 / 6 Passed** | Provenance badges (text + icon), priority badges, persistent emergency notice, navigation shell, focus-trapped drawer with Escape key handling, and automated `axe-core` accessibility audit (0 critical/serious violations). |
| **Total** | **39** | **39 / 39 Passed** | **100% Green** |

---

## 🧭 Reproducible 30-Second Demo Walkthrough

1. Open **http://localhost:5173** (or the port Vite prints if 5173 is busy).
2. Notice the **Header Mode Badge**. With no `GEMINI_API_KEY` configured it reads **"MODE: SIMULATED"** by default; when the backend reports Gemini as configured, the app auto-switches the badge to **Live AI Mode** (and it can be toggled manually in Settings). The **Persistent Emergency Notice** is always shown.
3. Click **"Report Incident"** in the sidebar.
4. Click the preset button **"🌊 Flash Flood"** (or type a messy report like: *"Water rising 4ft on Main St, seniors trapped on porch, bridge out"*).
5. Click **"Analyze on Demand"**:
   - Observe the instant structured extraction: classified as `FLOOD`.
   - Priority evaluated deterministically as **Critical** with explainable reasons.
   - Evidence items clearly labelled with the **`USER_REPORTED`** provenance badge.
6. Click **"Save Incident to Queue"**.
7. Navigate to **"Incident Queue"**, click the incident row to open the **Detail Drawer**.
8. Switch to the **"Export Action Report"** tab:
   - Check items in the **Decision Support Checklist**.
   - Review recommendations clearly designated as `[RECOMMENDED ADVICE - NOT EXECUTED]`.
   - Click **"Copy Markdown"** or **"Download .MD"**.
9. Navigate to **"Incident Fusion"**:
   - Compare two candidate reports side-by-side.
   - Note highlighted factual discrepancies (e.g. Caller A vs Caller B water depth).
   - Enter human resolution notes and click **"Confirm & Fuse Reports"** (merging is never automated and preserves all original records).
10. Explore **"Verified Sources"** to view regional official sources (NDMA, IMD, NWS, FEMA) and test Google Search Grounding verification.

---

## 📂 Repository Structure

```
Promptwars/
├── packages/
│   └── shared/                # Shared types, Zod schemas, deterministic priority engine
│       ├── src/priority.ts    # Pure deterministic priority evaluation function
│       ├── src/schemas.ts     # Zod schemas for Gemini output re-validation
│       └── src/types.ts       # Provenance, priority, and incident models
├── apps/
│   ├── backend/               # Express + TypeScript backend
│   │   ├── src/services/      # Gemini multimodal extraction & search grounding
│   │   ├── src/repository/    # File-backed and in-memory stores (separate demo/real)
│   │   ├── src/utils/         # Magic-byte file validator, hash cache, idempotency
│   │   └── src/routes/        # REST endpoints (incidents, fusion, sources, activity)
│   └── frontend/              # React 18 + Vite + Tailwind frontend
│       ├── src/components/    # Accessible badges, drawer, header, disclaimer
│       └── src/views/         # Overview, Report, Queue, Fusion, Sources, Settings
├── docs/                      # Architectural and security documentation
│   ├── ARCHITECTURE.md        # System architecture & data flow
│   ├── SECURITY.md            # Threat model, upload sanitization, auth notes
│   ├── TESTING.md             # Section H verification results & test plan
│   ├── API.md                 # REST API documentation & error codes
│   └── DEMO_SCRIPT.md         # 3-minute hackathon judge walkthrough
├── Dockerfile                 # Google Cloud Run production deployment
├── .env.example               # Safe environment variable template
└── package.json               # Root workspace configuration
```

---

## ☁️ Google Cloud Run Deployment

ResQ AI includes a production-ready multi-stage `Dockerfile`:

```bash
# Build container image
docker build -t gcr.io/[PROJECT-ID]/resq-ai:latest .

# Deploy to Cloud Run (Serverless, auto-scaling)
gcloud run deploy resq-ai \
  --image gcr.io/[PROJECT-ID]/resq-ai:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars="NODE_ENV=production,STORAGE_TYPE=json" \
  --set-secrets="GEMINI_API_KEY=resq-gemini-key:latest" \
  --allow-unauthenticated
```
*(Note: Cloud Run deployment configuration tested locally via Docker multi-stage build; remote Cloud Run deployment requires project credentials.)*

---


