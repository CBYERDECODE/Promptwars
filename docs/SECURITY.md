# ResQ AI Security Posture & Threat Model

ResQ AI is built according to defense-in-depth principles appropriate for emergency decision support.

---

## 1. Secrets & Credential Management

- **Server-Only API Keys:** The `GEMINI_API_KEY` is strictly confined to the backend environment (`process.env.GEMINI_API_KEY`).
- **Zero Frontend Exposure:** No API keys, tokens, or backend credentials are ever placed in frontend `.env`, Vite bundles, or client source code.
- **Git Hygiene:** `.gitignore` explicitly excludes `.env`, `.env.local`, `.env.*.local`, runtime data stores (`apps/backend/data/`), and uploaded temporary files.
- **Sample Configuration:** `.env.example` contains only harmless placeholders with explicit documentation.

---

## 2. File Upload Hardening

Every uploaded file (image or PDF document) undergoes a three-layer validation barrier before entering processing:

1. **Size Boundary:** Rejected if size exceeds 10 MB (`config.maxUploadSizeBytes`).
2. **True Magic-Byte Inspection:** The file buffer header is inspected for binary signatures:
   - JPEG: `FF D8 FF`
   - PNG: `89 50 4E 47 0D 0A 1A 0A`
   - WEBP: `RIFF....WEBP`
   - PDF: `%PDF-` (`25 50 44 46 2D`)
3. **MIME Cross-Check & Extension Anti-Spoofing:** If an attacker uploads an executable or script disguised as `photo.png` (or declares `image/png` for plaintext), the magic-byte validator detects the discrepancy and immediately rejects the file (`FILE_REJECTED`).

---

## 3. Prompt-Injection & Untrusted Data Defense

1. **Delimited Data Boundaries:** User-submitted incident text is enclosed in strict data isolation delimiters:
   ```
   --- BEGIN UNTRUSTED USER EMERGENCY REPORT ---
   [User Input Text]
   --- END UNTRUSTED USER EMERGENCY REPORT ---
   ```
2. **Structured Response Schema (`responseSchema`):** The model is constrained to output structured JSON conforming to Google GenAI's official schema definitions.
3. **Double Zod Validation:** The raw output returned by the model is treated as untrusted data and re-validated using `GeminiExtractionOutputSchema`. If the model outputs unexpected keys or invalid enums, it is rejected immediately.
4. **Text-Only Rendering (No `dangerouslySetInnerHTML`):** All extracted claims, summaries, and notes are rendered exclusively as text nodes in React. No raw user HTML or Markdown is ever rendered unsanitized.

---

## 4. Network & Runtime Defense

- **Helmet:** Protects against MIME-sniffing, clickjacking, and enforces modern browser security headers.
- **CORS Protection:** Strict allowlist via `CORS_ORIGIN` (comma-separated). Only the exact origins listed are accepted; requests from any other origin are rejected with `403 CORS_ORIGIN_DENIED`. Wildcards are never allowed. When `CORS_ORIGIN` is unset, the backend falls back to documented local-development origins (`http://localhost:5173/5174/4173` plus their `127.0.0.1` equivalents) rather than allowing all origins.
- **Admin Authorization for Destructive Endpoints:** `POST /api/incidents/reset-demo` and `DELETE /api/activity` are guarded by `requireAdmin`. Callers must present the `ADMIN_TOKEN` as `Authorization: Bearer <token>` or `X-Admin-Token: <token>`; comparison is constant-time (`crypto.timingSafeEqual`). Missing/incorrect token → `401 ADMIN_UNAUTHORIZED`. If `ADMIN_TOKEN` is unset, production returns `503 ADMIN_AUTH_NOT_CONFIGURED` (fail closed) while local development logs a warning and permits the call for demo convenience.
- **Rate Limiting:** Global rate limiting (`express-rate-limit`) limits clients to 300 requests per 15-minute window to mitigate denial-of-service attempts.
- **Idempotency Keys:** Every incident save enforces an `idempotency_key` preventing duplicate incident creation on client network timeouts or retries.
- **Input Hash Caching:** Identical text/file hashes are served from an in-memory SHA-256 cache, eliminating redundant model calls and reducing API exposure.

---

## 5. Privacy & Activity Logging Integrity

- **Zero PII Logging:** The internal `ActivityLogService` stores only sanitized operational action strings (e.g. `Incident inc-4f8a12 created (Critical)`).
- **No Upload Storage in Logs:** Neither personal caller names, phone numbers, raw emergency transcripts, nor binary file bytes are ever written to stdout or activity log records.

---

## 6. Demo Mode vs. Production Deployment Warnings

> [!WARNING]
> **Authentication Required for Production:** ResQ AI Demo Mode is designed for hackathon demonstration and local evaluation. It intentionally operates without an active authentication session to permit frictionless exploration of triage workflows.
>
> **Before deploying to any multi-user or operational production environment, the following must be implemented:**
> 1. Role-Based Access Control (RBAC) / OAuth2 authentication (e.g. Google Cloud Identity-Aware Proxy or Firebase Auth) for dispatch operators and analysts.
> 2. Ephemeral encrypted storage buckets (Google Cloud Storage with CMEK) for persistent scene photo storage instead of local disk.
> 3. Network egress lockdown and VPC Service Controls around Google Cloud Run and Vertex AI / Gemini endpoints.
