import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  geminiApiKey: string | null;
  geminiModel: string;
  corsOrigins: string[];
  adminToken: string | null;
  storageType: 'memory' | 'json';
  demoDataPath: string;
  realDataPath: string;
  maxUploadSizeBytes: number;
  googleMapsApiKey: string | null;
}

/**
 * Local-development CORS allowlist used ONLY when CORS_ORIGIN is not set.
 * These are the documented default origins for the bundled Vite dev/preview servers
 * (5173 = `vite dev`, 5174 = fallback when 5173 is busy, 4173 = `vite preview`).
 * In any real deployment set CORS_ORIGIN to an explicit comma-separated allowlist.
 */
export const DEFAULT_DEV_CORS_ORIGINS: string[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://*.vercel.app'
];

/**
 * Checks whether an incoming request Origin is permitted by the allowlist.
 * Supports exact matches (e.g. 'http://localhost:5173') as well as
 * wildcard subdomain patterns (e.g. 'https://*.vercel.app').
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  for (const pattern of allowedOrigins) {
    if (pattern === origin) return true;
    if (pattern.includes('*')) {
      const regexPattern = '^' + pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[a-zA-Z0-9-_.]+') + '$';
      if (new RegExp(regexPattern, 'i').test(origin)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves the CORS allowlist.
 * - If CORS_ORIGIN is set, it is treated as the authoritative comma-separated allowlist
 *   (only these origins are ever accepted).
 * - If CORS_ORIGIN is unset, the documented local-development defaults are used.
 * There is intentionally NO wildcard/allow-all fallback.
 */
function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim().length === 0) {
    return [...DEFAULT_DEV_CORS_ORIGINS];
  }
  const configured = raw
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);

  // Merge configured origins with default development/preview origins (*.vercel.app, localhost)
  return Array.from(new Set([...configured, ...DEFAULT_DEV_CORS_ORIGINS]));
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  corsOrigins: resolveCorsOrigins(),
  adminToken: process.env.ADMIN_TOKEN || null,
  storageType: (process.env.STORAGE_TYPE as 'memory' | 'json') || 'json',
  demoDataPath: process.env.DEMO_DATA_PATH || './data/demo_incidents.json',
  realDataPath: process.env.REAL_DATA_PATH || './data/incidents.json',
  maxUploadSizeBytes: parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '10485760', 10), // 10MB
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
};
