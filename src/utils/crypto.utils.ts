import crypto from 'crypto';

/**
 * Generate an HMAC-SHA256 signature for a payload.
 */
export function generateHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Verify an HMAC-SHA256 signature against a payload and secret.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyHmacSignature(payload: string, signature: string, secret: string): boolean {
  const expected = generateHmacSignature(payload, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Generate a UUID v4 serial number.
 */
export function generateSerialNumber(): string {
  return crypto.randomUUID();
}

/**
 * Compute a SHA-1 hash of data and return as hex string.
 */
export function hashSHA1(data: Buffer | string): string {
  return crypto.createHash('sha1').update(data).digest('hex');
}

/**
 * Compute a SHA-256 hash of data and return as hex string.
 */
export function hashSHA256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Convert a hex color string to RGB components.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace(/^#/, '');
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    return { r, g, b };
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.substring(0, 2), 16);
    const g = parseInt(normalized.substring(2, 4), 16);
    const b = parseInt(normalized.substring(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

/**
 * Convert a CSS color (hex or rgb()) to Apple's rgb() format.
 */
export function toAppleRgb(color: string): string {
  if (color.startsWith('rgb(') || color.startsWith('RGB(')) {
    return color.toLowerCase().startsWith('rgb(') ? color : color.toLowerCase();
  }
  const rgb = hexToRgb(color);
  if (rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }
  return color;
}

/**
 * Convert a CSS color (hex or rgb()) to Google's #RRGGBB hex format.
 */
export function toGoogleHex(color: string): string {
  if (color.startsWith('#')) {
    return color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
  }
  const rgbMatch = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return color;
}
