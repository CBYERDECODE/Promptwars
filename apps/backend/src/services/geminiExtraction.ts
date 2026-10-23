import { GoogleGenAI, Type } from '@google/genai';
import { 
  GeminiExtractionOutputSchema, 
  IncidentType, 
  Provenance 
} from '@resq-ai/shared';
import { config } from '../config.js';
import { z } from 'zod';

export type ExtractedIncidentData = z.infer<typeof GeminiExtractionOutputSchema>;

const STREET_SUFFIXES =
  'street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|highway|hwy|way|court|ct|place|pl|terrace|ter|circle|cir|square|sq|parkway|pkwy';

/**
 * Words that on their own are NOT a usable location (e.g. "on Highway" only).
 * Prevents a bare generic noun from being reported as a location.
 */
const GENERIC_LOCATION_WORDS = new Set([
  'highway',
  'road',
  'street',
  'bridge',
  'area',
  'distance',
  'roof',
  'home',
  'house',
  'somewhere',
  'everywhere',
  'nearby',
  'location',
  'scene',
  'site',
  'region',
  'zone',
  'sector',
  'side',
  'top',
  'bottom'
]);

export class GeminiExtractionService {
  private ai: GoogleGenAI | null = null;
  private modelName: string;

  constructor() {
    this.modelName = config.geminiModel;
    if (config.geminiApiKey) {
      this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
  }

  public isConfigured(): boolean {
    return this.ai !== null;
  }

  /**
   * Conservative, non-greedy location extraction for Simulated Demo Mode.
   *
   * Returns a plausible location string, or null when no RELIABLE location can be inferred.
   * Previously a greedy regex captured trailing sentence text (e.g.
   * "104 Main Street, water rising rapidly pas"); that is fixed here.
   */
  public static extractLocationPhrase(text: string): string | null {
    // 1) Structured street address: house number + street name + street suffix (bounded).
    const addressRegex = new RegExp(
      `\\b(\\d{1,6}\\s+[A-Za-z0-9'\\u2019\\-]+(?:\\s+[A-Za-z0-9'\\u2019\\-]+){0,3}\\s+(?:${STREET_SUFFIXES})\\b\\.?)`,
      'i'
    );
    const addressMatch = text.match(addressRegex);
    if (addressMatch) {
      return addressMatch[1].replace(/\s+/g, ' ').trim();
    }

    // 2) Prepositional proper-noun phrase. Each token must start with an uppercase letter and
    //    the phrase is bounded to <=4 tokens, so a lowercase sentence continuation
    //    ("... water rising rapidly") can never be captured.
    const prepRegex = /\b(?:at|near|on|in)\s+((?:[A-Z][A-Za-z0-9'\u2019.-]*)(?:\s+[A-Z][A-Za-z0-9'\u2019.-]*){0,3})/;
    const prepMatch = text.match(prepRegex);
    if (prepMatch) {
      const candidate = prepMatch[1].replace(/\s+/g, ' ').trim();
      const tokens = candidate.split(/\s+/);
      // Reject bare generic nouns ("Highway", "Roof") and phrases ending in a generic noun.
      if (tokens.length === 1 && GENERIC_LOCATION_WORDS.has(candidate.toLowerCase())) {
        return null;
      }
      if (GENERIC_LOCATION_WORDS.has(tokens[tokens.length - 1].toLowerCase())) {
        return null;
      }
      return candidate;
    }

    return null;
  }

  /**
   * Deterministic simulated analysis for explicit Demo Mode.
   * Clearly marked as Simulated.
   */
  public generateSimulatedExtraction(text: string, locationOverride?: string): ExtractedIncidentData {
    const lower = text.toLowerCase();
    let type: IncidentType = 'OTHER';
    let summary = text.slice(0, 200);
    const hazard_indicators: string[] = [];
    const access_constraints: string[] = [];
    const missing_information: string[] = [];
    const conflicting_information: string[] = [];
    const uncertainty_notes: string[] = [];
    let reported_location: string | null = locationOverride || null;

    let injuriesCount: number | null = null;
    let injuriesDesc: string | null = null;
    let riskCount: number | null = null;
    let riskDesc: string | null = null;

    if (lower.includes('flood') || lower.includes('water') || lower.includes('river')) {
      type = 'FLOOD';
      summary = 'Simulated Extraction: Localized flooding report indicating high water volume and drainage overflow.';
      hazard_indicators.push('Standing water exceeding safe transit depth', 'Drainage overflow');
      access_constraints.push('Surface road impassable for standard passenger vehicles');
      missing_information.push('Precise water crest depth measurement');
      uncertainty_notes.push('Simulated analysis based on demonstration scenario.');
      if (lower.includes('trapped')) {
        riskCount = 4;
        riskDesc = 'Four individuals reported awaiting assistance above water level';
      }
    } else if (lower.includes('fire') || lower.includes('smoke') || lower.includes('flame')) {
      type = 'FIRE';
      summary = 'Simulated Extraction: Structural fire alert with visible smoke plume and evacuation in progress.';
      hazard_indicators.push('Active combustion', 'Dense smoke plume');
      access_constraints.push('Staging perimeter required within 100m');
      missing_information.push('Confirmation of complete structure evacuation');
      uncertainty_notes.push('Simulated thermal assessment from demo prompt.');
      if (lower.includes('injur') || lower.includes('burn')) {
        injuriesCount = 1;
        injuriesDesc = 'Minor smoke inhalation reported';
      }
    } else if (lower.includes('road') || lower.includes('tree') || lower.includes('block') || lower.includes('slide')) {
      type = 'BLOCKED_ROAD';
      summary = 'Simulated Extraction: Roadway obstruction with traffic impediment and blocked access.';
      hazard_indicators.push('Physical carriageway obstruction');
      access_constraints.push('Lane closed, alternate routing required');
      missing_information.push('Heavy clearance equipment ETA');
    } else if (lower.includes('bridge') || lower.includes('collapse') || lower.includes('damage') || lower.includes('structure')) {
      type = 'INFRASTRUCTURE_DAMAGE';
      summary = 'Simulated Extraction: Structural degradation and compromised integrity reported.';
      hazard_indicators.push('Compromised structural support');
      access_constraints.push('Load limits suspended, structural evaluation required');
    }

    // Try to extract location if mentioned and not provided
    if (!reported_location) {
      reported_location = GeminiExtractionService.extractLocationPhrase(text);
    }

    if (!reported_location) {
      missing_information.push('Exact physical location / address is missing from the report.');
    }

    return {
      incident_type: type,
      summary,
      reported_location,
      hazard_indicators,
      people_at_risk: { estimated_count: riskCount, description: riskDesc },
      reported_injuries: { estimated_count: injuriesCount, description: injuriesDesc },
      access_constraints,
      reported_at: new Date().toISOString(),
      missing_information,
      conflicting_information,
      evidence_items: [
        {
          id: 'sim-ev-1',
          claim: summary,
          provenance: 'AI_INFERRED',
          confidence: 0.85,
          source_excerpt: text.slice(0, 150)
        }
      ],
      uncertainty_notes
    };
  }

  /**
   * Multimodal extraction with Gemini API.
   * Model output is untrusted data and strictly validated with Zod.
   */
  public async extractIncidentData(
    rawText: string,
    imageAttachment?: { buffer: Buffer; mimeType: string },
    locationOverride?: string
  ): Promise<ExtractedIncidentData> {
    if (!this.ai) {
      throw new Error('GEMINI_NOT_CONFIGURED: Gemini API key is not configured on the server.');
    }

    const systemPrompt = `You are ResQ AI, an evidence-aware emergency incident extraction engine for decision support.
Your task is to analyze messy emergency communications (witness reports, 911 calls, field observations, or photographs) and extract structured factual incident intelligence.

CRITICAL INSTRUCTIONS:
1. STRICT TRUTHFULNESS: Extract ONLY facts directly supported by the text or visible in the image. Never invent details, numbers, casualties, or addresses.
2. MISSING LOCATION: If an exact location or street is not provided in the report, "reported_location" MUST be null. Do not guess a city or street name.
3. PROVENANCE: Every evidence item must have a provenance tag:
   - "USER_REPORTED": directly stated by the reporting witness.
   - "AI_INFERRED": deduced through logical reasoning or image recognition.
4. UNCERTAINTIES & GAPS: Explicitly identify missing vital facts in "missing_information" (e.g. unknown injuries, missing address) and contradictory claims in "conflicting_information".
5. HAZARDS & ACCESS: List specific observable hazard indicators and physical access constraints (e.g. "bridge washed out", "high voltage line down").
6. Output JSON adhering strictly to the responseSchema provided.`;

    const userPromptContent = `--- BEGIN UNTRUSTED USER EMERGENCY REPORT ---
${rawText}
${locationOverride ? `(Explicit User Provided Location Override: ${locationOverride})` : ''}
--- END UNTRUSTED USER EMERGENCY REPORT ---

Extract structured incident intelligence from the report above according to your system guidelines.`;

    // Construct contents array with multimodal parts
    const parts: any[] = [];
    if (imageAttachment) {
      parts.push({
        inlineData: {
          data: imageAttachment.buffer.toString('base64'),
          mimeType: imageAttachment.mimeType
        }
      });
    }
    parts.push({ text: userPromptContent });

    const maxRetries = 2;
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('GEMINI_TIMEOUT: Request to Gemini API timed out after 60 seconds.')), 60000)
        );

        const generatePromise = this.ai.models.generateContent({
          model: this.modelName,
          contents: parts,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                incident_type: {
                  type: Type.STRING,
                  enum: [
                    'FLOOD',
                    'FIRE',
                    'INFRASTRUCTURE_DAMAGE',
                    'BLOCKED_ROAD',
                    'LANDSLIDE',
                    'MEDICAL_EMERGENCY',
                    'HAZARDOUS_MATERIAL',
                    'OTHER'
                  ]
                },
                summary: { type: Type.STRING },
                reported_location: { type: Type.STRING, nullable: true },
                hazard_indicators: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                people_at_risk: {
                  type: Type.OBJECT,
                  properties: {
                    estimated_count: { type: Type.INTEGER, nullable: true },
                    description: { type: Type.STRING, nullable: true }
                  }
                },
                reported_injuries: {
                  type: Type.OBJECT,
                  properties: {
                    estimated_count: { type: Type.INTEGER, nullable: true },
                    description: { type: Type.STRING, nullable: true }
                  }
                },
                access_constraints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                reported_at: { type: Type.STRING },
                missing_information: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                conflicting_information: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                evidence_items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      claim: { type: Type.STRING },
                      provenance: {
                        type: Type.STRING,
                        enum: ['USER_REPORTED', 'AI_INFERRED', 'VERIFIED', 'UNVERIFIED_OR_CONFLICTING']
                      },
                      confidence: { type: Type.NUMBER },
                      source_excerpt: { type: Type.STRING }
                    },
                    required: ['claim', 'provenance']
                  }
                },
                uncertainty_notes: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: [
                'incident_type',
                'summary',
                'hazard_indicators',
                'access_constraints',
                'missing_information',
                'conflicting_information'
              ]
            }
          }
        });

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        const responseText = response.text;

        if (!responseText) {
          throw new Error('GEMINI_MALFORMED_OUTPUT: Model returned empty response content.');
        }

        let parsedJson: any;
        try {
          parsedJson = JSON.parse(responseText);
        } catch (jsonErr) {
          throw new Error(`GEMINI_MALFORMED_OUTPUT: Could not parse response as JSON: ${jsonErr}`);
        }

        // Apply location override if user explicitly specified one
        if (locationOverride && (!parsedJson.reported_location || parsedJson.reported_location.trim().length === 0)) {
          parsedJson.reported_location = locationOverride;
        }

        // Strict Zod re-validation of untrusted model output
        const validationResult = GeminiExtractionOutputSchema.safeParse(parsedJson);
        if (!validationResult.success) {
          throw new Error(
            `GEMINI_SCHEMA_VALIDATION_FAILED: Model output failed schema validation: ${validationResult.error.message}`
          );
        }

        return validationResult.data;
      } catch (err: any) {
        lastError = err;
        attempt++;
        if (attempt <= maxRetries) {
          // Exponential backoff
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw new Error(`GEMINI_EXTRACTION_FAILED: ${lastError?.message || 'Unknown extraction error'}`);
  }
}
