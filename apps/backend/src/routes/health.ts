import { Router } from 'express';
import { GeminiExtractionService } from '../services/geminiExtraction.js';
import { IIncidentRepository } from '../repository/types.js';
import { config } from '../config.js';

export function createHealthRouter(
  geminiService: GeminiExtractionService,
  repo: IIncidentRepository
): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const totalCount = await repo.count();
    res.json({
      status: 'healthy',
      service: 'ResQ AI Emergency Decision Support Intelligence Engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      storage_type: config.storageType,
      gemini: {
        configured: geminiService.isConfigured(),
        model: config.geminiModel,
        status: geminiService.isConfigured() ? 'READY' : 'UNCONFIGURED (Demo Mode Active)'
      },
      google_maps: {
        configured: Boolean(config.googleMapsApiKey)
      },
      stats: {
        total_incidents_stored: totalCount
      }
    });
  });

  return router;
}
