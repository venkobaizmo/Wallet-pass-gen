import { PassData, PassResult } from './pass.types';
import { TrackingConfig, WebhookConfig } from './tracking.types';

export { PassData, PassResult, TrackingConfig, WebhookConfig };

export interface AppleProviderConfig {
  certPath?: string;
  certData?: Buffer | string;
  keyPath?: string;
  keyData?: Buffer | string;
  keyPassphrase?: string;
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
