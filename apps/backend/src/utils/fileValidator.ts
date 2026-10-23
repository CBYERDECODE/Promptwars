export interface FileValidationResult {
  valid: boolean;
  detectedMimeType?: string;
  error?: string;
}

export function validateUploadedFile(
  buffer: Buffer,
  declaredMimeType: string,
  maxSizeBytes: number
): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Empty file provided.' };
  }

  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds the allowed limit of ${(maxSizeBytes / (1024 * 1024)).toFixed(1)} MB.`
    };
  }

  // Magic bytes checks
  // JPEG: FF D8 FF
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  // WEBP: "RIFF" at 0..3 and "WEBP" at 8..11
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  // PDF: %PDF- (25 50 44 46 2D)
  const isPdf = buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';

  let detectedMimeType: string | null = null;
  if (isJpeg) detectedMimeType = 'image/jpeg';
  else if (isPng) detectedMimeType = 'image/png';
  else if (isWebp) detectedMimeType = 'image/webp';
  else if (isPdf) detectedMimeType = 'application/pdf';

  if (!detectedMimeType) {
    return {
      valid: false,
      error: 'Unsupported file format or invalid magic byte signature. Allowed types: JPEG, PNG, WEBP, PDF.'
    };
  }

  // Cross-check declared MIME type against actual signature
  const normalizedDeclared = declaredMimeType.toLowerCase().trim();
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
  
  if (!allowedMimes.includes(normalizedDeclared)) {
    return {
      valid: false,
      error: `MIME type "${declaredMimeType}" is not supported.`
    };
  }

  // Check for spoofed extension/MIME
  if (
    (detectedMimeType === 'image/jpeg' && !normalizedDeclared.includes('jpeg') && !normalizedDeclared.includes('jpg')) ||
    (detectedMimeType === 'image/png' && normalizedDeclared !== 'image/png') ||
    (detectedMimeType === 'image/webp' && normalizedDeclared !== 'image/webp') ||
    (detectedMimeType === 'application/pdf' && normalizedDeclared !== 'application/pdf')
  ) {
    return {
      valid: false,
      error: `File signature (${detectedMimeType}) does not match declared MIME type (${declaredMimeType}). Potential header spoofing detected.`
    };
  }

  return {
    valid: true,
    detectedMimeType
  };
}
