import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { IIncidentRepository } from './repository/types.js';
import { InMemoryIncidentRepository } from './repository/inMemoryRepository.js';
import { JsonFileIncidentRepository } from './repository/jsonFileRepository.js';
import { GeminiExtractionService } from './services/geminiExtraction.js';
import { GroundingVerificationService } from './services/groundingVerification.js';
import { ReportGeneratorService } from './services/reportGenerator.js';
import { FusionService } from './services/fusionService.js';
import { ActivityLogService } from './services/activityLog.js';
import { HashCache } from './utils/hashCache.js';
import { IdempotencyManager } from './utils/idempotency.js';
import { createHealthRouter } from './routes/health.js';
import { createIncidentsRouter } from './routes/incidents.js';
import { createSourcesRouter } from './routes/sources.js';
import { createActivityRouter } from './routes/activity.js';
import { errorHandler, AppError } from './middleware/errorHandler.js';
import { config } from './config.js';

export function createApp(
  customRepo?: IIncidentRepository,
  customGeminiService?: GeminiExtractionService,
  customGroundingService?: GroundingVerificationService
): Express {
  const app = express();

  // Security headers via Helmet
  app.use(helmet({
    contentSecurityPolicy: false // for API server
  }));

  // CORS configuration — strict allowlist only. There is deliberately NO wildcard/allow-all fallback:
  // any browser origin that is not explicitly listed is rejected with 403.
  // Local development origins are documented in config.DEFAULT_DEV_CORS_ORIGINS and can be overridden
  // with the CORS_ORIGIN environment variable (comma-separated list).
  app.use(cors({
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, server-to-server, same-origin) are not
      // subject to CORS enforcement by the browser, so they are allowed through.
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(
        new AppError(403, 'CORS_ORIGIN_DENIED', `Origin "${origin}" is not permitted by the server's CORS policy.`)
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Token', 'Idempotency-Key'],
    credentials: true
  }));

  // Global rate limiter
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP. Please try again after 15 minutes.',
        timestamp: new Date().toISOString()
      }
    }
  });
  app.use(limiter);

  // Body parsing with limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Dependency Initialization
  const repo: IIncidentRepository = customRepo || (
    config.storageType === 'json'
      ? new JsonFileIncidentRepository(config.realDataPath, config.demoDataPath)
      : new InMemoryIncidentRepository()
  );

  const geminiExtractionService = customGeminiService || new GeminiExtractionService();
  const groundingService = customGroundingService || new GroundingVerificationService();
  const reportGenerator = new ReportGeneratorService();
  const fusionService = new FusionService(repo);
  const activityLog = new ActivityLogService();
  const hashCache = new HashCache(30);
  const idempotencyManager = new IdempotencyManager();

  // Mount API Routes
  app.use('/api/health', createHealthRouter(geminiExtractionService, repo));
  app.use(
    '/api/incidents',
    createIncidentsRouter(
      repo,
      geminiExtractionService,
      reportGenerator,
      fusionService,
      activityLog,
      hashCache,
      idempotencyManager
    )
  );
  app.use('/api/sources', createSourcesRouter(groundingService, repo, activityLog));
  app.use('/api/activity', createActivityRouter(activityLog));

  // Serve static frontend in production if built
  const possibleDistPaths = [
    path.join(process.cwd(), 'apps/frontend/dist'),
    path.join(process.cwd(), '../frontend/dist'),
    path.join(process.cwd(), 'dist/public'),
    path.join(process.cwd(), 'public')
  ];

  for (const distPath of possibleDistPaths) {
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
      });
      break;
    }
  }

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
