# ResQ AI Verification & Testing Strategy

ResQ AI implements a rigorous test suite designed specifically against the Section H Judging Criteria. Gemini calls are mocked in automated suites; live-key smoke tests run separately.

---

## 1. Section H Criteria Traceability Matrix

| Test ID | Evaluation Scenario | Test File & Location | Verification Status |
| :--- | :--- | :--- | :--- |
| **H.1** | Valid text report -> structured fields with provenance | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.2** | Valid image with genuine magic bytes accepted | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.3a** | Unsupported executable / script rejected (`FILE_REJECTED`) | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.3b** | Spoofed file signature (declared PNG, actually text) rejected | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.3c** | Oversized file (>10MB) rejected by size validator | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.4** | Malformed / invalid schema output rejected by double-Zod parse | `apps/backend/src/middleware/errorHandler.ts` | ✅ **PASS** |
| **H.5** | Unconfigured/failed Gemini call gives clear error & saves nothing | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.6** | Missing location stays null and forces "Needs review" | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.7** | Newly reported incident is never falsely labelled as VERIFIED | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.8** | Critical danger indicators -> deterministic Critical priority with reasons | `packages/shared/src/priority.test.ts` | ✅ **PASS** |
| **H.9** | Conflicting statements remain visible & force "Needs review" | `packages/shared/src/priority.test.ts` | ✅ **PASS** |
| **H.10** | Incident Fusion requires explicit human confirmation | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.11** | Merge preserves original-report links, timestamps, and claims | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.12** | Export is valid (JSON structure + downloadable Markdown) | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.13** | Empty / failed states render cleanly in UI shell | `apps/frontend/src/test/app.test.tsx` | ✅ **PASS** |
| **H.14** | Forms, drawer, and dialogs are keyboard-operable (Escape, focus trap) | `apps/frontend/src/test/app.test.tsx` | ✅ **PASS** |
| **H.15** | Grounding with absent metadata yields "Verification unavailable" | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **H.16** | Retries with identical idempotency_key never duplicate incidents | `apps/backend/src/backend.test.ts` | ✅ **PASS** |
| **A11Y** | Automated WCAG 2.2 AA accessibility audit (zero critical/serious violations) | `apps/frontend/src/test/app.test.tsx` (axe-core) | ✅ **PASS** |

---

## 2. How to Run the Tests

### A. Run Shared Engine Unit Tests
```bash
npm run test -w @resq-ai/shared
```
*Tests priority engine rules, conflicting statement handling, missing location constraints, and life-safety thresholds.*

### B. Run Backend Integration Tests (Supertest)
```bash
npm run test -w @resq-ai/backend
```
*Tests file upload magic-byte rejection, simulated extractions, idempotency keys, fusion audit retention, and grounding fallbacks.*

### C. Run Frontend & Accessibility Tests (React Testing Library + axe-core)
```bash
npm run test -w @resq-ai/frontend
```
*Tests component rendering, keyboard drawer operations, provenance badge text/icon presence, and automated axe WCAG checks.*

### D. Full Monorepo Typecheck & Build
```bash
npm run typecheck --workspaces
npm run build --workspaces
```

---

## 3. Real-Key Gemini Smoke Test (Opt-In)

To run a live test against the actual Google Gemini API (requires a valid key):
```bash
GEMINI_API_KEY=your_key_here node -e "
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Ping test for ResQ AI'
  }).then(r => console.log('Live Gemini Connection OK:', r.text));
"
```
