import { z } from 'zod';
import { PassValidationError } from '../errors';
import { BarcodeType, BarcodeFormat } from '../types/barcode.types';
import {
  PassType,
  TextAlignment,
  DateStyle,
  NumberStyle,
} from '../types/pass.types';
import { WebhookMethod, TrackingEvent } from '../types/tracking.types';

// ─── Barcode ────────────────────────────────────────────────────────────────

const BarcodeConfigSchema = z.object({
  type: z.nativeEnum(BarcodeType),
  value: z.string().min(1, 'Barcode value must not be empty'),
  alternateText: z.string().optional(),
  messageEncoding: z.string().optional(),
  format: z.nativeEnum(BarcodeFormat).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  scale: z.number().positive().optional(),
});

// ─── Pass field ─────────────────────────────────────────────────────────────

const PassFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  value: z.union([z.string(), z.number(), z.date()]),
  changeMessage: z.string().optional(),
  textAlignment: z.nativeEnum(TextAlignment).optional(),
  dateStyle: z.nativeEnum(DateStyle).optional(),
  timeStyle: z.nativeEnum(DateStyle).optional(),
  numberStyle: z.nativeEnum(NumberStyle).optional(),
  currencyCode: z.string().length(3).optional(),
  isRelative: z.boolean().optional(),
});

// ─── Pass style ──────────────────────────────────────────────────────────────

const PassStyleSchema = z.object({
  backgroundColor: z.string().optional(),
  foregroundColor: z.string().optional(),
  labelColor: z.string().optional(),
  stripColor: z.string().optional(),
  logoText: z.string().optional(),
});

// ─── Pass info ───────────────────────────────────────────────────────────────

const PassInfoSchema = z.object({
  serialNumber: z.string().min(1, 'serialNumber is required'),
  description: z.string().min(1, 'description is required'),
  organizationName: z.string().min(1, 'organizationName is required'),
  logoText: z.string().optional(),
  relevantDate: z.date().optional(),
  expirationDate: z.date().optional(),
  voided: z.boolean().optional(),
  userInfo: z.record(z.unknown()).optional(),
  appLaunchURL: z.string().url().optional(),
  associatedStoreIdentifiers: z.array(z.number()).optional(),
  webServiceURL: z.string().url().optional(),
  authenticationToken: z.string().optional(),
});

// ─── Pass image ───────────────────────────────────────────────────────────────

const PassImageSchema = z.object({
  type: z.enum(['logo', 'icon', 'background', 'strip', 'thumbnail', 'footer']),
  data: z.instanceof(Buffer),
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  mimeType: z.enum(['image/png', 'image/jpeg']).optional(),
});

// ─── PassData ─────────────────────────────────────────────────────────────────

const PassDataSchema = z.object({
  type: z.nativeEnum(PassType),
  info: PassInfoSchema,
  style: PassStyleSchema.optional(),
  headerFields: z.array(PassFieldSchema).optional(),
  primaryFields: z.array(PassFieldSchema).optional(),
  secondaryFields: z.array(PassFieldSchema).optional(),
  auxiliaryFields: z.array(PassFieldSchema).optional(),
  backFields: z.array(PassFieldSchema).optional(),
  barcode: BarcodeConfigSchema.optional(),
  images: z.array(PassImageSchema).optional(),
  locations: z
    .array(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        altitude: z.number().optional(),
        relevantText: z.string().optional(),
      }),
    )
    .optional(),
  beacons: z
    .array(
      z.object({
        proximityUUID: z.string().uuid(),
        major: z.number().optional(),
        minor: z.number().optional(),
        relevantText: z.string().optional(),
      }),
    )
    .optional(),
  nfc: z
    .object({
      message: z.string().min(1),
      encryptionPublicKey: z.string().optional(),
      requiresAuthentication: z.boolean().optional(),
    })
    .optional(),
  maxDistance: z.number().positive().optional(),
});

// ─── Apple config ─────────────────────────────────────────────────────────────

const AppleProviderConfigSchema = z.object({
  certPath: z.string().optional(),
  certData: z.union([z.instanceof(Buffer), z.string()]).optional(),
  keyPath: z.string().optional(),
  keyData: z.union([z.instanceof(Buffer), z.string()]).optional(),
  keyPassphrase: z.string().optional(),
  wwdrPath: z.string().optional(),
  wwdrData: z.union([z.instanceof(Buffer), z.string()]).optional(),
  teamIdentifier: z.string().min(1, 'teamIdentifier is required'),
  passTypeIdentifier: z.string().min(1, 'passTypeIdentifier is required'),
  webServiceURL: z.string().url().optional(),
  authenticationToken: z.string().optional(),
});

// ─── Google config ────────────────────────────────────────────────────────────

const GoogleProviderConfigSchema = z.object({
  serviceAccountEmail: z.string().email().optional(),
  serviceAccountKey: z.string().optional(),
  serviceAccountKeyFile: z.string().optional(),
  issuerId: z.string().min(1, 'issuerId is required'),
  applicationName: z.string().optional(),
  classId: z.string().optional(),
});

// ─── Webhook config ───────────────────────────────────────────────────────────

const WebhookConfigSchema = z.object({
  url: z.string().url('Webhook URL must be a valid URL'),
  secret: z.string().optional(),
  method: z.nativeEnum(WebhookMethod).optional(),
  headers: z.record(z.string()).optional(),
  events: z.array(z.nativeEnum(TrackingEvent)).optional(),
  retryAttempts: z.number().int().nonnegative().optional(),
  retryDelay: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
});

// ─── Validator functions ──────────────────────────────────────────────────────

function wrapValidation<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`,
    );
    throw new PassValidationError(
      `${context} validation failed: ${issues.join('; ')}`,
      result.error.issues,
    );
  }
  return result.data;
}

export function validatePassData(data: unknown) {
  return wrapValidation(PassDataSchema, data, 'PassData');
}

export function validateAppleProviderConfig(data: unknown) {
  return wrapValidation(AppleProviderConfigSchema, data, 'AppleProviderConfig');
}

export function validateGoogleProviderConfig(data: unknown) {
  return wrapValidation(GoogleProviderConfigSchema, data, 'GoogleProviderConfig');
}

export function validateWebhookConfig(data: unknown) {
  return wrapValidation(WebhookConfigSchema, data, 'WebhookConfig');
}

export function validateBarcodeConfig(data: unknown) {
  return wrapValidation(BarcodeConfigSchema, data, 'BarcodeConfig');
}
