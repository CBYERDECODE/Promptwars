import { GoogleGenAI } from '@google/genai';
import { VerificationSource } from '@resq-ai/shared';
import { config } from '../config.js';

export interface GroundingVerificationResult {
  status: 'VERIFIED' | 'UNVERIFIED' | 'UNAVAILABLE' | 'CONFLICTING';
  sources: VerificationSource[];
  verificationNote: string;
}

export class GroundingVerificationService {
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
   * Performs real-time Google Search grounding to verify emergency incident claims against official sources.
   * As per requirements: SEPARATE call from extraction.
   * If metadata is absent or unconfigured, returns "Verification unavailable".
   */
  public async verifyIncidentWithSearch(
    claim: string,
    location: string | null,
    region: 'US' | 'IN' | 'GLOBAL' = 'GLOBAL'
  ): Promise<GroundingVerificationResult> {
    if (!this.ai) {
      return {
        status: 'UNAVAILABLE',
        sources: [],
        verificationNote: 'Verification unavailable: Gemini API key is not configured.'
      };
    }

    const regionalGuidance = 
      region === 'IN'
        ? 'Prioritize official Indian meteorological and disaster management authorities (NDMA, IMD, CWC, State Disaster Management Authorities).'
        : region === 'US'
        ? 'Prioritize official US meteorological and emergency management authorities (NWS, NOAA, USGS, FEMA, local county emergency management).'
        : 'Prioritize official meteorological services, civil defense, or emergency government agencies.';

    const prompt = `Search for official meteorological, hydrological, emergency, or geological advisories to verify this reported event:
Event Claim: "${claim}"
Location: "${location || 'Unspecified location'}"

Guidance: ${regionalGuidance}
Provide a concise factual summary citing any confirmed official bulletin. If no official advisory exists for this specific claim, state clearly that no matching official warning was found.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      const candidate = response.candidates?.[0];
      const groundingMetadata = candidate?.groundingMetadata;

      // STRICT HONESTY RULE:
      // If metadata is absent, record nothing and show "Verification unavailable"
      if (!groundingMetadata || !groundingMetadata.groundingChunks || groundingMetadata.groundingChunks.length === 0) {
        return {
          status: 'UNAVAILABLE',
          sources: [],
          verificationNote: 'Verification unavailable: No search grounding metadata was returned by the provider.'
        };
      }

      const sources: VerificationSource[] = [];
      const timestamp = new Date().toISOString();

      for (const chunk of groundingMetadata.groundingChunks) {
        const web = (chunk as any).web;
        if (web && web.uri) {
          let domain = 'unknown';
          try {
            domain = new URL(web.uri).hostname;
          } catch {
            domain = web.uri;
          }

          sources.push({
            source_name: web.title || domain,
            source_url: web.uri,
            retrieval_timestamp: timestamp,
            excerpt: response.text ? response.text.slice(0, 200) : 'Grounding chunk match',
            claim_supported: claim,
            domain
          });
        }
      }

      if (sources.length === 0) {
        return {
          status: 'UNAVAILABLE',
          sources: [],
          verificationNote: 'Verification unavailable: No verified web sources returned in grounding metadata.'
        };
      }

      // Check whether official domain or general confirmation
      const isOfficialDomain = sources.some(s => 
        s.domain.endsWith('.gov') || 
        s.domain.endsWith('.gov.in') || 
        s.domain.endsWith('.org') ||
        s.domain.includes('weather') ||
        s.domain.includes('imd') ||
        s.domain.includes('ndma') ||
        s.domain.includes('fema')
      );

      return {
        status: isOfficialDomain ? 'VERIFIED' : 'UNVERIFIED',
        sources,
        verificationNote: isOfficialDomain 
          ? `Verified against ${sources.length} external source(s) including official agencies.`
          : `Retrieved ${sources.length} external source(s). Note: general web mentions do not constitute official emergency dispatch verification.`
      };
    } catch (err: any) {
      // SECURITY: never return raw upstream provider error text to clients.
      // Log safe diagnostics server-side only (no API keys, no request bodies).
      console.error('[GROUNDING_VERIFICATION_ERROR] External search verification failed:', {
        name: err?.name,
        status: err?.status ?? err?.code,
        message: err?.message
      });
      return {
        status: 'UNAVAILABLE',
        sources: [],
        verificationNote: 'Verification unavailable: External search request failed. Please try again later.'
      };
    }
  }
}
