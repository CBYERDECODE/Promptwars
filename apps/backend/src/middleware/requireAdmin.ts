import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { AppError } from './errorHandler.js';

/**
 * Server-side authorization guard for destructive administrative endpoints
 * (demo-data reset, activity-log purge).
 *
 * Behaviour:
 * - If ADMIN_TOKEN is configured, a matching token MUST be supplied either as
 *   `Authorization: Bearer <token>` or as the `X-Admin-Token: <token>` header.
 *   Comparison is constant-time to avoid timing side channels.
 * - If ADMIN_TOKEN is NOT configured, the guard fails CLOSED in production
 *   (HTTP 503) and only permits the action in local/development environments
 *   so the hackathon demo remains usable.
 */
function extractProvidedToken(req: Request): string | null {
  const authorization = req.headers['authorization'];
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }
  const adminHeader = req.headers['x-admin-token'];
  if (typeof adminHeader === 'string' && adminHeader.trim().length > 0) {
    return adminHeader.trim();
  }
  return null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const configuredToken = config.adminToken;

  if (!configuredToken) {
    if (config.nodeEnv === 'production') {
      next(
        new AppError(
          503,
          'ADMIN_AUTH_NOT_CONFIGURED',
          'This administrative action is disabled: no ADMIN_TOKEN is configured on the server.'
        )
      );
      return;
    }
    // Development/test convenience only — never reaches an operational deployment.
    console.warn(
      '[SECURITY] ADMIN_TOKEN is not configured. A destructive administrative endpoint was permitted in a non-production environment.'
    );
    next();
    return;
  }

  const providedToken = extractProvidedToken(req);
  if (!providedToken || !constantTimeEquals(providedToken, configuredToken)) {
    next(new AppError(401, 'ADMIN_UNAUTHORIZED', 'A valid administrative token is required for this action.'));
    return;
  }

  next();
}
