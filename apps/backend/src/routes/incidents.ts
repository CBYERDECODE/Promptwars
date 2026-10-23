import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { 
  IncidentCreateInputSchema, 
  IncidentPatchSchema, 
  FusionPreviewRequestSchema, 
  FusionConfirmRequestSchema,
  evaluatePriority, 
  IncidentRecord,
  NormalizedLocation
} from '@resq-ai/shared';
import { IIncidentRepository } from '../repository/types.js';
import { GeminiExtractionService } from '../services/geminiExtraction.js';
import { ReportGeneratorService } from '../services/reportGenerator.js';
import { FusionService } from '../services/fusionService.js';
import { ActivityLogService } from '../services/activityLog.js';
import { HashCache } from '../utils/hashCache.js';
import { IdempotencyManager } from '../utils/idempotency.js';
import { validateUploadedFile } from '../utils/fileValidator.js';
import { assessLocationConfidence } from '../utils/locationQuality.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { config } from '../config.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadSizeBytes
  }
});

export function createIncidentsRouter(
  repo: IIncidentRepository,
  geminiService: GeminiExtractionService,
  reportGenerator: ReportGeneratorService,
  fusionService: FusionService,
  activityLog: ActivityLogService,
  hashCache: HashCache<any>,
  idempotencyManager: IdempotencyManager
): Router {
  const router = Router();

  /**
   * POST /api/incidents/analyze
   * Multimodal extraction -> Deterministic priority engine -> Preview with provenance.
   * Model output is untrusted and strictly re-validated with Zod.
   */
  router.post('/analyze', upload.single('attachment'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawText = (req.body.text || '').trim();
      const locationOverride = req.body.location ? req.body.location.trim() : undefined;
      const isSimulated = req.body.is_simulated === 'true' || req.body.is_simulated === true;
      const file = req.file;

      if (!rawText && !file) {
        throw new AppError(400, 'EMPTY_INPUT', 'Please provide an emergency text report or an image attachment.');
      }

      let validatedAttachment: { buffer: Buffer; mimeType: string; filename: string } | undefined;

      if (file) {
        const fileCheck = validateUploadedFile(file.buffer, file.mimetype, config.maxUploadSizeBytes);
        if (!fileCheck.valid) {
          throw new AppError(400, 'FILE_REJECTED', fileCheck.error || 'Invalid file uploaded.');
        }
        validatedAttachment = {
          buffer: file.buffer,
          mimeType: fileCheck.detectedMimeType || file.mimetype,
          filename: file.originalname || 'upload'
        };
      }

      // Check Hash Cache to avoid repeated Gemini calls for identical inputs
      const cacheKey = hashCache.computeKey(rawText + (locationOverride || '') + (isSimulated ? '_sim' : '_live'), file?.buffer);
      const cachedResult = hashCache.get(cacheKey);
      if (cachedResult) {
        res.json({
          ...cachedResult,
          _cached: true
        });
        return;
      }

      let extractedData: any;

      // Handle Simulated Demo Mode vs Real Gemini Extraction
      if (isSimulated || !geminiService.isConfigured()) {
        if (!isSimulated && !geminiService.isConfigured()) {
          throw new AppError(
            503,
            'GEMINI_NOT_CONFIGURED',
            'Gemini API key is not configured. Please switch to Demo Mode to test with simulated incidents.'
          );
        }
        extractedData = geminiService.generateSimulatedExtraction(rawText || 'Emergency photo analysis', locationOverride);
      } else {
        extractedData = await geminiService.extractIncidentData(
          rawText,
          validatedAttachment ? { buffer: validatedAttachment.buffer, mimeType: validatedAttachment.mimeType } : undefined,
          locationOverride
        );
      }

      // Deterministic Priority Engine computation (pure function, model cannot dictate priority)
      const priority = evaluatePriority({
        incident_type: extractedData.incident_type,
        hazard_indicators: extractedData.hazard_indicators,
        people_at_risk: extractedData.people_at_risk,
        reported_injuries: extractedData.reported_injuries,
        access_constraints: extractedData.access_constraints,
        missing_information: extractedData.missing_information,
        conflicting_information: extractedData.conflicting_information,
        reported_location: extractedData.reported_location
      });

      // Simple normalized location structure.
      // Confidence is derived from the STRUCTURE of the location, never from its length.
      let normalizedLocation: NormalizedLocation | null = null;
      if (extractedData.reported_location && extractedData.reported_location.trim().length > 0) {
        normalizedLocation = {
          formatted_address: extractedData.reported_location,
          confidence: assessLocationConfidence(extractedData.reported_location)
        };
      }

      const responsePayload = {
        extraction: extractedData,
        normalized_location: normalizedLocation,
        suggested_priority: priority,
        is_simulated: isSimulated,
        provenance_summary: {
          user_reported_count: extractedData.evidence_items.filter((e: any) => e.provenance === 'USER_REPORTED').length,
          ai_inferred_count: extractedData.evidence_items.filter((e: any) => e.provenance === 'AI_INFERRED').length,
          conflicts_count: extractedData.conflicting_information.length
        }
      };

      hashCache.set(cacheKey, responsePayload);

      activityLog.log(
        'INCIDENT_ANALYZED',
        `Analyzed report classified as ${extractedData.incident_type} (${priority.level} priority)${isSimulated ? ' [Simulated]' : ''}`
      );

      res.json(responsePayload);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/incidents
   * Paginated list with filtering and sorting
   */
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '10', 10);
      const status = req.query.status as any;
      const incident_type = req.query.incident_type as any;
      const priority = req.query.priority as any;
      const searchQuery = req.query.search as string;
      const sortBy = (req.query.sortBy as any) || 'created_at';
      const sortOrder = (req.query.sortOrder as any) || 'desc';
      const is_simulated = req.query.is_simulated !== undefined ? req.query.is_simulated === 'true' : undefined;

      const result = await repo.find(
        { status, incident_type, priority, searchQuery, is_simulated },
        { page, limit, sortBy, sortOrder }
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/incidents/:id
   */
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const incident = await repo.findById(incidentId);
      if (!incident) {
        throw new AppError(404, 'NOT_FOUND', `Incident with ID "${incidentId}" was not found.`);
      }
      res.json(incident);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/incidents
   * Saves confirmed incident record.
   * Enforces idempotency key to prevent duplicate creation on network retries.
   */
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedBody = IncidentCreateInputSchema.parse(req.body);
      const idempotencyKey = parsedBody.idempotency_key || (req.headers['idempotency-key'] as string);

      // Check Idempotency Key
      if (idempotencyKey) {
        const existing = idempotencyManager.get(idempotencyKey);
        if (existing) {
          res.status(200).json(existing);
          return;
        }
      }

      const extraction = parsedBody.extraction;
      const reportedLocation = parsedBody.reported_location_override || extraction.reported_location;

      // Deterministic priority evaluation
      const priority = evaluatePriority({
        incident_type: extraction.incident_type,
        hazard_indicators: extraction.hazard_indicators,
        people_at_risk: extraction.people_at_risk,
        reported_injuries: extraction.reported_injuries,
        access_constraints: extraction.access_constraints,
        missing_information: extraction.missing_information,
        conflicting_information: extraction.conflicting_information,
        reported_location: reportedLocation
      });

      const newId = (parsedBody.is_simulated ? 'sim-' : 'inc-') + crypto.randomUUID().substring(0, 8);
      const now = new Date().toISOString();

      const newRecord: IncidentRecord = {
        id: newId,
        incident_type: extraction.incident_type,
        summary: extraction.summary,
        reported_location: reportedLocation,
        normalized_location: reportedLocation && reportedLocation.trim().length > 0
          ? { formatted_address: reportedLocation, confidence: assessLocationConfidence(reportedLocation) }
          : null,
        hazard_indicators: extraction.hazard_indicators,
        people_at_risk: extraction.people_at_risk,
        reported_injuries: extraction.reported_injuries,
        access_constraints: extraction.access_constraints,
        reported_at: extraction.reported_at || now,
        missing_information: extraction.missing_information,
        conflicting_information: extraction.conflicting_information,
        evidence_items: extraction.evidence_items,
        uncertainty_notes: extraction.uncertainty_notes,
        priority,
        status: 'NEW',
        created_at: now,
        updated_at: now,
        source_channel: parsedBody.source_channel,
        is_simulated: parsedBody.is_simulated,
        attachments: [],
        verification_status: 'UNVERIFIED',
        sources: []
      };

      const saved = await repo.create(newRecord);

      if (idempotencyKey) {
        idempotencyManager.set(idempotencyKey, saved);
      }

      activityLog.log('INCIDENT_CREATED', `Incident ${saved.id} created (${saved.priority.level})`, saved.id);

      res.status(201).json(saved);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/incidents/:id
   * Updates status or fields
   */
  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const parsedUpdates = IncidentPatchSchema.parse(req.body);
      const existing = await repo.findById(incidentId);
      if (!existing) {
        throw new AppError(404, 'NOT_FOUND', `Incident with ID "${incidentId}" was not found.`);
      }

      const updated = await repo.update(incidentId, parsedUpdates);
      activityLog.log(
        'STATUS_UPDATED',
        `Incident ${incidentId} updated${parsedUpdates.status ? ` (Status: ${parsedUpdates.status})` : ''}`,
        incidentId
      );

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/incidents/:id/report
   * Exportable action report (JSON + Markdown)
   */
  router.get('/:id/report', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incidentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const incident = await repo.findById(incidentId);
      if (!incident) {
        throw new AppError(404, 'NOT_FOUND', `Incident with ID "${incidentId}" was not found.`);
      }

      const report = reportGenerator.generateExport(incident);
      activityLog.log('REPORT_EXPORTED', `Exported Action Report for Incident ${incident.id}`, incident.id);

      if (req.query.format === 'markdown') {
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="incident-report-${incident.id}.md"`);
        res.send(report.markdown);
        return;
      }

      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/incidents/fusion/candidates
   */
  router.post('/fusion/candidates', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { incident_id } = req.body;
      if (!incident_id) {
        throw new AppError(400, 'MISSING_PARAM', 'incident_id is required to search fusion candidates.');
      }
      const candidates = await fusionService.findCandidates(incident_id);
      res.json({ incident_id, candidates });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/incidents/fusion/preview
   */
  router.post('/fusion/preview', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { primary_id, secondary_id } = FusionPreviewRequestSchema.parse(req.body);
      const preview = await fusionService.previewFusion(primary_id, secondary_id);
      if (!preview) {
        throw new AppError(404, 'NOT_FOUND', 'One or both incidents could not be found for fusion preview.');
      }
      activityLog.log('FUSION_PREVIEWED', `Previewed fusion between ${primary_id} and ${secondary_id}`);
      res.json(preview);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/incidents/fusion/confirm
   * Human explicit confirmation of fusion
   */
  router.post('/fusion/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { primary_id, secondary_id, resolution_notes } = FusionConfirmRequestSchema.parse(req.body);
      const fused = await fusionService.confirmFusion(primary_id, secondary_id, resolution_notes);
      activityLog.log('FUSION_CONFIRMED', `Fused incident ${secondary_id} into ${primary_id}`, primary_id);
      res.json(fused);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/incidents/reset-demo
   * Destructive: protected by server-side admin authorization (see requireAdmin).
   */
  router.post('/reset-demo', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await repo.resetDemoData();
      activityLog.log('DEMO_RESET', 'Demo dataset was reset to default fictional incidents');
      res.json({ message: 'Demo data reset successfully.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
