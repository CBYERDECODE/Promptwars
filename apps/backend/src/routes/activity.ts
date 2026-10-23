import { Router, Request, Response } from 'express';
import { ActivityLogService } from '../services/activityLog.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export function createActivityRouter(activityLog: ActivityLogService): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      entries: activityLog.getRecentLogs()
    });
  });

  // Destructive: purging the audit log is restricted to server-side authorized administrators.
  router.delete('/', requireAdmin, (_req: Request, res: Response) => {
    activityLog.clear();
    res.json({ message: 'Activity log cleared.' });
  });

  return router;
}
