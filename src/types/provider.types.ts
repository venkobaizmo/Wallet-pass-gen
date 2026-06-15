import { PassData, PassResult } from './pass.types';
import { TrackingConfig, WebhookConfig } from './tracking.types';

export { PassData, PassResult, TrackingConfig, WebhookConfig };

export interface AppleProviderConfig {
  // ── Option 1: supply a .p12 bundle (cert + key in one file) ──────────────
  // The .p12 contains both the pass certificate and private key.
  // WWDR must still be provided separately (wwdrPath / wwdrData).
  p12Path?: string;           // path to .p12 / .pfx file on disk
  p12Data?: Buffer;           // or raw binary Buffer of the .p12
  p12Passphrase?: string;     // passphrase used to protect the .p12

  // ── Option 2: supply cert and key as separate PEM files ──────────────────
  certPath?: string;
  certData?: Buffer | string;
  keyPath?: string;
  keyData?: Buffer | string;
  keyPassphrase?: string;     // passphrase if the PEM key is encrypted

  // ── WWDR certificate (required for both options) ──────────────────────────
  wwdrPath?: string;
  wwdrData?: Buffer | string;

  teamIdentifier: string;
  passTypeIdentifier: string;
  webServiceURL?: string;
  authenticationToken?: string;
}

export interface GoogleProviderConfig {
  serviceAccountEmail?: string;
  serviceAccountKey?: string;
  serviceAccountKeyFile?: string;
  issuerId: string;
  applicationName?: string;
  classId?: string;
}

export type ProviderConfig = AppleProviderConfig | GoogleProviderConfig;

export interface CreatePassOptions {
  overrideBarcode?: boolean;
  validateBeforeCreate?: boolean;
}

export interface UpdatePassOptions {
  pushNotification?: boolean;
}
