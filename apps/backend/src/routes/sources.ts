import { Router, Request, Response, NextFunction } from 'express';
import { GroundingVerificationService } from '../services/groundingVerification.js';
import { IIncidentRepository } from '../repository/types.js';
import { ActivityLogService } from '../services/activityLog.js';
import { AppError } from '../middleware/errorHandler.js';

export function createSourcesRouter(
  groundingService: GroundingVerificationService,
  repo: IIncidentRepository,
  activityLog: ActivityLogService
): Router {
  const router = Router();

  /**
   * GET /api/sources
   * Lists verified sources from records and official guidance by region
   */
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const allIncidents = await repo.find({}, { limit: 100 });
      const aggregatedSources = allIncidents.items.flatMap(i => i.sources || []);

      // Configurable regional trusted agencies guidance
      const regionalGuidance = {
        US: [
          { name: 'National Weather Service (NWS)', domain: 'weather.gov', jurisdiction: 'United States' },
          { name: 'Federal Emergency Management Agency (FEMA)', domain: 'fema.gov', jurisdiction: 'United States' },
          { name: 'USGS Earthquake & Volcano Hazards', domain: 'usgs.gov', jurisdiction: 'United States' }
        ],
        IN: [
          { name: 'National Disaster Management Authority (NDMA)', domain: 'ndma.gov.in', jurisdiction: 'India' },
          { name: 'India Meteorological Department (IMD)', domain: 'mausam.imd.gov.in', jurisdiction: 'India' },
          { name: 'Central Water Commission (CWC)', domain: 'cwc.gov.in', jurisdiction: 'India' }
        ],
        GLOBAL: [
          { name: 'World Meteorological Organization (WMO)', domain: 'wmo.int', jurisdiction: 'Global' },
          { name: 'UN Office for the Coordination of Humanitarian Affairs (OCHA)', domain: 'unocha.org', jurisdiction: 'Global' }
        ]
      };

      res.json({
        total_sources: aggregatedSources.length,
        sources: aggregatedSources,
        regional_guidance: regionalGuidance,
        service_configured: groundingService.isConfigured()
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/sources/verify
   * Triggers live search grounding verification for a claim and updates incident if incident_id is passed
   */
  router.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { claim, location, region, incident_id } = req.body;

      if (!claim) {
        throw new AppError(400, 'MISSING_CLAIM', 'A specific factual claim is required for search grounding verification.');
      }

      const result = await groundingService.verifyIncidentWithSearch(claim, location, region);

      if (incident_id) {
        const incident = await repo.findById(incident_id);
        if (incident) {
          const updatedSources = [...(incident.sources || []), ...result.sources];
          const newVerificationStatus = result.status === 'VERIFIED' ? 'VERIFIED' : incident.verification_status;
          await repo.update(incident_id, {
            sources: updatedSources,
            verification_status: newVerificationStatus
          });
        }
      }

      activityLog.log(
        'VERIFICATION_ATTEMPTED',
        `Verification checked for "${claim.slice(0, 50)}...": Status ${result.status}`,
        incident_id
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
