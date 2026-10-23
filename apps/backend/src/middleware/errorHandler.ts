import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}

export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public details?: any;

  constructor(statusCode: number, errorCode: string, message: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const timestamp = new Date().toISOString();

  // Handle known AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details,
        timestamp
      }
    });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed.',
        details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
        timestamp
      }
    });
    return;
  }

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    res.status(400).json({
      error: {
        code: 'FILE_UPLOAD_ERROR',
        message: err.message || 'File upload error occurred.',
        timestamp
      }
    });
    return;
  }

  // Handle Gemini specific errors cleanly without leaking keys or stack traces
  const msg = err.message || '';
  if (msg.includes('GEMINI_NOT_CONFIGURED')) {
    res.status(503).json({
      error: {
        code: 'GEMINI_NOT_CONFIGURED',
        message: 'Gemini API key is not configured on the server. Please switch to Demo Mode or configure GEMINI_API_KEY.',
        timestamp
      }
    });
    return;
  }

  if (msg.includes('GEMINI_TIMEOUT')) {
    res.status(504).json({
      error: {
        code: 'GEMINI_TIMEOUT',
        message: 'Gemini API request timed out. Please try again.',
        timestamp
      }
    });
    return;
  }

  if (msg.includes('GEMINI_MALFORMED_OUTPUT') || msg.includes('GEMINI_SCHEMA_VALIDATION_FAILED')) {
    res.status(502).json({
      error: {
        code: 'GEMINI_BAD_OUTPUT',
        message: 'The AI model returned an unparseable or schema-invalid extraction. No data was saved.',
        timestamp
      }
    });
    return;
  }

  if (msg.includes('GEMINI_EXTRACTION_FAILED') || msg.includes('API key not valid')) {
    res.status(502).json({
      error: {
        code: 'GEMINI_SERVICE_ERROR',
        message: 'Gemini extraction service failed. Please check connectivity or model credentials.',
        timestamp
      }
    });
    return;
  }

  // Generic fallback: never leak internal stack traces or secrets
  console.error('[UNHANDLED_ERROR]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
      timestamp
    }
  });
}
