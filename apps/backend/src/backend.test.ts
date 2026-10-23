import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { InMemoryIncidentRepository } from './repository/inMemoryRepository.js';
import { validateUploadedFile } from './utils/fileValidator.js';
import { evaluatePriority } from '@resq-ai/shared';
import { GeminiExtractionService } from './services/geminiExtraction.js';
import { GroundingVerificationService } from './services/groundingVerification.js';
import { assessLocationConfidence } from './utils/locationQuality.js';
import { config } from './config.js';

class MockUnconfiguredGeminiService extends GeminiExtractionService {
  public override isConfigured(): boolean {
    return false;
  }
  public override async extractIncidentData(): Promise<any> {
    throw new Error('GEMINI_NOT_CONFIGURED: Gemini API key is not configured on the server.');
  }
}

class MockUnconfiguredGroundingService extends GroundingVerificationService {
  public override isConfigured(): boolean {
    return false;
  }
  public override async verifyIncidentWithSearch(): Promise<any> {
    return {
      status: 'UNAVAILABLE',
      sources: [],
      verificationNote: 'Verification unavailable: Gemini API key is not configured.'
    };
  }
}

describe('ResQ AI Backend Test Suite (Section H Criteria)', () => {
  let app: any;
  let repo: InMemoryIncidentRepository;

  beforeEach(() => {
    repo = new InMemoryIncidentRepository();
    app = createApp(repo, new MockUnconfiguredGeminiService(), new MockUnconfiguredGroundingService());
  });

  // H.1: Valid text report -> structured fields (Simulated Demo analysis)
  it('H.1: valid text report yields structured extraction with provenance', async () => {
    const res = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Severe flash flooding near 104 Main Street, water rising 3 feet, trapped residents on roof')
      .field('is_simulated', 'true');

    expect(res.status).toBe(200);
    expect(res.body.extraction).toBeDefined();
    expect(res.body.extraction.incident_type).toBe('FLOOD');
    expect(res.body.extraction.hazard_indicators.length).toBeGreaterThan(0);
    expect(res.body.suggested_priority).toBeDefined();
    expect(res.body.suggested_priority.level).toBe('Critical');
    expect(res.body.provenance_summary.ai_inferred_count).toBeGreaterThanOrEqual(1);
  });

  // H.2: Valid image accepted
  it('H.2: valid image file with genuine magic bytes is accepted', async () => {
    // Valid 1x1 PNG magic bytes
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82
    ]);

    const res = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Blocked road due to landslide on Highway 101')
      .field('is_simulated', 'true')
      .attach('attachment', pngBuffer, { filename: 'landslide.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.extraction.incident_type).toBe('BLOCKED_ROAD');
  });

  // H.3: Unsupported / oversized / spoofed-signature files rejected
  it('H.3a: rejects unsupported executable/script files', async () => {
    const maliciousBuffer = Buffer.from('echo "malicious script";');
    const res = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Test emergency')
      .field('is_simulated', 'true')
      .attach('attachment', maliciousBuffer, { filename: 'script.sh', contentType: 'text/x-sh' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REJECTED');
  });

  it('H.3b: rejects spoofed magic byte signature (declaring image/png for text content)', async () => {
    const fakePng = Buffer.from('THIS IS NOT A PNG FILE BUT PLAINTEXT');
    const res = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Test emergency')
      .field('is_simulated', 'true')
      .attach('attachment', fakePng, { filename: 'fake.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REJECTED');
  });

  it('H.3c: unit validator rejects files exceeding max size', () => {
    const hugeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
    const check = validateUploadedFile(hugeBuffer, 'image/jpeg', 10 * 1024 * 1024);
    expect(check.valid).toBe(false);
    expect(check.error).toContain('exceeds the allowed limit');
  });

  // H.5: Without API key and when simulated is false, returns clear error and saves nothing
  it('H.5: unconfigured / failed Gemini call in live mode returns clean error and saves nothing', async () => {
    const initialCount = await repo.count();

    const res = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Live report without mock')
      .field('is_simulated', 'false');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GEMINI_NOT_CONFIGURED');

    const finalCount = await repo.count();
    expect(finalCount).toBe(initialCount); // Proves nothing saved
  });

  // H.6: Missing location stays null
  it('H.6: missing location stays null and forces "Needs review"', async () => {
    const res = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Structure fire with heavy smoke observed somewhere in distance')
      .field('is_simulated', 'true');

    expect(res.status).toBe(200);
    expect(res.body.extraction.reported_location).toBeNull();
    expect(res.body.suggested_priority.level).toBe('Needs review');
    expect(res.body.suggested_priority.reasons.some((r: string) => r.includes('location is missing'))).toBe(true);
  });

  // H.7: Unverified report never labelled verified
  it('H.7: newly reported incident has verification_status UNVERIFIED by default', async () => {
    const createRes = await request(app)
      .post('/api/incidents')
      .send({
        extraction: {
          incident_type: 'FLOOD',
          summary: 'Water level rising on 5th Street',
          reported_location: '5th Street and Market',
          hazard_indicators: ['rising water'],
          people_at_risk: { estimated_count: 2, description: null },
          reported_injuries: { estimated_count: 0, description: null },
          access_constraints: [],
          reported_at: new Date().toISOString(),
          missing_information: [],
          conflicting_information: [],
          evidence_items: [
            {
              id: 'ev-1',
              claim: 'Water level rising on 5th Street',
              provenance: 'USER_REPORTED',
              confidence: 0.9
            }
          ],
          uncertainty_notes: []
        },
        is_simulated: true
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.verification_status).toBe('UNVERIFIED');
    expect(createRes.body.sources).toEqual([]);
  });

  // H.8: Critical danger indicators -> expected priority with reasons
  it('H.8: deterministic priority assigns Critical with reasons for direct casualties', () => {
    const evalResult = evaluatePriority({
      incident_type: 'FLOOD',
      hazard_indicators: ['swift water current', 'trapped residents on roof'],
      people_at_risk: { estimated_count: 6, description: 'seniors on balcony' },
      reported_injuries: { estimated_count: 2, description: 'trauma and hypothermia' },
      access_constraints: ['bridge submerged'],
      missing_information: [],
      conflicting_information: [],
      reported_location: '900 River Road'
    });

    expect(evalResult.level).toBe('Critical');
    expect(evalResult.reasons.length).toBeGreaterThanOrEqual(2);
    expect(evalResult.reasons.some(r => r.includes('Direct life safety threat'))).toBe(true);
  });

  // H.9: Conflicts remain visible
  it('H.9: conflicting statements remain visible and force "Needs review"', () => {
    const evalResult = evaluatePriority({
      incident_type: 'FIRE',
      hazard_indicators: ['smoke'],
      people_at_risk: { estimated_count: null, description: null },
      reported_injuries: { estimated_count: null, description: null },
      access_constraints: [],
      missing_information: [],
      conflicting_information: ['Caller 1 says building is fully evacuated', 'Caller 2 says 3 people are inside'],
      reported_location: '123 Oak Ave'
    });

    expect(evalResult.level).toBe('Needs review');
    expect(evalResult.reasons[0]).toContain('conflicting statement');
  });

  // H.10 & H.11: Fusion requires confirmation & preserves original report links
  it('H.10 & H.11: fusion preview detects candidates and confirmation preserves original reports', async () => {
    // 1. Candidate lookup
    const candRes = await request(app)
      .post('/api/incidents/fusion/candidates')
      .send({ incident_id: 'demo-fl-001' });

    expect(candRes.status).toBe(200);

    // 2. Fusion Preview
    const prevRes = await request(app)
      .post('/api/incidents/fusion/preview')
      .send({ primary_id: 'demo-fl-001', secondary_id: 'demo-conf-004' });

    expect(prevRes.status).toBe(200);
    expect(prevRes.body.suggested_merged_summary).toBeDefined();

    // 3. Fusion Confirm (Human action)
    const confRes = await request(app)
      .post('/api/incidents/fusion/confirm')
      .send({
        primary_id: 'demo-fl-001',
        secondary_id: 'demo-conf-004',
        resolution_notes: 'Confirmed same municipal drainage basin'
      });

    expect(confRes.status).toBe(200);
    expect(confRes.body.is_fused).toBe(true);
    expect(confRes.body.merged_incident_ids).toContain('demo-fl-001');
    expect(confRes.body.merged_incident_ids).toContain('demo-conf-004');
    expect(confRes.body.original_reports.length).toBe(2); // Preserves originals!

    // Verify secondary status is updated to FUSED
    const secondaryRecord = await repo.findById('demo-conf-004');
    expect(secondaryRecord?.status).toBe('FUSED');
  });

  // H.11b: Repeating the SAME fusion must be rejected and must never corrupt the merged record
  it('H.11b: repeating the same fusion is rejected (409) and never duplicates summary/evidence/conflicts', async () => {
    const payload = {
      primary_id: 'demo-fl-001',
      secondary_id: 'demo-conf-004',
      resolution_notes: 'Confirmed same municipal drainage basin'
    };

    const first = await request(app).post('/api/incidents/fusion/confirm').send(payload);
    expect(first.status).toBe(200);
    expect(first.body.is_fused).toBe(true);

    // Snapshot the merged record after the first, successful fusion
    const afterFirst = await repo.findById('demo-fl-001');
    const summaryAfterFirst = afterFirst!.summary;
    const evidenceCount = afterFirst!.evidence_items.length;
    const conflictsCount = afterFirst!.conflicting_information.length;
    const originalsCount = (afterFirst!.original_reports || []).length;
    const mergedIdsCount = (afterFirst!.merged_incident_ids || []).length;

    // Second identical confirmation must be rejected by the idempotency barrier
    const second = await request(app).post('/api/incidents/fusion/confirm').send(payload);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('FUSION_ALREADY_PERFORMED');

    // Stored data must be unchanged: no duplicated prefix, evidence, conflicts, originals, or merged IDs
    const afterSecond = await repo.findById('demo-fl-001');
    expect(afterSecond!.summary).toBe(summaryAfterFirst);
    expect((afterSecond!.summary.match(/\[FUSED INCIDENT\]/g) || []).length).toBe(1);
    expect(afterSecond!.evidence_items.length).toBe(evidenceCount);
    expect(afterSecond!.conflicting_information.length).toBe(conflictsCount);
    expect((afterSecond!.original_reports || []).length).toBe(originalsCount);
    expect((afterSecond!.merged_incident_ids || []).length).toBe(mergedIdsCount);

    // Secondary must remain FUSED and must not have been mutated into a duplicate master
    const secondaryAfter = await repo.findById('demo-conf-004');
    expect(secondaryAfter?.status).toBe('FUSED');
    expect(secondaryAfter?.is_fused).toBeFalsy();
  });

  // H.11c: Fusing an incident with itself is rejected without changing data
  it('H.11c: fusing an incident with an identical ID is rejected (400) without changing data', async () => {
    const before = await repo.findById('demo-fl-001');

    const res = await request(app)
      .post('/api/incidents/fusion/confirm')
      .send({ primary_id: 'demo-fl-001', secondary_id: 'demo-fl-001' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FUSION_INVALID_PAIR');

    const after = await repo.findById('demo-fl-001');
    expect(after!.is_fused).toBeFalsy();
    expect(after!.summary).toBe(before!.summary);
  });

  // H.11d: Re-fusing an already-fused pair in reverse order is rejected (duplicate pair)
  it('H.11d: re-fusing an already-fused pair in reverse order is rejected (409)', async () => {
    const first = await request(app)
      .post('/api/incidents/fusion/confirm')
      .send({ primary_id: 'demo-fl-001', secondary_id: 'demo-conf-004' });
    expect(first.status).toBe(200);

    const reversed = await request(app)
      .post('/api/incidents/fusion/confirm')
      .send({ primary_id: 'demo-conf-004', secondary_id: 'demo-fl-001' });

    expect(reversed.status).toBe(409);
    expect(reversed.body.error.code).toBe('FUSION_ALREADY_PERFORMED');
  });

  // H.11e: Fusing non-existent incidents returns a clean 404 (no 500 / no data mutation)
  it('H.11e: fusing an unknown incident returns a clean 404', async () => {
    const res = await request(app)
      .post('/api/incidents/fusion/confirm')
      .send({ primary_id: 'demo-fl-001', secondary_id: 'does-not-exist' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FUSION_NOT_FOUND');
  });

  // H.12: Export is valid JSON and Markdown
  it('H.12: incident report export returns structured JSON and downloadable Markdown', async () => {
    const jsonRes = await request(app).get('/api/incidents/demo-fl-001/report');
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.body.checklist.length).toBeGreaterThan(0);
    expect(jsonRes.body.recommendations.length).toBeGreaterThan(0);
    expect(jsonRes.body.recommendations[0].is_executed_action).toBe(false);

    const mdRes = await request(app).get('/api/incidents/demo-fl-001/report?format=markdown');
    expect(mdRes.status).toBe(200);
    expect(mdRes.headers['content-type']).toContain('text/markdown');
    expect(mdRes.text).toContain('# RESQ AI INCIDENT ACTION REPORT');
    expect(mdRes.text).toContain('RECOMMENDED ADVICE - NOT EXECUTED');
  });

  // H.15: Grounding with no metadata yields "Verification unavailable"
  it('H.15: sources verification with unconfigured key returns Verification unavailable', async () => {
    const res = await request(app)
      .post('/api/sources/verify')
      .send({
        claim: 'Flash flood warning issued for sector 4',
        location: 'Sector 4 Riverfront'
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UNAVAILABLE');
    expect(res.body.verificationNote).toContain('Verification unavailable');
  });

  // H.16: Retries never duplicate incidents (Idempotency key)
  it('H.16: retried POST /api/incidents with identical idempotency_key returns original record without duplicating', async () => {
    const idempotencyKey = 'req-unique-token-12345';
    const payload = {
      idempotency_key: idempotencyKey,
      extraction: {
        incident_type: 'FIRE',
        summary: 'Grass fire near railroad tracks',
        reported_location: 'Mile 20 Track Road',
        hazard_indicators: ['open flames'],
        people_at_risk: { estimated_count: 0, description: null },
        reported_injuries: { estimated_count: 0, description: null },
        access_constraints: [],
        reported_at: new Date().toISOString(),
        missing_information: [],
        conflicting_information: [],
        evidence_items: [],
        uncertainty_notes: []
      },
      is_simulated: true
    };

    const firstRes = await request(app).post('/api/incidents').send(payload);
    expect(firstRes.status).toBe(201);
    const incidentId = firstRes.body.id;

    // Retry request with same token
    const retryRes = await request(app).post('/api/incidents').send(payload);
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.id).toBe(incidentId); // Same ID, not a duplicate!
  });

  // H.17: CORS accepts only explicitly allowed origins (no wildcard fallback)
  it('H.17: CORS rejects unlisted origins and allows documented local-dev origins', async () => {
    const denied = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('CORS_ORIGIN_DENIED');

    const allowed = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const vercelAllowed = await request(app)
      .get('/api/health')
      .set('Origin', 'https://promptwars-xlkh-11o48x4nd-cbyerdecodes-projects.vercel.app');

    expect(vercelAllowed.status).toBe(200);
    expect(vercelAllowed.headers['access-control-allow-origin']).toBe('https://promptwars-xlkh-11o48x4nd-cbyerdecodes-projects.vercel.app');
  });

  // H.18: Destructive administrative endpoints require server-side authorization
  it('H.18: reset-demo and activity purge require a valid ADMIN_TOKEN when configured', async () => {
    const originalToken = config.adminToken;
    try {
      config.adminToken = 'super-secret-admin-token';

      const resetDenied = await request(app).post('/api/incidents/reset-demo');
      expect(resetDenied.status).toBe(401);
      expect(resetDenied.body.error.code).toBe('ADMIN_UNAUTHORIZED');

      const resetWrong = await request(app)
        .post('/api/incidents/reset-demo')
        .set('x-admin-token', 'wrong-token');
      expect(resetWrong.status).toBe(401);

      const purgeDenied = await request(app).delete('/api/activity');
      expect(purgeDenied.status).toBe(401);
      expect(purgeDenied.body.error.code).toBe('ADMIN_UNAUTHORIZED');

      const resetAllowed = await request(app)
        .post('/api/incidents/reset-demo')
        .set('Authorization', 'Bearer super-secret-admin-token');
      expect(resetAllowed.status).toBe(200);

      const purgeAllowed = await request(app)
        .delete('/api/activity')
        .set('Authorization', 'Bearer super-secret-admin-token');
      expect(purgeAllowed.status).toBe(200);
    } finally {
      config.adminToken = originalToken;
    }
  });

  it('H.18b: destructive endpoints fail closed (503) in production without an ADMIN_TOKEN', async () => {
    const originalToken = config.adminToken;
    const originalEnv = config.nodeEnv;
    try {
      config.adminToken = null;
      config.nodeEnv = 'production';

      const res = await request(app).post('/api/incidents/reset-demo');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('ADMIN_AUTH_NOT_CONFIGURED');
    } finally {
      config.adminToken = originalToken;
      config.nodeEnv = originalEnv;
    }
  });

  // H.19: Simulated location extraction is non-greedy and never captures sentence text
  it('H.19: simulated location extraction is non-greedy and returns null when unreliable', async () => {
    const res = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Severe flash flooding near 104 Main Street, water rising rapidly past 3 feet, trapped residents on roof')
      .field('is_simulated', 'true');

    expect(res.status).toBe(200);
    expect(res.body.extraction.reported_location).toBe('104 Main Street');
    expect(res.body.extraction.reported_location).not.toContain('water rising');

    const vague = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Structure fire reported somewhere nearby with heavy smoke visible')
      .field('is_simulated', 'true');

    expect(vague.status).toBe(200);
    expect(vague.body.extraction.reported_location).toBeNull();
    expect(vague.body.normalized_location).toBeNull();
  });

  // H.20: Location confidence is structural — never assigned HIGH merely because a string is long
  it('H.20: location confidence is structural and never inferred from string length', async () => {
    expect(assessLocationConfidence('104 Main Street')).toBe('HIGH');
    expect(assessLocationConfidence('440 Riverfront Boulevard, Maplewood Valley')).toBe('HIGH');
    expect(assessLocationConfidence('A very very long description of the general area near the river bank')).toBe('LOW');
    expect(assessLocationConfidence(null)).toBe('LOW');

    const res = await request(app)
      .post('/api/incidents/analyze')
      .field('text', 'Localized flooding in the area')
      .field('location', 'A very very long description of the general area near the river bank')
      .field('is_simulated', 'true');

    expect(res.status).toBe(200);
    expect(res.body.normalized_location.confidence).toBe('LOW');
  });

  // H.21: reported_at is validated and safely defaulted end-to-end
  it('H.21: incident creation replaces an empty reported_at with a valid timestamp', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .send({
        extraction: {
          incident_type: 'FLOOD',
          summary: 'Valid summary text used to exercise reported_at defaulting',
          reported_location: '5th Street and Market',
          hazard_indicators: ['rising water'],
          people_at_risk: { estimated_count: 0, description: null },
          reported_injuries: { estimated_count: 0, description: null },
          access_constraints: [],
          reported_at: '',
          missing_information: [],
          conflicting_information: [],
          evidence_items: [],
          uncertainty_notes: []
        },
        is_simulated: true
      });

    expect(res.status).toBe(201);
    expect(typeof res.body.reported_at).toBe('string');
    expect(res.body.reported_at.trim().length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(res.body.reported_at))).toBe(false);
  });
});
