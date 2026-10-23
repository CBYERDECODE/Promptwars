# ResQ AI REST API Reference

The ResQ AI Backend is built on Express + TypeScript with structured validation schemas and standardized JSON error responses.

---

## 1. Standard Error Format

All error responses adhere to the following schema:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable explanation of error.",
    "details": {},
    "timestamp": "2026-10-23T11:00:00.000Z"
  }
}
```

Stable Error Codes:
- `VALIDATION_ERROR` (HTTP 400) - Schema or parameter validation failed.
- `FILE_REJECTED` (HTTP 400) - File size exceeded or magic-byte signature spoofed.
- `NOT_FOUND` (HTTP 404) - Requested incident does not exist.
- `RATE_LIMIT_EXCEEDED` (HTTP 429) - Too many requests.
- `GEMINI_NOT_CONFIGURED` (HTTP 503) - Gemini API key unset while live mode requested.
- `GEMINI_BAD_OUTPUT` (HTTP 502) - Model returned invalid schema.
- `GEMINI_TIMEOUT` (HTTP 504) - API request timed out.

---

## 2. API Endpoints

### `GET /api/health`
Returns system status, active storage mode, Gemini model configuration, and incident count.
- **Response:**
  ```json
  {
    "status": "healthy",
    "service": "ResQ AI Emergency Decision Support Intelligence Engine",
    "version": "1.0.0",
    "gemini": {
      "configured": true,
      "model": "gemini-2.5-flash",
      "status": "READY"
    },
    "storage_type": "json",
    "stats": {
      "total_incidents_stored": 4
    }
  }
  ```

---

### `POST /api/incidents/analyze`
Extracts structured intelligence from multimodal emergency input (text and/or image).
- **Content-Type:** `multipart/form-data`
- **Fields:**
  - `text` (string, optional if attachment provided): Raw emergency caller description or notes.
  - `attachment` (binary file, optional): JPEG, PNG, WEBP, or PDF.
  - `location` (string, optional): Free-text location override.
  - `is_simulated` (boolean string): If `'true'`, runs deterministic demonstration extraction.
- **Response:**
  ```json
  {
    "extraction": {
      "incident_type": "FLOOD",
      "summary": "Rapid flash flooding at Senior Center...",
      "reported_location": "440 Riverfront Boulevard",
      "hazard_indicators": ["Rapidly rising water (>3ft)"],
      "people_at_risk": { "estimated_count": 14, "description": "stranded on balcony" },
      "reported_injuries": { "estimated_count": 1, "description": "mild hypothermia" },
      "access_constraints": ["Main river bridge impassable"],
      "missing_information": ["Generator fuel status"],
      "conflicting_information": [],
      "evidence_items": [
        {
          "id": "sim-ev-1",
          "claim": "Water level exceeds 3 feet inside main lobby",
          "provenance": "USER_REPORTED",
          "confidence": 0.95
        }
      ]
    },
    "suggested_priority": {
      "level": "Critical",
      "reasons": ["Direct life safety threat: 1 injury reported", "Imminent danger: ~14 at risk"],
      "disclaimer": "Suggested priority - decision support only. In immediate danger, contact local emergency services now."
    },
    "is_simulated": false
  }
  ```

---

### `GET /api/incidents`
Lists paginated incidents with search, filtering, and sorting.
- **Query Parameters:**
  - `page` (number, default: 1)
  - `limit` (number, default: 10)
  - `priority` (`Critical` | `High` | `Moderate` | `Low` | `Needs review`)
  - `incident_type` (`FLOOD` | `FIRE` | `BLOCKED_ROAD` | `INFRASTRUCTURE_DAMAGE` | ...)
  - `status` (`NEW` | `IN_REVIEW` | `TRIAGED` | `RESOLVED` | `FUSED`)
  - `search` (string)
  - `sortBy` (`created_at` | `priority`)
  - `sortOrder` (`asc` | `desc`)
  - `is_simulated` (boolean)

---

### `GET /api/incidents/:id`
Retrieves a single incident record by ID.

---

### `POST /api/incidents`
Saves an analyzed incident into the operational queue.
- **Body:**
  ```json
  {
    "extraction": { ... },
    "idempotency_key": "unique-client-uuid",
    "is_simulated": false,
    "reported_location_override": "Optional location"
  }
  ```
- **Idempotency Guarantee:** If an identical `idempotency_key` is submitted on network retry, the existing record is returned with HTTP 200 without creating a duplicate.

---

### `PATCH /api/incidents/:id`
Updates incident status or editable triage fields.
- **Body:** `{ "status": "TRIAGED" }`

---

### `GET /api/incidents/:id/report`
Generates an exportable incident action report.
- **Query Parameters:**
  - `format` (`markdown` or omitted for JSON)
- **Response (Markdown):** Downloadable Markdown with checklist and advisory recommendations explicitly labeled `[RECOMMENDED ADVICE - NOT EXECUTED]`.

---

### `POST /api/incidents/fusion/candidates`
Searches for candidate reports matching spatio-temporal, taxonomy, or address overlap.
- **Body:** `{ "incident_id": "demo-fl-001" }`

---

### `POST /api/incidents/fusion/preview`
Performs side-by-side diff between two candidates and identifies conflicting claims.
- **Body:** `{ "primary_id": "demo-fl-001", "secondary_id": "demo-conf-004" }`

---

### `POST /api/incidents/fusion/confirm`
Human operator confirmation to fuse two incidents.
- **Body:**
  ```json
  {
    "primary_id": "demo-fl-001",
    "secondary_id": "demo-conf-004",
    "resolution_notes": "Both callers describe the same drainage overflow."
  }
  ```
- **Audit Preservation:** Permanently embeds links to all original source records, raw timestamps, attachments, and conflicting claims in `original_reports`.

---

### `GET /api/sources`
Returns aggregated verified sources and configurable regional guidance lists (US / India / Global).

---

### `POST /api/sources/verify`
Triggers real-time Google Search grounding on a specific claim and location.
- **Body:**
  ```json
  {
    "claim": "Flood crest alert for Maplewood River",
    "location": "Maplewood Valley",
    "region": "GLOBAL"
  }
  ```

---

### `GET /api/activity`
Returns the recent privacy-preserving activity audit trail.

---

### `DELETE /api/activity`
Clears the activity audit trail. **Admin-protected:** requires `ADMIN_TOKEN` via `Authorization: Bearer <token>` or `X-Admin-Token: <token>` (`401 ADMIN_UNAUTHORIZED` if missing/incorrect; `503 ADMIN_AUTH_NOT_CONFIGURED` in production when no token is set).

---

### `POST /api/incidents/reset-demo`
Restores the default fictional demo incidents to initial state. **Admin-protected:** requires the same `ADMIN_TOKEN` header as `DELETE /api/activity`.
