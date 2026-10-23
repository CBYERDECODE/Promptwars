# ResQ AI: Hackathon Demonstration Script (3-Minute Walkthrough)

This script provides an exact step-by-step walkthrough for hackathon judges to experience ResQ AI's capabilities in either **Simulated Demo Mode** (zero credentials needed) or **Live AI Mode** (with `GEMINI_API_KEY`).

---

## ⏱️ Minute 0:00 - 0:30: The Societal Problem & Value Proposition

> *"During natural disasters and urban emergencies, emergency operations centers are overwhelmed not by a lack of information, but by an avalanche of noisy, unstructured dispatches—panicked caller transcripts, conflicting witness descriptions, and blurry scene photos. 
> ResQ AI does not replace emergency dispatchers. It provides decision support by converting chaotic reports into structured, evidence-aware records with deterministic, explainable prioritization and multi-report Incident Fusion."*

### Key Visuals to Highlight:
1. **Header Brand & Wordmark:** Notice the custom beacon shield and live status indicator.
2. **Persistent Warning Banner:** Notice the prominent warning: *"In immediate danger, contact local emergency services now. Do not wait for AI analysis."* Click **"Emergency Contacts"** to show official hotlines for US (911), India (112), and Europe.

---

## ⏱️ Minute 0:30 - 1:15: Ingesting a Messy Report & Extraction

1. Click **"Report Incident"** in the sidebar.
2. Under **"One-Click Demo Scenarios"**, click **"🌊 Flash Flood"**.
   - Notice the text box populates with a panicked, unstructured caller report: *"Severe flash flooding near 104 Main Street, water rising rapidly past 3 feet! Elderly resident trapped on ground floor porch..."*
   - Mention the optional **Voice Dictation** button (uses browser Web Speech API when supported).
3. Click **"Analyze on Demand"**.
4. **Inspect the Output:**
   - **Classification:** Automatically classified as `FLOOD`.
   - **Deterministic Priority:** Assigned `Critical`.
   - **Explainability:** Look at the deterministic rule reasons:
     - *Direct life safety threat: 1 injury reported.*
     - *Imminent danger: ~14 people reported at risk.*
     - *Severe hazard present (FLOOD) with critical indicators: Rapidly rising water (>3ft).*
   - **Evidence Provenance:** Point out the badge `USER_REPORTED` with the icon and text.
5. Click **"Save Incident to Queue"**.

---

## ⏱️ Minute 1:15 - 2:00: Queue Triage & Action Report Export

1. Navigate to **"Incident Queue"**.
2. Point out the triaged records sorted by priority. Filter by `Critical` or search for *"Maplewood"*.
3. Click on **`demo-fl-001`** (Maplewood Valley Senior Center) to open the accessible **Incident Detail Drawer**.
4. **Tab 1 - Intelligence Overview:** Review the structured casualty estimates, hazard indicators, and access constraints (*"Main river bridge impassable"*).
5. **Tab 2 - Evidence & Provenance:**
   - Note the distinct badges: `USER_REPORTED` vs `VERIFIED`.
   - Point out that general official warnings never fabricate specific caller verification.
6. **Tab 3 - Export Action Report:**
   - Review the **Operational Decision Checklist** with assigned roles (Incident Commander, EMS Coordinator).
   - Point out the section: `[RECOMMENDED ADVICE - NOT EXECUTED]` — demonstrating ethical AI boundaries where advice is visibly distinct from executed operations.
   - Click **"Copy Markdown"** (toast confirms copy) or click **"Download .MD"**.

---

## ⏱️ Minute 2:00 - 2:45: Incident Fusion (The Differentiator)

1. Click **"Incident Fusion"** in the sidebar.
2. Select **`demo-fl-001`** as the Anchor Incident.
3. Observe the candidate card detected by spatio-temporal and taxonomy signals: **`demo-conf-004`** (Willow Creek flood report).
4. Click **"Compare Side-by-Side"**.
5. **Review the Conflict Analysis:**
   - Notice the explicit highlight: **"Field Discrepancies: Caller A says water is 4ft high; Caller B says street is bone-dry."**
   - Read the AI assessment: explains correlation without overriding facts.
6. In **Human Resolution Notes**, type: *"Confirmed both calls belong to the same drainage basin; dispatched scout unit to resolve dry street discrepancy."*
7. Click **"Confirm & Fuse Reports"**.
8. Notice the system marks the incident as `FUSED`, permanently retains the original dispatches, and creates a unified master intelligence record.

---

## ⏱️ Minute 2:45 - 3:00: Grounding Verification & Reset

1. Click **"Verified Sources"** in the sidebar.
2. Point out the regional guidance table (NDMA, IMD, CWC for India; NWS, FEMA for the US).
3. Test a live search grounding verification or observe the fallback: *"Verification unavailable"* when unconfigured.
4. Go to **"Settings"** and click **"Reset Default Demo Incidents"** to restore pristine initial conditions.
